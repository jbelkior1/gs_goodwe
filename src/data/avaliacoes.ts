import { exigirBanco } from './supabase';
import { FORMATOS, REGIOES, SEGMENTOS } from '../domain/catalogo';
import type { FormatoFranquia, SegmentoComercio } from '../domain/types';
import { linkDoApp } from '../ui/QR';

/**
 * Avaliação do local em 3D (gs_vr). O comerciante faz a avaliação numa página estática (foto, marcação
 * da área, Ponto W projetado), que grava uma linha em avaliacoes_local e duas fotos no Storage e devolve
 * o id (?avaliacao=<id>) para o formulário Seja GoodWe. O pedido de franquia carrega o id; a Homologação
 * mostra as fotos e as medidas. Tabela e bucket: supabase/migrations/20261021140000_avaliacoes.sql.
 *
 * Os dados vêm de uma tabela aberta (MVP): tudo que sai daqui é lido de forma defensiva.
 */

// ---------------------------------------------------------------- tipos
export type StatusCabimento = 'cabe' | 'limite' | 'nao';
export type VereditoAvaliacao = 'APROVAR' | 'APROVAR_COM_RESSALVA' | 'REPROVAR';

export interface CabimentoFormato {
  status: StatusCabimento;
  /** quanto o formato exige da área, em metros (vagas de 2,5 x 5 m e a faixa do carregador) */
  exigeLarguraM: number;
  exigeProfundidadeM: number;
  faltaLarguraM: number;
  faltaProfundidadeM: number;
}

export interface DadosAvaliacao {
  /** foto de exemplo do gs_vr (apresentação), não de um local real */
  exemplo: boolean;
  lente: string | null;
  /** área marcada na foto, em metros */
  area: { larguraM: number; profundidadeM: number; areaM2: number };
  /** formato mostrado na projeção: o recomendado ou o que o comerciante escolheu */
  formato: FormatoFranquia | null;
  formatoRecomendado: FormatoFranquia | null;
  cabimento: Partial<Record<FormatoFranquia, CabimentoFormato>>;
  viabilidade: { score: number; horasUsoPrevistas: number; veredito: VereditoAvaliacao | null; parecer: string | null } | null;
  conta: { capex: number | null; resultadoMes: number | null; paybackMeses: number | null } | null;
  segmento: SegmentoComercio | null;
  /** nome como o gs_vr mostra ("São Paulo · Pinheiros") e o id da região do gs_goodwe, se bater */
  regiao: { nome: string; regiaoId: string | null } | null;
  fluxoPessoasDia: number | null;
  entradaEletrica: { ligacao: string | null; disjuntorA: number | null; cargaDisponivelKW: number | null; informada: boolean } | null;
  avisos: string[];
}

export interface AvaliacaoLocal {
  id: string;
  criadoEm: string;
  dados: DadosAvaliacao;
  /** só endereços http(s); null quando ausente ou suspeito */
  fotoUrl: string | null;
  renderUrl: string | null;
  solicitanteId: string | null;
  homologacaoId: string | null;
}

/** O que a avaliação preenche no formulário (só os campos que existem e batem com as opções do app). */
export interface Preenchimento {
  formato?: FormatoFranquia;
  segmento?: SegmentoComercio;
  regiaoId?: string;
  fluxo?: number;
  carga?: number;
}

// ---------------------------------------------------------------- leitura defensiva
const FORMATOS_LISTA = Object.keys(FORMATOS) as FormatoFranquia[];
const STATUS: StatusCabimento[] = ['cabe', 'limite', 'nao'];
const VEREDITOS: VereditoAvaliacao[] = ['APROVAR', 'APROVAR_COM_RESSALVA', 'REPROVAR'];

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const txt = (v: unknown, max = 600): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const formatoDe = (v: unknown): FormatoFranquia | null => (FORMATOS_LISTA.includes(v as FormatoFranquia) ? (v as FormatoFranquia) : null);

/** Só http(s): o endereço vem de uma tabela aberta e vira <img>. */
function urlSegura(v: unknown): string | null {
  const s = txt(v, 2000);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch { return null; }
}

/** Sem acento, minúsculas e espaços simples: "São Paulo · Pinheiros" e "sao paulo · pinheiros" são a mesma região. */
const normalizar = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s*[·•\-–]\s*/g, ' · ').replace(/\s+/g, ' ').trim();

/** "São Paulo · Pinheiros" (como o gs_vr mostra) → id da região do catálogo do gs_goodwe. */
export function regiaoPeloNome(nome: string): string | null {
  const alvo = normalizar(nome);
  return REGIOES.find((r) => normalizar(`${r.cidade} · ${r.zona}`) === alvo)?.id ?? null;
}

/** Valida e normaliza o JSON gravado pelo gs_vr. Devolve null se nem as medidas da área estiverem lá. */
export function lerDadosAvaliacao(bruto: unknown): DadosAvaliacao | null {
  const d = obj(bruto);
  const area = obj(d?.area);
  const larguraM = num(area?.larguraM);
  const profundidadeM = num(area?.profundidadeM);
  if (!d || larguraM == null || profundidadeM == null || larguraM <= 0 || profundidadeM <= 0) return null;

  const cab = obj(d.cabimento);
  const cabimento: DadosAvaliacao['cabimento'] = {};
  for (const f of FORMATOS_LISTA) {
    const c = obj(cab?.[f]);
    const status = STATUS.find((s) => s === c?.status);
    if (!c || !status) continue;
    cabimento[f] = {
      status,
      exigeLarguraM: num(c.exigeLarguraM) ?? 0,
      exigeProfundidadeM: num(c.exigeProfundidadeM) ?? 0,
      faltaLarguraM: num(c.faltaLarguraM) ?? 0,
      faltaProfundidadeM: num(c.faltaProfundidadeM) ?? 0,
    };
  }

  const v = obj(d.viabilidade);
  const score = num(v?.score);
  const horasUso = num(v?.horasUsoPrevistas);
  const conta = obj(d.conta);
  const regiao = obj(d.regiao);
  const nomeRegiao = txt(regiao?.nome, 120);
  const eletrica = obj(d.entradaEletrica);
  const segmento = SEGMENTOS.find((s) => s === d.segmento) ?? null;

  return {
    exemplo: d.exemplo === true,
    lente: txt(obj(d.lente)?.rotulo, 80),
    area: { larguraM, profundidadeM, areaM2: num(area?.areaM2) ?? larguraM * profundidadeM },
    formato: formatoDe(d.formato),
    formatoRecomendado: formatoDe(d.formatoRecomendado),
    cabimento,
    viabilidade: score != null && horasUso != null
      ? { score, horasUsoPrevistas: horasUso, veredito: VEREDITOS.find((x) => x === v?.veredito) ?? null, parecer: txt(v?.parecer) }
      : null,
    conta: conta
      ? { capex: num(conta.capex), resultadoMes: num(conta.resultadoMes), paybackMeses: num(conta.paybackMeses) }
      : null,
    segmento,
    regiao: nomeRegiao ? { nome: nomeRegiao, regiaoId: regiaoPeloNome(nomeRegiao) } : null,
    fluxoPessoasDia: num(d.fluxoPessoasDia),
    entradaEletrica: eletrica
      ? { ligacao: txt(eletrica.ligacao, 12), disjuntorA: num(eletrica.disjuntorA), cargaDisponivelKW: num(eletrica.cargaDisponivelKW), informada: eletrica.informada === true }
      : null,
    avisos: Array.isArray(d.avisos) ? d.avisos.map((a) => txt(a, 300)).filter((a): a is string => a !== null).slice(0, 6) : [],
  };
}

/**
 * Valores do formulário a partir da avaliação. Formato: o que a projeção mostrou, a não ser que ele não
 * caiba na área e outro (o recomendado) caiba. O resto entra só se existir e bater com as opções do app.
 */
export function preenchimentoDaAvaliacao(d: DadosAvaliacao): Preenchimento {
  const p: Preenchimento = {};
  const caberia = (f: FormatoFranquia | null) => f != null && d.cabimento[f]?.status !== 'nao';
  const formato = caberia(d.formato) ? d.formato : (caberia(d.formatoRecomendado) ? d.formatoRecomendado : d.formato);
  if (formato) p.formato = formato;
  if (d.segmento) p.segmento = d.segmento;
  if (d.regiao?.regiaoId) p.regiaoId = d.regiao.regiaoId;
  const fluxo = d.fluxoPessoasDia;
  if (fluxo != null && fluxo >= 1 && fluxo <= 100_000) p.fluxo = Math.round(fluxo);
  const carga = d.entradaEletrica?.cargaDisponivelKW;
  if (carga != null && carga > 0 && carga <= 10_000) p.carga = Math.round(carga * 10) / 10;
  return p;
}

// ---------------------------------------------------------------- banco
/** O id volta na URL do formulário: só letras, números, hífen e sublinhado, curto. */
export const idAvaliacaoValido = (id: string): boolean => /^[A-Za-z0-9_-]{3,40}$/.test(id);

/** Lê a avaliação pelo id. null = não existe (ou veio sem as medidas); erro do banco vira exceção. */
export async function obterAvaliacao(id: string): Promise<AvaliacaoLocal | null> {
  if (!idAvaliacaoValido(id)) return null;
  const { data, error } = await exigirBanco().from('avaliacoes_local').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const dados = lerDadosAvaliacao(data.dados);
  if (!dados) return null;
  return {
    id: String(data.id),
    criadoEm: String(data.criadoEm),
    dados,
    fotoUrl: urlSegura(data.fotoUrl),
    renderUrl: urlSegura(data.renderUrl),
    solicitanteId: typeof data.solicitanteId === 'string' ? data.solicitanteId : null,
    homologacaoId: typeof data.homologacaoId === 'string' ? data.homologacaoId : null,
  };
}

/**
 * Amarra a avaliação ao pedido (e a quem pediu). O vínculo que vale é homologacoes."avaliacaoId", gravado
 * junto com o pedido; este é o caminho de volta. Se falhar, o pedido já existe e não deve ser desfeito.
 */
export async function vincularAvaliacao(avaliacaoId: string, homologacaoId: string, solicitanteId: string): Promise<void> {
  const { error } = await exigirBanco().from('avaliacoes_local').update({ homologacaoId, solicitanteId }).eq('id', avaliacaoId);
  if (error) console.warn(`Avaliação ${avaliacaoId}: não consegui registrar o pedido ${homologacaoId}: ${error.message}`);
}

// ---------------------------------------------------------------- link para o gs_vr
const URL_GSVR_PADRAO = 'https://jbelkior1.github.io/gs_vr/';

/**
 * Endereço do gs_vr já com os três parâmetros que ligam o envio: `retorno` (esta página, na origem
 * pública do app), `api` (URL do Supabase) e `chave` (chave publicável). VITE_URL_GSVR troca o endereço
 * do gs_vr (ex.: http://localhost:5192/ nos testes). null quando o banco não está configurado: sem
 * Supabase o gs_vr não tem para onde enviar.
 */
export function linkAvaliarLocal(): string | null {
  const api = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  const chave = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim();
  if (!api || !chave) return null;
  const configurado = (import.meta.env.VITE_URL_GSVR as string | undefined)?.trim();
  let u: URL;
  try { u = new URL(configurado || URL_GSVR_PADRAO); } catch { u = new URL(URL_GSVR_PADRAO); }
  u.searchParams.set('retorno', linkDoApp('/seja-goodwe'));
  u.searchParams.set('api', api);
  u.searchParams.set('chave', chave);
  return u.toString();
}
