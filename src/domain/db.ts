import { gerarBase, type BaseDados } from './seed';
import { supabase, buscarTudo } from '../data/supabase';
import { geracaoSolarKW } from './engine/solar';
import { MODELOS_CARREGADOR, REGIOES, REGRAS, FORMATOS, VEICULOS } from './catalogo';
import { calcularDemanda, cargaComercioNaHora } from './engine/demanda';
import { cotarPonto, medirOcupacao, type ComposicaoTarifa } from './engine/tarifa';
import { preverDemanda, gerarRecomendacoes, resumoGerencial, detectarAnomalias, preverFinanceiro } from './engine/ia';
import type { PrevisaoFinanceira } from './engine/ia';
import { sessaoAtualDaVaga, sessaoNoTotem } from './engine/totem';
import { diaLocal, horaLocal, minutoLocal } from './tempo';
import { horaMin, horas, kw, mesCurto, num, plural, tarifaKWh } from './formato';
import type {
  Carregador,
  Cobranca,
  KPIsPonto,
  Ponto,
  Regiao,
  Sessao,
  Motorista,
  Veiculo,
} from './types';

/**
 * Camada de acesso a dados (MVP).
 * Com o Supabase configurado, `base` é carregada do banco na abertura e mantida em dia
 * pelo tempo real; sem banco, usa a base simulada local. As telas continuam chamando
 * as mesmas funções síncronas abaixo.
 */

export const base: BaseDados = {
  franqueados: [], pontos: [], carregadores: [], motoristas: [], sessoes: [],
  telemetria: [], cobrancas: [], homologacoes: [], geradoEm: '',
};

const ouvintes = new Set<() => void>();
export function aoMudarBase(f: () => void): () => void {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}
let avisoAgendado = false;
function avisarMudanca() {
  if (avisoAgendado) return;
  avisoAgendado = true;
  setTimeout(() => { avisoAgendado = false; ouvintes.forEach((f) => f()); }, 200);
}

/** estado do canal de tempo real: o totem avisa "sem conexão" quando cai (as telas leem no render) */
export let conexaoTempoReal: 'ok' | 'reconectando' = 'ok';

/** tabela do banco → lista em `base` */
const TABELAS = {
  franqueados: 'franqueados', pontos: 'pontos', carregadores: 'carregadores', motoristas: 'motoristas',
  sessoes: 'sessoes', telemetria: 'telemetria', cobrancas: 'cobrancas', homologacoes: 'homologacoes',
} as const;

/**
 * Quanto histórico de sessões e cobranças cada aparelho baixa ao abrir (o banco guarda tudo).
 * A conta mais longa dos painéis é "30 dias contra os 30 anteriores" (ou o mês contra o mês anterior):
 * olha até ~61 dias para trás. Totem e celular em tela cheia só mostram o que está acontecendo:
 * baixam 2 dias, mais o que ainda está em aberto, e abrem bem mais rápido.
 */
const DIAS_HISTORICO = 62;
const DIAS_QUIOSQUE = 2;
let janelaDias = DIAS_HISTORICO;
/** a base já tem os 62 dias (só vira true quando uma releitura com a janela longa dá certo) */
let historicoCompleto = true;
/** pedido de histórico esperando: uma releitura em andamento ou uma nova tentativa depois de falhar */
let pedirHistorico: (() => void) | null = null;

export async function carregarBase(opcoes: { quiosque?: boolean } = {}): Promise<'banco' | 'local'> {
  if (!supabase) {
    Object.assign(base, gerarBase());
    return 'local';
  }
  janelaDias = opcoes.quiosque ? DIAS_QUIOSQUE : DIAS_HISTORICO;
  historicoCompleto = !opcoes.quiosque;
  // assina antes de ler: o que mudar durante a leitura fica na fila e é aplicado depois
  assinarTempoReal();
  await reler();
  return 'banco';
}

/** Saiu do quiosque para uma tela com relatórios (ex.: "Sair da tela cheia"): baixa o histórico que faltava. */
export function garantirHistorico() {
  if (!supabase || historicoCompleto || pedirHistorico) return;
  janelaDias = DIAS_HISTORICO;
  const tentar = () => {
    if (relendo) return; // a releitura em andamento usou a janela curta: chama de novo quando terminar
    pedirHistorico = null;
    reler()
      .then(() => { historicoCompleto = true; })
      .catch(() => { pedirHistorico = tentar; setTimeout(() => pedirHistorico?.(), 15_000); });
  };
  pedirHistorico = tentar;
  tentar();
}

type Chave = (typeof TABELAS)[keyof typeof TABELAS];
let relendo = false;
const fila: [Chave, any][] = [];

async function reler() {
  relendo = true;
  try {
    Object.assign(base, await buscarBase());
  } finally {
    relendo = false;
    fila.splice(0).forEach(([chave, p]) => aplicar(chave, p));
    avisarMudanca();
    pedirHistorico?.();
  }
}

function aplicar(chave: Chave, p: any) {
  const lista = base[chave] as { id?: unknown }[];
  if (p.eventType === 'DELETE') {
    const i = lista.findIndex((x) => x.id === p.old?.id);
    if (i >= 0) lista.splice(i, 1);
  } else {
    const i = lista.findIndex((x) => x.id === p.new.id);
    if (i >= 0) lista[i] = p.new; else lista.push(p.new);
  }
}

/** sessão que ainda pode mudar de tela (do QR ao Pix): entra sempre, mesmo fora da janela */
const SESSAO_EM_ABERTO = 'ABERTA,AUTENTICADO,CARREGANDO,PAUSADO,ENCERRANDO,CONCLUIDO';

async function buscarBase() {
  const desde = new Date(Date.now() - 6 * 3600_000).toISOString();
  const desdeDia = new Date(Date.now() - janelaDias * 86_400_000).toISOString().slice(0, 10);
  const [franqueados, pontos, carregadores, motoristas, sessoes, telemetria, cobrancas, homologacoes] = await Promise.all([
    buscarTudo<BaseDados['franqueados'][number]>('franqueados'),
    buscarTudo<Ponto>('pontos'),
    buscarTudo<Carregador>('carregadores'),
    buscarTudo<Motorista>('motoristas'),
    buscarTudo<Sessao>('sessoes', (q) => q.or(`inicio.gte.${desdeDia},estado.in.(${SESSAO_EM_ABERTO})`)),
    buscarTudo<BaseDados['telemetria'][number]>('telemetria', (q) => q.gte('ts', desde)),
    buscarTudo<Cobranca>('cobrancas', (q) => q.or(`criadaEm.gte.${desdeDia},status.eq.PENDENTE`)),
    buscarTudo<BaseDados['homologacoes'][number]>('homologacoes'),
  ]);
  return { franqueados, pontos, carregadores, motoristas, sessoes, telemetria, cobrancas, homologacoes,
    geradoEm: new Date().toISOString() };
}

let tempoRealAssinado = false;
function assinarTempoReal() {
  // nova tentativa de carregarBase (a tela de falha do main.tsx repete): o canal já existe e não aceita .on() de novo
  if (tempoRealAssinado) return;
  tempoRealAssinado = true;
  const canal = supabase!.channel('pontow-mvp');
  for (const [tabela, chave] of Object.entries(TABELAS)) {
    canal.on('postgres_changes', { event: '*', schema: 'public', table: tabela }, (p: any) => {
      if (relendo) { fila.push([chave, p]); return; }
      aplicar(chave, p);
      avisarMudanca();
    });
  }
  // depois de uma queda, o que mudou no meio tempo não chega por evento: relê tudo ao reconectar
  // (e tenta de novo a cada 15 s se a releitura falhar)
  let caiu = false;
  const recuperar = () => reler().then(() => { caiu = false; }).catch(() => { setTimeout(recuperar, 15000); });
  canal.subscribe((status, erro) => {
    if (status === 'SUBSCRIBED') {
      if (caiu && !relendo) recuperar();
      conexaoTempoReal = 'ok';
      avisarMudanca();
      return;
    }
    caiu = true;
    conexaoTempoReal = 'reconectando';
    avisarMudanca();
    console.warn('tempo real:', status, erro?.message ?? '');
  });
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__pontow = { base, canal };
}

// ---------------------------------------------------------------- básicos
export const listarPontos = (): Ponto[] => base.pontos;

export const obterPonto = (id: string): Ponto | undefined =>
  base.pontos.find((p) => p.id === id);

export const pontoAtivo = (p: Ponto) => p.ativo && (p.status ?? 'ATIVO') === 'ATIVO';

/** Sessão "da vaga agora" (regra em engine/totem.ts): em andamento ou terminada com o mesmo carro no cabo. */
export const sessaoDaVaga = (carregadorId: string): Sessao | undefined =>
  sessaoAtualDaVaga(base.sessoes.filter((s) => s.carregadorId === carregadorId), base.carregadores.find((c) => c.id === carregadorId)?.carro);

/** A recarga que o TOTEM mostra: a da vaga agora ou, com o cabo já fora, a conta que ficou para pagar. */
export const sessaoParaOTotem = (carregadorId: string, agora = Date.now()): Sessao | undefined =>
  sessaoNoTotem(
    base.sessoes.filter((s) => s.carregadorId === carregadorId),
    base.carregadores.find((c) => c.id === carregadorId)?.carro, cobrancaDaSessao, agora,
  );

/** o agente da vaga manda sinal a cada 20 s; sem sinal há mais de 90 s, a vaga está fora do ar */
// sem banco (base local) ninguém renova o sinal: aí só OFFLINE conta como fora do ar
export const semSinal = (c: Carregador) => !!supabase && Date.now() - new Date(c.ultimoHeartbeat).getTime() > 90_000;

export const sessaoPorCodigo = (codigo: string): Sessao | undefined =>
  base.sessoes.find((s) => s.estado === 'ABERTA' && s.codigoVinculo?.toUpperCase() === codigo.trim().toUpperCase());

/** recarga em andamento (ou a pagar) do motorista */
export const sessaoDoMotorista = (motoristaId?: string | null): Sessao | undefined =>
  motoristaId
    ? base.sessoes
        .filter((s) => s.motoristaId === motoristaId && ['AUTENTICADO', 'CARREGANDO', 'PAUSADO', 'ENCERRANDO', 'CONCLUIDO'].includes(s.estado))
        .sort((a, b) => b.inicio.localeCompare(a.inicio))[0]
    : undefined;

/**
 * O que a tela "Minha recarga" mostra sem id na rota: a recarga em andamento ou, logo depois do Pix,
 * a que acabou de ser paga (para o recibo não sumir no instante do pagamento). `pontoId` restringe
 * a um ponto (o celular do Palco segue só o ponto da demonstração).
 */
export const sessaoRecenteDoMotorista = (motoristaId?: string | null, pontoId?: string | null, reciboMs = 15 * 60_000): Sessao | undefined => {
  if (!motoristaId) return undefined;
  const minhas = base.sessoes
    .filter((s) => s.motoristaId === motoristaId && (!pontoId || s.pontoId === pontoId))
    .sort((a, b) => b.inicio.localeCompare(a.inicio));
  const ativa = minhas.find((s) => ['AUTENTICADO', 'CARREGANDO', 'PAUSADO', 'ENCERRANDO', 'CONCLUIDO'].includes(s.estado));
  if (ativa) return ativa;
  const ultima = minhas[0];
  if (ultima?.estado !== 'FATURADO') return undefined;
  // conta a partir do pagamento (o Pix pode ser pago minutos depois do fim da carga)
  const pagaEm = base.cobrancas.find((c) => c.sessaoId === ultima.id)?.pagaEm ?? ultima.fim;
  return pagaEm && Date.now() - new Date(pagaEm).getTime() < reciboMs ? ultima : undefined;
};

export const obterRegiao = (id: string): Regiao =>
  REGIOES.find((r) => r.id === id) ?? REGIOES[0];

export const regiaoDoPonto = (ponto: Ponto): Regiao => obterRegiao(ponto.regiaoId);

export const carregadoresDoPonto = (pontoId: string): Carregador[] =>
  base.carregadores.filter((c) => c.pontoId === pontoId);

export const obterMotorista = (id?: string | null): Motorista | undefined =>
  base.motoristas.find((m) => m.id === id);

export const obterVeiculo = (id?: string | null): Veiculo | undefined =>
  VEICULOS.find((v) => v.id === id);

export const obterFranqueado = (id: string) =>
  base.franqueados.find((f) => f.id === id);

// ---------------------------------------------------------------- sessões
export const sessoesDoPonto = (pontoId: string): Sessao[] =>
  base.sessoes.filter((s) => s.pontoId === pontoId);

export const sessoesAtivas = (pontoId?: string): Sessao[] =>
  base.sessoes.filter(
    (s) =>
      (s.estado === 'CARREGANDO' || s.estado === 'PAUSADO' || s.estado === 'AUTENTICADO' || s.estado === 'ENCERRANDO') &&
      (!pontoId || s.pontoId === pontoId),
  );

export const obterSessao = (id: string): Sessao | undefined =>
  base.sessoes.find((s) => s.id === id);

export const telemetriaDaSessao = (sessaoId: string) =>
  base.telemetria
    .filter((t) => t.sessaoId === sessaoId)
    .sort((a, b) => a.ts.localeCompare(b.ts));

export const sessoesDoMotorista = (motoristaId: string): Sessao[] =>
  base.sessoes
    .filter((s) => s.motoristaId === motoristaId)
    .sort((a, b) => b.inicio.localeCompare(a.inicio));

// ---------------------------------------------------------------- cobranças
export const cobrancasDoPonto = (pontoId: string): Cobranca[] =>
  base.cobrancas.filter((c) => c.pontoId === pontoId);

export const cobrancaDaSessao = (sessaoId: string): Cobranca | undefined =>
  base.cobrancas.find((c) => c.sessaoId === sessaoId);

// ---------------------------------------------------------------- períodos
// mês de Brasília, não o do aparelho
const inicioDoMes = (): number => Date.parse(`${diaLocal().slice(0, 8)}01T00:00:00-03:00`);

export const noMesAtual = (isoDate: string): boolean =>
  new Date(isoDate).getTime() >= inicioDoMes();

export const ultimosDias = (isoDate: string, dias: number): boolean =>
  new Date(isoDate).getTime() >= Date.now() - dias * 86400000;

// ---------------------------------------------------------------- relógio, períodos e cache (Brasília)
/** dia, hora e minuto de Brasília de um instante ISO. Tem cache: a base tem milhares de linhas. */
const cacheQuando = new Map<string, { dia: string; hora: number; min: number }>();
function quando(iso: string) {
  let v = cacheQuando.get(iso);
  if (!v) {
    if (cacheQuando.size > 80_000) cacheQuando.clear();
    v = { dia: diaLocal(iso), hora: horaLocal(iso), min: minutoLocal(iso) };
    cacheQuando.set(iso, v);
  }
  return v;
}

/** resultados caros ficam guardados até a base mudar (ou passarem 30 s, por causa do "agora") */
let versaoDados = 0;
aoMudarBase(() => { versaoDados++; });
const guardados = new Map<string, { chave: string; valor: unknown }>();
function guardar<T>(nome: string, calcular: () => T): T {
  const chave = [versaoDados, base.geradoEm, base.sessoes.length, base.cobrancas.length, base.pontos.length,
    base.carregadores.length, base.homologacoes.length, Math.floor(Date.now() / 30_000)].join('|');
  const g = guardados.get(nome);
  if (g && g.chave === chave) return g.valor as T;
  if (guardados.size > 600) guardados.clear();
  const valor = calcular();
  guardados.set(nome, { chave, valor });
  return valor;
}

// chaves de dia 'AAAA-MM-DD' somadas ao meio-dia UTC (nunca cai em outro dia por fuso)
const meioDia = (chave: string) => Date.UTC(+chave.slice(0, 4), +chave.slice(5, 7) - 1, +chave.slice(8, 10), 12);
export const somaDias = (chave: string, n: number): string =>
  new Date(meioDia(chave) + n * 86_400_000).toISOString().slice(0, 10);
const diasDoMes = (chave: string) => new Date(Date.UTC(+chave.slice(0, 4), +chave.slice(5, 7), 0)).getUTCDate();
const ddmm = (chave: string) => `${chave.slice(8, 10)}/${chave.slice(5, 7)}`;
const mesDaChave = (chave: string) => mesCurto(new Date(meioDia(chave)));
/** "7–13 out" dentro do mesmo mês; "22/08–20/09" quando atravessa meses */
const nomeDaJanela = (ini: string, fim: string) =>
  ini.slice(0, 7) === fim.slice(0, 7)
    ? `${Number(ini.slice(8))}–${Number(fim.slice(8))} ${mesDaChave(fim)}`
    : `${ddmm(ini)}–${ddmm(fim)}`;

export type PeriodoId = 'mes' | '7d' | '30d';
export const PERIODOS: { id: PeriodoId; rotulo: string }[] = [
  { id: 'mes', rotulo: 'Mês atual' },
  { id: '7d', rotulo: '7 dias' },
  { id: '30d', rotulo: '30 dias' },
];

export interface Periodo {
  id: PeriodoId;
  rotulo: string;
  /** 'AAAA-MM-DD' em Brasília, inclusive */
  inicio: string;
  fim: string;
  /** dias do calendário da janela (hoje conta inteiro) */
  dias: number;
  /** dias corridos de verdade: hoje entra só pela fração que já passou */
  diasDecorridos: number;
  /** dias do mês (mês atual) ou 30: base do ritmo mensal */
  diasRef: number;
  /** minutos já passados hoje (corte para comparar com o mesmo horário do período anterior) */
  minutosHoje: number;
  /** janela de mesma duração logo antes; `base` é o texto "vs 1–20 set" */
  anterior: { inicio: string; fim: string; base: string; cortarUltimoDia: boolean };
}

export function periodoDe(id: PeriodoId, agora = new Date()): Periodo {
  const hoje = diaLocal(agora);
  const minutosHoje = horaLocal(agora) * 60 + minutoLocal(agora);
  const frac = minutosHoje / 1440;
  if (id === 'mes') {
    const inicio = `${hoje.slice(0, 8)}01`;
    const n = Number(hoje.slice(8, 10));
    const mesAnt = `${somaDias(inicio, -1).slice(0, 8)}01`;
    const nAnt = Math.min(n, diasDoMes(mesAnt));
    return {
      id, rotulo: 'Mês atual', inicio, fim: hoje, dias: n,
      diasDecorridos: Math.max(1, n - 1 + frac), diasRef: diasDoMes(hoje), minutosHoje,
      anterior: {
        inicio: mesAnt, fim: somaDias(mesAnt, nAnt - 1),
        base: `vs 1–${nAnt} ${mesDaChave(mesAnt)}`, cortarUltimoDia: nAnt === n,
      },
    };
  }
  const n = id === '7d' ? 7 : 30;
  const inicio = somaDias(hoje, -(n - 1));
  const iniAnt = somaDias(inicio, -n);
  const fimAnt = somaDias(hoje, -n);
  return {
    id, rotulo: `${n} dias`, inicio, fim: hoje, dias: n,
    diasDecorridos: n - 1 + Math.max(frac, 1 / 1440), diasRef: 30, minutosHoje,
    anterior: { inicio: iniAnt, fim: fimAnt, base: `vs ${nomeDaJanela(iniAnt, fimAnt)}`, cortarUltimoDia: true },
  };
}

/** variação (fração) de `atual` sobre `antes`; null quando não há base para comparar */
export const variacao = (atual: number, antes: number): number | null => (antes > 0 ? (atual - antes) / antes : null);

/** instante mais recente que já entrou nas contas ("dados até"), ISO; '' se a base está vazia */
export function dadosAte(pontoId?: string | null): string {
  return guardar(`ate|${pontoId ?? '*'}`, () => {
    let max = 0;
    const agora = Date.now();
    for (const s of base.sessoes) {
      if (pontoId && s.pontoId !== pontoId) continue;
      const t = new Date(s.fim ?? s.inicio).getTime();
      if (t > max && t <= agora) max = t;
    }
    for (const c of base.cobrancas) {
      if (pontoId && c.pontoId !== pontoId) continue;
      const t = new Date(c.pagaEm ?? c.criadaEm).getTime();
      if (t > max && t <= agora) max = t;
    }
    return max ? new Date(max).toISOString() : '';
  });
}

// ---------------------------------------------------------------- KPIs
interface Agregado {
  sessoes: number; energia: number; horas: number;
  receita: number; custoEnergia: number; royalties: number; gateway: number; liquido: number;
}
const novoAgregado = (): Agregado => ({
  sessoes: 0, energia: 0, horas: 0, receita: 0, custoEnergia: 0, royalties: 0, gateway: 0, liquido: 0,
});
const FECHADAS = ['CONCLUIDO', 'FATURADO'];

/** soma, por ponto, o que aconteceu entre dois dias de Brasília (sessões fechadas e cobranças pagas) */
function agregarPorPonto(de: string, ate: string, cortarUltimoDia: boolean, corteMin: number): Map<string, Agregado> {
  return guardar(`ag|${de}|${ate}|${cortarUltimoDia ? corteMin : '-'}`, () => {
    const mapa = new Map<string, Agregado>();
    const pegar = (id: string) => {
      let a = mapa.get(id);
      if (!a) { a = novoAgregado(); mapa.set(id, a); }
      return a;
    };
    const utcMin = somaDias(de, -1);
    const utcMax = somaDias(ate, 1);
    const dentro = (iso: string) => {
      const u = iso.slice(0, 10);
      if (u < utcMin || u > utcMax) return false;
      const q = quando(iso);
      if (q.dia < de || q.dia > ate) return false;
      return !(cortarUltimoDia && q.dia === ate && q.hora * 60 + q.min > corteMin);
    };
    for (const s of base.sessoes) {
      if (!FECHADAS.includes(s.estado) || !dentro(s.inicio)) continue;
      const a = pegar(s.pontoId);
      a.sessoes += 1;
      a.energia += s.energiaKWh;
      if (s.fim) a.horas += (new Date(s.fim).getTime() - new Date(s.inicio).getTime()) / 3_600_000;
    }
    for (const c of base.cobrancas) {
      if (c.status !== 'PAGO' || !dentro(c.criadaEm)) continue;
      const a = pegar(c.pontoId);
      a.receita += c.valor;
      a.custoEnergia += c.custoEnergia;
      a.royalties += c.royaltyGoodWe + c.fundoMarketing;
      a.gateway += c.gateway;
      a.liquido += c.liquidoLojista;
    }
    return mapa;
  });
}

/** os dois lados da comparação: o período e a janela de mesma duração logo antes */
function agregadosDoPeriodo(p: Periodo) {
  return {
    atual: agregarPorPonto(p.inicio, p.fim, false, 0),
    antes: agregarPorPonto(p.anterior.inicio, p.anterior.fim, p.anterior.cortarUltimoDia, p.minutosHoje),
  };
}

const somar = (ags: (Agregado | undefined)[]): Agregado => {
  const t = novoAgregado();
  for (const a of ags) {
    if (!a) continue;
    (Object.keys(t) as (keyof Agregado)[]).forEach((k) => { t[k] += a[k]; });
  }
  return t;
};

const DIA_MS = 86_400_000;
/** início do dia 'AAAA-MM-DD' em Brasília (UTC−3, sem horário de verão desde 2019) */
const inicioDoDia = (chave: string) => Date.parse(`${chave}T00:00:00-03:00`);

/** dias corridos da janela [início, início + dias) em que o ponto já operava (conta da inauguração) */
function diasOperando(ponto: Ponto | undefined, inicio: string, dias: number): number {
  if (!ponto || !pontoAtivo(ponto)) return 0;
  const ini = inicioDoDia(inicio);
  const desde = ponto.inauguradoEm ? Math.max(ini, new Date(ponto.inauguradoEm).getTime()) : ini;
  return Math.max(0, Math.min(dias, (ini + dias * DIA_MS - desde) / DIA_MS));
}

/** duração da janela anterior: o mês anterior pode ser mais curto e aí entra inteiro */
function diasDaAnterior(p: Periodo): number {
  const n = Math.round((inicioDoDia(p.anterior.fim) - inicioDoDia(p.anterior.inicio)) / DIA_MS) + 1;
  return p.anterior.cortarUltimoDia ? n - 1 + p.minutosHoje / 1440 : n;
}

/** mensalidade da plataforma pelos dias em que o ponto operou na janela */
const plataformaDosDias = (dias: number, p: Periodo) => (REGRAS.plataformaMes * dias) / p.diasRef;

export interface ResumoPeriodo {
  periodo: Periodo;
  sessoes: number; energia: number; receita: number; custoEnergia: number; royalties: number; gateway: number;
  /** o que sobra para o comércio antes da mensalidade da plataforma */
  liquidoBruto: number;
  /** mensalidade da plataforma proporcional aos dias do período */
  plataforma: number;
  /** liquidoBruto − plataforma */
  resultado: number;
  ticketMedio: number;
  horas: number; vagas: number;
  /** horas de recarga por vaga por dia */
  horasUsoDia: number;
  anterior: { sessoes: number; energia: number; receita: number; resultado: number; horasUsoDia: number };
  /** fração vs janela anterior; null = sem base de comparação */
  variacao: { sessoes: number | null; energia: number | null; receita: number | null; resultado: number | null; horasUsoDia: number | null };
  /** nenhuma recarga fechada no período */
  semDados: boolean;
}

function montarResumo(p: Periodo, a: Agregado, antes: Agregado, vagas: number, diasOp: number, diasOpAnt: number): ResumoPeriodo {
  const plat = plataformaDosDias(diasOp, p);
  const usoDia = (g: Agregado, dias: number) => (vagas > 0 && dias > 0 ? g.horas / dias / vagas : 0);
  const resultado = a.liquido - plat;
  const resultadoAntes = antes.liquido - plataformaDosDias(diasOpAnt, p);
  return {
    periodo: p,
    sessoes: a.sessoes, energia: a.energia, receita: a.receita, custoEnergia: a.custoEnergia,
    royalties: a.royalties, gateway: a.gateway,
    liquidoBruto: a.liquido, plataforma: plat, resultado,
    ticketMedio: a.sessoes ? a.receita / a.sessoes : 0,
    horas: a.horas, vagas, horasUsoDia: usoDia(a, diasOp),
    anterior: {
      sessoes: antes.sessoes, energia: antes.energia, receita: antes.receita,
      resultado: resultadoAntes, horasUsoDia: usoDia(antes, diasOpAnt),
    },
    variacao: {
      sessoes: variacao(a.sessoes, antes.sessoes),
      energia: variacao(a.energia, antes.energia),
      receita: variacao(a.receita, antes.receita),
      resultado: resultadoAntes > 0 ? variacao(resultado, resultadoAntes) : null,
      horasUsoDia: variacao(usoDia(a, diasOp), usoDia(antes, diasOpAnt)),
    },
    semDados: a.sessoes === 0 && a.receita === 0,
  };
}

/** números de um ponto num período, já comparados com a janela anterior de mesma duração */
export function resumoDoPonto(pontoId: string, id: PeriodoId = 'mes'): ResumoPeriodo {
  return guardar(`rp|${pontoId}|${id}`, () => {
    const p = periodoDe(id);
    const { atual, antes } = agregadosDoPeriodo(p);
    const ponto = obterPonto(pontoId);
    return montarResumo(
      p, atual.get(pontoId) ?? novoAgregado(), antes.get(pontoId) ?? novoAgregado(),
      carregadoresDoPonto(pontoId).length,
      diasOperando(ponto, p.inicio, p.diasDecorridos), diasOperando(ponto, p.anterior.inicio, diasDaAnterior(p)),
    );
  });
}

const r2 = (v: number) => Number(v.toFixed(2));

export function kpisDoPonto(pontoId: string): KPIsPonto {
  const r = resumoDoPonto(pontoId, 'mes');
  return {
    pontoId,
    energiaMesKWh: Number(r.energia.toFixed(1)),
    sessoesMes: r.sessoes,
    faturamentoMes: r2(r.receita),
    custoEnergiaMes: r2(r.custoEnergia),
    royaltiesMes: r2(r.royalties),
    // a mensalidade da plataforma começa quando o ponto entra em operação e conta só os dias decorridos
    liquidoMes: r2(r.resultado),
    horasUsoDia: r2(r.horasUsoDia),
    ocupacaoPct: Number(Math.min(1, r.horasUsoDia / 12).toFixed(3)),
    ticketMedio: r2(r.ticketMedio),
  };
}

export interface DiaSerie {
  /** 'AAAA-MM-DD' em Brasília */
  chave: string;
  /** 'dd/mm' */
  dia: string;
  energia: number;
  faturamento: number;
  sessoes: number;
  /** hoje: o dia ainda não terminou */
  parcial: boolean;
  /** média móvel dos 7 dias até este (inclusive); null em hoje, que é parcial */
  mediaFaturamento: number | null;
  mediaEnergia: number | null;
  mediaSessoes: number | null;
}

/**
 * Série diária (energia, receita e sessões fechadas) dos últimos `dias` dias de Brasília, com hoje
 * marcado como parcial e a média móvel de 7 dias. Soma as mesmas coisas que os KPIs do período.
 */
export function serieDiaria(pontoId: string | null, dias = 30): DiaSerie[] {
  return guardar(`serie|${pontoId ?? '*'}|${dias}`, () => {
    const hoje = diaLocal();
    const inicio = somaDias(hoje, -(dias - 1));
    // 6 dias a mais antes da janela, só para a média móvel já nascer completa
    const inicioMedia = somaDias(inicio, -6);
    const mapa = new Map<string, { energia: number; faturamento: number; sessoes: number }>();
    for (let d = inicioMedia; d <= hoje; d = somaDias(d, 1)) mapa.set(d, { energia: 0, faturamento: 0, sessoes: 0 });
    const utcMin = somaDias(inicioMedia, -1);
    const utcMax = somaDias(hoje, 1);
    const dentro = (iso: string) => {
      const u = iso.slice(0, 10);
      return u >= utcMin && u <= utcMax;
    };

    for (const s of base.sessoes) {
      if ((pontoId && s.pontoId !== pontoId) || !FECHADAS.includes(s.estado) || !dentro(s.inicio)) continue;
      const item = mapa.get(quando(s.inicio).dia);
      if (item) { item.energia += s.energiaKWh; item.sessoes += 1; }
    }
    for (const c of base.cobrancas) {
      if ((pontoId && c.pontoId !== pontoId) || c.status !== 'PAGO' || !dentro(c.criadaEm)) continue;
      const item = mapa.get(quando(c.criadaEm).dia);
      if (item) item.faturamento += c.valor;
    }

    const todos = Array.from(mapa.entries());
    const media = (j: number, campo: 'energia' | 'faturamento' | 'sessoes') =>
      todos.slice(j - 6, j + 1).reduce((t, [, v]) => t + v[campo], 0) / 7;
    return todos.slice(6).map(([chave, v], i) => {
      const j = i + 6;
      const parcial = chave === hoje;
      return {
        chave, dia: ddmm(chave), parcial,
        energia: Number(v.energia.toFixed(1)),
        faturamento: Number(v.faturamento.toFixed(2)),
        sessoes: v.sessoes,
        mediaFaturamento: parcial ? null : Number(media(j, 'faturamento').toFixed(2)),
        mediaEnergia: parcial ? null : Number(media(j, 'energia').toFixed(1)),
        mediaSessoes: parcial ? null : Number(media(j, 'sessoes').toFixed(2)),
      };
    });
  });
}

/** a série do período escolhido no painel (mês atual = do dia 1 até hoje) */
export const serieDoPeriodo = (pontoId: string | null, id: PeriodoId): DiaSerie[] =>
  serieDiaria(pontoId, periodoDe(id).dias);

/** Média de sessões e de energia por dia, para cada hora do dia, no período (hora de Brasília). */
export function perfilHorario(pontoId: string | null, id: PeriodoId = '30d') {
  return guardar(`perfil|${pontoId ?? '*'}|${id}`, () => {
    const p = periodoDe(id);
    const horas = Array.from({ length: 24 }, (_, h) => ({ hora: h, total: 0, energiaTotal: 0 }));
    const utcMin = somaDias(p.inicio, -1);
    const utcMax = somaDias(p.fim, 1);
    for (const s of base.sessoes) {
      if ((pontoId && s.pontoId !== pontoId) || !FECHADAS.includes(s.estado)) continue;
      const u = s.inicio.slice(0, 10);
      if (u < utcMin || u > utcMax) continue;
      const q = quando(s.inicio);
      if (q.dia < p.inicio || q.dia > p.fim) continue;
      horas[q.hora].total += 1;
      horas[q.hora].energiaTotal += s.energiaKWh;
    }
    return horas.map((x) => ({
      hora: x.hora,
      /** soma no período */
      total: x.total,
      /** média de sessões por dia do período */
      sessoes: x.total / p.diasDecorridos,
      energia: x.energiaTotal / p.diasDecorridos,
    }));
  });
}

// ---------------------------------------------------------------- demanda
/** Estado atual do controle de demanda de um ponto. */
export function demandaDoPonto(pontoId: string) {
  const ponto = obterPonto(pontoId)!;
  const carregadores = carregadoresDoPonto(pontoId);
  const ativas = sessoesAtivas(pontoId);
  const h = horaLocal();
  // o sol gerando no ponto alivia a entrada elétrica: o motor enxerga a carga líquida
  const cargaComercioKW = Math.max(0, cargaComercioNaHora(ponto, h) - geracaoSolarKW(ponto, h));

  const potenciaMaxPorSessao: Record<string, number> = {};
  for (const s of ativas) {
    const v = obterVeiculo(s.veiculoId);
    potenciaMaxPorSessao[s.id] = v?.potenciaMaxACkW ?? 7;
  }

  return calcularDemanda(
    { ponto, carregadores, sessoesAtivas: ativas, cargaComercioKW },
    potenciaMaxPorSessao,
  );
}

// ---------------------------------------------------------------- tarifa
/**
 * Ocupação do ponto na regra da escassez: só vagas operantes contam e quem cota entra na conta
 * (`vagaPropriaId` é a vaga da sessão cotada; sem ela, entra como mais um motorista chegando).
 */
export function ocupacaoDoPonto(pontoId: string, vagaPropriaId?: string) {
  return medirOcupacao(carregadoresDoPonto(pontoId), (vagaId) => !!sessaoDaVaga(vagaId), vagaPropriaId);
}

/** Preço do kWh agora (hora e dia de Brasília). Ponto que não está ATIVO devolve `previa = true`. */
export function tarifaAtual(pontoId: string, vagaPropriaId?: string): ComposicaoTarifa {
  const ponto = obterPonto(pontoId)!;
  return cotarPonto(ponto, regiaoDoPonto(ponto), carregadoresDoPonto(pontoId), (vagaId) => !!sessaoDaVaga(vagaId),
    new Date(), vagaPropriaId, !pontoAtivo(ponto));
}

/** Cotação de uma sessão aberta: o preço de agora para aquela vaga (ela já conta como ocupada). */
export const tarifaDaSessao = (sessao: Sessao): ComposicaoTarifa => tarifaAtual(sessao.pontoId, sessao.carregadorId);

/** Preço da sessão aberta, como o totem e o app devem mostrar e cobrar. */
export interface CotacaoSessao {
  precoKWh: number;
  /** até quando o preço do totem vale (só existe quando está travado) */
  validaAte?: Date;
  /** true: o preço cotado no totem continua valendo; false: a cotação venceu (ou nunca existiu) e foi refeita agora */
  travada: boolean;
  /** preço antigo, quando a cotação venceu e o preço mudou */
  anterior?: number;
  composicao: ComposicaoTarifa;
}

/**
 * Preço travado da sessão ABERTA: vale por REGRAS.codigoValidadeMin minutos a partir de `sessao.inicio`
 * e NÃO é recalculado. Fora da validade (ou sem preço, ou com preço <= 0) cota de novo, nunca devolve 0.
 */
export function cotacaoDaSessao(sessao: Sessao, agora = Date.now()): CotacaoSessao {
  const preco = Number(sessao.tarifaAplicadaKWh);
  const validaAte = new Date(new Date(sessao.inicio).getTime() + REGRAS.codigoValidadeMin * 60_000);
  if (preco > 0 && agora <= validaAte.getTime()) {
    return { precoKWh: preco, validaAte, travada: true, composicao: composicaoNoInicio(sessao, preco) };
  }
  const nova = tarifaDaSessao(sessao);
  return { precoKWh: nova.precoFinalKWh, travada: false, anterior: preco > 0 ? preco : undefined, composicao: nova };
}

/** As linhas de explicação do preço travado, refeitas na hora da cotação; se não batem com o preço gravado, só informa a hora. */
function composicaoNoInicio(sessao: Sessao, preco: number): ComposicaoTarifa {
  const ponto = obterPonto(sessao.pontoId)!;
  const inicio = new Date(sessao.inicio);
  const c = cotarPonto(ponto, regiaoDoPonto(ponto), carregadoresDoPonto(sessao.pontoId), (vagaId) => !!sessaoDaVaga(vagaId),
    inicio, sessao.carregadorId);
  if (Math.abs(c.precoFinalKWh - preco) < 0.005) return c;
  return { ...c, precoFinalKWh: preco, proxima: undefined, explicacao: [`Preço cotado no totem às ${horaMin(inicio)}`] };
}

// ---------------------------------------------------------------- IA
export function inteligenciaDoPonto(pontoId: string) {
  const ponto = obterPonto(pontoId)!;
  const carregadores = carregadoresDoPonto(pontoId);
  const historico = sessoesDoPonto(pontoId).filter((s) => s.estado === 'FATURADO');
  const kpis = kpisDoPonto(pontoId);

  const previsao = preverDemanda(historico, carregadores.length);
  const recomendacoes = gerarRecomendacoes(ponto, kpis, previsao);
  const resumo = resumoGerencial(ponto, kpis, previsao, historico.length);
  const anomalias = detectarAnomalias(ponto, carregadores, historico, new Date());

  return { previsao, recomendacoes, resumo, anomalias, kpis };
}

// ---------------------------------------------------------------- situação dos pontos e das vagas
export type StatusPonto = 'INSTALACAO' | 'ATIVO' | 'SUSPENSO';
export const statusDoPonto = (p: Ponto): StatusPonto => p.status ?? (p.ativo ? 'ATIVO' : 'INSTALACAO');

/** ponto inaugurado há menos de 14 dias ainda está se firmando: não entra nos alertas de uso */
const pontoMaduro = (p: Ponto) =>
  !p.inauguradoEm || Date.now() - new Date(p.inauguradoEm).getTime() > 14 * 86_400_000;

/** em operação, maduro, com pelo menos 3 dias de mês e uso por vaga abaixo da meta */
function abaixoDoLimiar(p: Ponto): boolean {
  if (!pontoAtivo(p) || !pontoMaduro(p)) return false;
  const r = resumoDoPonto(p.id, 'mes');
  return r.periodo.diasDecorridos >= 3 && r.horasUsoDia < REGRAS.limiarViabilidadeHoras;
}

const haTempo = (iso: string) => {
  const min = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60_000);
  return min >= 120 ? `${num(min / 60)} h` : `${num(min)} min`;
};

const vagaSemSinal = (c: Carregador) => c.estado === 'OFFLINE' || semSinal(c);

export interface SituacaoVaga {
  /** chave do StatusBadge */
  estado: string;
  /** o que está acontecendo na vaga, em uma frase */
  texto: string;
  sessao?: Sessao;
  /** código do QR, enquanto a sessão está ABERTA */
  codigo?: string;
}

/** O estado da vaga em palavras, para o painel do franqueado e o controle de demanda. */
export function situacaoDaVaga(c: Carregador): SituacaoVaga {
  const ponto = obterPonto(c.pontoId);
  const status = ponto ? statusDoPonto(ponto) : 'ATIVO';
  if (status === 'INSTALACAO') return { estado: 'INSTALACAO', texto: 'Aguardando a ativação do ponto' };
  if (status === 'SUSPENSO') return { estado: 'SUSPENSO', texto: 'Ponto suspenso — a vaga não aceita recargas' };
  if (c.estado === 'MANUTENCAO') return { estado: 'MANUTENCAO', texto: 'Em manutenção — não aceita recargas' };
  if (c.estado === 'OFFLINE') {
    return { estado: 'OFFLINE', texto: `Sem comunicação com o carregador (último sinal há ${haTempo(c.ultimoHeartbeat)})` };
  }
  if (semSinal(c)) return { estado: 'SEM_SINAL', texto: `Sem sinal há ${haTempo(c.ultimoHeartbeat)}` };

  const s = sessaoDaVaga(c.id);
  if (s) {
    switch (s.estado) {
      case 'ABERTA': {
        const codigo = s.codigoVinculo ?? '';
        const resta = new Date(s.inicio).getTime() + REGRAS.codigoValidadeMin * 60_000 - Date.now();
        const validade = resta > 0 ? ` · vale por mais ${num(Math.ceil(resta / 60_000))} min` : ' · código vencido';
        return { estado: 'ABERTA', sessao: s, codigo, texto: `Aguardando o motorista ler o QR (código ${codigo})${validade}` };
      }
      case 'AUTENTICADO':
        return { estado: 'AUTENTICADO', sessao: s, texto: 'Motorista identificado — liberando a potência' };
      case 'CARREGANDO':
        return { estado: 'CARREGANDO', sessao: s, texto: `Carregando · ${kw(s.potenciaAtualKW)} · bateria em ${num(s.socAtual)}%` };
      case 'PAUSADO':
        return { estado: 'PAUSADO', sessao: s, texto: `Recarga pausada${s.motivoPausa ? `: ${s.motivoPausa}` : ''}` };
      case 'ENCERRANDO':
        return { estado: 'ENCERRANDO', sessao: s, texto: 'Encerrando e fechando a conta' };
      case 'CONCLUIDO':
        return { estado: 'CONCLUIDO', sessao: s, texto: 'Recarga concluída — aguardando o pagamento por Pix' };
      case 'FATURADO':
        return { estado: 'PAGO', sessao: s, texto: 'Paga — o carro ainda está no cabo' };
    }
  }
  // código venceu com o mesmo carro ainda no cabo: o motorista precisa reconectar para gerar outro
  const ultima = base.sessoes.filter((x) => x.carregadorId === c.id).sort((a, b) => b.inicio.localeCompare(a.inicio))[0];
  if (c.carro && ultima?.estado === 'EXPIRADA' && c.carro.sessaoId === ultima.id) {
    return { estado: 'EXPIRADA', sessao: ultima, texto: 'Código vencido — desconecte e conecte o cabo de novo para gerar outro' };
  }
  if (c.estado === 'OCUPADO' || c.carro) return { estado: 'OCUPADO', texto: 'Carro conectado — abrindo a recarga' };
  return { estado: 'DISPONIVEL', texto: 'Livre — pronta para receber um carro' };
}

// ---------------------------------------------------------------- o que precisa de atenção
export interface ItemAtencao {
  id: string;
  severidade: 'critico' | 'atencao' | 'info';
  titulo: string;
  detalhe: string;
  pontoId?: string;
  acao?: { rotulo: string; to: string };
}
const ORDEM_SEVERIDADE = { critico: 0, atencao: 1, info: 2 } as const;
const porSeveridade = (a: ItemAtencao, b: ItemAtencao) => ORDEM_SEVERIDADE[a.severidade] - ORDEM_SEVERIDADE[b.severidade];

/** Recomendações da IA, anomalias e vagas sem sinal de um ponto em operação, da mais grave para a mais leve. */
export function atencaoDoPonto(pontoId: string): ItemAtencao[] {
  return guardar(`atencao|${pontoId}`, () => {
    const ponto = obterPonto(pontoId);
    if (!ponto) return [];
    const status = statusDoPonto(ponto);
    if (status === 'SUSPENSO') {
      return [{
        id: `susp-${ponto.id}`, severidade: 'critico', titulo: 'Ponto suspenso',
        detalhe: 'O ponto não aceita novas recargas. O histórico continua disponível; fale com a GoodWe para reativar.',
      }];
    }
    if (status !== 'ATIVO') return [];

    const itens: ItemAtencao[] = [];
    const { recomendacoes, anomalias } = inteligenciaDoPonto(pontoId);
    const firme = pontoMaduro(ponto) && resumoDoPonto(pontoId, 'mes').periodo.diasDecorridos >= 3;
    for (const r of recomendacoes) {
      if (r.id.startsWith('rec-limiar') && !firme) continue;
      itens.push({
        id: r.id, severidade: r.severidade, titulo: r.titulo, detalhe: r.detalhe,
        acao: { rotulo: 'Ajustar a tarifa', to: '/franqueado/financeiro' },
      });
    }
    for (const a of anomalias) {
      // vaga sem comunicação é tratada vaga a vaga, logo abaixo
      if (a.carregadorId) continue;
      itens.push({
        id: a.id, severidade: 'atencao', titulo: a.tipo, detalhe: a.detalhe,
        acao: { rotulo: 'Ver as vagas', to: '/franqueado/ponto' },
      });
    }
    for (const c of carregadoresDoPonto(pontoId)) {
      if (!vagaSemSinal(c)) continue;
      itens.push({
        id: `vaga-${c.id}`, severidade: c.estado === 'OFFLINE' ? 'critico' : 'atencao',
        titulo: c.estado === 'OFFLINE' ? `${c.apelido} offline` : `${c.apelido} sem sinal`,
        detalhe: `Último sinal há ${haTempo(c.ultimoHeartbeat)}. Sem comunicação, a vaga não aceita recarga: confira energia, Wi-Fi/LAN e o cabo RS-485.`,
        acao: { rotulo: 'Ver as vagas', to: '/franqueado/ponto' },
      });
    }
    const pendentes = cobrancasDoPonto(pontoId)
      .filter((c) => c.status === 'PENDENTE' && Date.now() - new Date(c.criadaEm).getTime() > 30 * 60_000);
    if (pendentes.length) {
      itens.push({
        id: `pix-${ponto.id}`, severidade: 'atencao',
        titulo: `${plural(pendentes.length, 'cobrança Pix pendente', 'cobranças Pix pendentes')} há mais de 30 min`,
        detalhe: 'O motorista encerrou a recarga e ainda não pagou. Acompanhe no extrato.',
        acao: { rotulo: 'Ver o extrato', to: '/franqueado/financeiro' },
      });
    }
    return itens.sort(porSeveridade);
  });
}

/** O que a GoodWe precisa olhar na rede: vagas sem sinal, pontos abaixo da meta e pedidos parados. */
export function atencaoDaRede(): ItemAtencao[] {
  return guardar('atencao|rede', () => {
    const itens: ItemAtencao[] = [];
    for (const p of base.pontos) {
      if (!pontoAtivo(p)) continue;
      const regiao = regiaoDoPonto(p);
      const semVaga = carregadoresDoPonto(p.id).filter(vagaSemSinal);
      if (semVaga.length) {
        itens.push({
          id: `vagas-${p.id}`, severidade: 'critico', pontoId: p.id,
          titulo: `${p.nome}: ${plural(semVaga.length, 'vaga sem sinal', 'vagas sem sinal')}`,
          detalhe: `${semVaga.map((c) => c.apelido).join(', ')} em ${regiao.zona}, ${regiao.cidade}/${regiao.uf}. Sem comunicação, a vaga não aceita recarga.`,
        });
      }
      if (abaixoDoLimiar(p)) {
        const r = resumoDoPonto(p.id, 'mes');
        itens.push({
          id: `uso-${p.id}`, severidade: 'atencao', pontoId: p.id,
          titulo: `${p.nome}: uso abaixo da meta`,
          detalhe: `${horas(r.horasUsoDia)}/dia por vaga contra a meta de ${horas(REGRAS.limiarViabilidadeHoras)}: a unidade não se paga no prazo esperado.`,
        });
      }
    }
    const paradas = base.homologacoes
      .filter((h) => ['ANALISE', 'VISTORIA', 'PENDENTE_DOC'].includes(h.status))
      .map((h) => ({ h, dias: Math.floor((Date.now() - new Date(h.criadoEm).getTime()) / 86_400_000) }))
      .filter((x) => x.dias > 7)
      .sort((a, b) => b.dias - a.dias);
    if (paradas.length > 3) {
      itens.push({
        id: 'hom-paradas', severidade: 'atencao',
        titulo: `${plural(paradas.length, 'pedido de franquia parado', 'pedidos de franquia parados')} há mais de 7 dias`,
        detalhe: `O mais antigo (${paradas[0].h.comercio}) está sem decisão há ${plural(paradas[0].dias, 'dia', 'dias')}.`,
        acao: { rotulo: 'Abrir a fila', to: '/goodwe/homologacao' },
      });
    } else {
      for (const { h, dias } of paradas) {
        itens.push({
          id: `hom-${h.id}`, severidade: 'atencao', titulo: `Pedido parado: ${h.comercio}`,
          detalhe: `Aberto há ${plural(dias, 'dia', 'dias')} sem decisão (${h.status === 'VISTORIA' ? 'em vistoria' : h.status === 'PENDENTE_DOC' ? 'falta documento' : 'em análise'}).`,
          acao: { rotulo: 'Abrir o pedido', to: `/goodwe/homologacao?solicitacao=${h.id}` },
        });
      }
    }
    return itens.sort(porSeveridade);
  });
}

export interface PassoAtivacao {
  id: 'dados' | 'totem' | 'ativar';
  titulo: string;
  detalhe: string;
  /** undefined = o sistema ainda não consegue saber */
  feito: boolean | undefined;
}

/** Os passos do fluxograma entre a concessão e o ponto no mapa do motorista. */
/** totemPareado vem da tabela totens (src/data/totens.ts); undefined = ainda não consultado */
export function checklistAtivacao(pontoId: string, totemPareado?: boolean): PassoAtivacao[] {
  const p = obterPonto(pontoId);
  if (!p) return [];
  const dadosOk = Boolean(p.nome && p.endereco && p.precoBaseKWh > 0 && p.limitePotenciaKW > 0);
  return [
    {
      id: 'dados', titulo: 'Dados do local e tarifa', feito: dadosOk,
      detalhe: `Entrada de ${kw(p.limitePotenciaKW)} e preço base de ${tarifaKWh(p.precoBaseKWh)}. Confira e ajuste se preciso.`,
    },
    {
      id: 'totem', titulo: 'Parear o totem',
      detalhe: 'Abra o totem no aparelho do ponto: ele mostra um código de 6 dígitos. Digite-o em Meu ponto e totem.',
      feito: totemPareado,
    },
    {
      id: 'ativar', titulo: 'Ativar o ponto', feito: statusDoPonto(p) === 'ATIVO',
      detalhe: 'Depois de ativo, o ponto aparece no mapa do motorista e as vagas passam a aceitar carro.',
    },
  ];
}

// ---------------------------------------------------------------- previsão (ponto ainda sem histórico)
/** o que a rede entrega, em média, por hora de recarga e por sessão — base das previsões */
function mediasDaRede() {
  return guardar('medias', () => {
    let energia = 0, horasTotal = 0, n = 0;
    for (const s of base.sessoes) {
      if (!FECHADAS.includes(s.estado) || !s.fim) continue;
      energia += s.energiaKWh;
      horasTotal += (new Date(s.fim).getTime() - new Date(s.inicio).getTime()) / 3_600_000;
      n++;
    }
    const precos = base.pontos.filter(pontoAtivo).map((p) => p.precoBaseKWh).filter((v) => v > 0);
    return {
      kwhPorHora: horasTotal > 0 ? energia / horasTotal : 5.5,
      kwhPorSessao: n > 0 ? energia / n : 8,
      precoMedio: precos.length ? precos.reduce((t, v) => t + v, 0) / precos.length : 1.9,
    };
  });
}

/** Quanto um formato rende por mês com tal uso previsto (h/dia por vaga). */
export function previsaoDeUso(
  formato: Ponto['formato'], regiaoId: string, horasUsoDia: number, precoKWh?: number,
): PrevisaoFinanceira {
  const m = mediasDaRede();
  return preverFinanceiro({
    formato, horasUsoDia, precoKWh: precoKWh ?? m.precoMedio,
    custoEnergiaKWh: obterRegiao(regiaoId).custoEnergiaKWh,
    kwhPorHora: m.kwhPorHora, kwhPorSessao: m.kwhPorSessao,
  });
}

/** Previsão do ponto em instalação, a partir do uso previsto na homologação que o originou. */
export function previsaoDoPonto(pontoId: string): PrevisaoFinanceira | null {
  const ponto = obterPonto(pontoId);
  const h = base.homologacoes.find((x) => x.pontoId === pontoId);
  if (!ponto || !h) return null;
  return previsaoDeUso(ponto.formato, ponto.regiaoId, h.horasUsoPrevistas, ponto.precoBaseKWh);
}

/** Quanto do bruto fica com o comércio na rede (últimos 30 dias, depois de energia, royalties e gateway). */
export function participacaoDoComercio(): number | null {
  return guardar('participacao', () => {
    const desde = Date.now() - 30 * 86_400_000;
    let bruto = 0, fica = 0;
    for (const c of base.cobrancas) {
      if (c.status !== 'PAGO' || new Date(c.criadaEm).getTime() < desde) continue;
      bruto += c.valor;
      fica += c.liquidoLojista;
    }
    return bruto > 0 ? fica / bruto : null;
  });
}

// ---------------------------------------------------------------- rede
export interface ResumoRede {
  periodo: Periodo;
  pontosOperando: number;
  pontosInstalacao: number;
  pontosSuspensos: number;
  pontosTotal: number;
  /** vagas de pontos em operação */
  vagasOperando: number;
  receita: number; energia: number; sessoes: number;
  /** royalties + fundo de marketing */
  royalties: number;
  /** mensalidades da plataforma proporcionais aos dias */
  plataforma: number;
  /** royalties + fundo + plataforma até agora */
  receitaGoodWe: number;
  /** a mesma receita no ritmo do período, para um mês inteiro */
  receitaGoodWeMensal: number;
  /** ritmo mensal × 12: projeção, não resultado */
  projecaoAnual: number;
  /** uso médio por vaga, ponderado pelas vagas dos pontos em operação (h/dia) */
  horasUsoDia: number;
  variacao: { receita: number | null; energia: number | null; sessoes: number | null; receitaGoodWe: number | null };
  semDados: boolean;
}

export function resumoDaRede(id: PeriodoId = 'mes'): ResumoRede {
  return guardar(`rr|${id}`, () => {
    const p = periodoDe(id);
    const { atual, antes } = agregadosDoPeriodo(p);
    const operando = base.pontos.filter(pontoAtivo);
    const ids = new Set(operando.map((x) => x.id));
    const vagas = base.carregadores.filter((c) => ids.has(c.pontoId)).length;
    const a = somar([...atual.values()]);
    const ant = somar([...antes.values()]);
    const horasOperando = somar(operando.map((x) => atual.get(x.id))).horas;
    const diasOp = operando.map((x) => diasOperando(x, p.inicio, p.diasDecorridos));
    const plataforma = plataformaDosDias(diasOp.reduce((t, d) => t + d, 0), p);
    // vaga-dias de verdade: ponto inaugurado no meio do mês não dilui o uso da rede
    const vagaDias = operando.reduce((t, x, i) => t + base.carregadores.filter((c) => c.pontoId === x.id).length * diasOp[i], 0);
    const receitaGoodWe = a.royalties + plataforma;
    const mensal = a.royalties * (p.diasRef / p.diasDecorridos) + operando.length * REGRAS.plataformaMes;
    return {
      periodo: p,
      pontosOperando: operando.length,
      pontosInstalacao: base.pontos.filter((x) => statusDoPonto(x) === 'INSTALACAO').length,
      pontosSuspensos: base.pontos.filter((x) => statusDoPonto(x) === 'SUSPENSO').length,
      pontosTotal: base.pontos.length,
      vagasOperando: vagas,
      receita: a.receita, energia: a.energia, sessoes: a.sessoes, royalties: a.royalties,
      plataforma, receitaGoodWe,
      receitaGoodWeMensal: mensal,
      projecaoAnual: mensal * 12,
      horasUsoDia: vagaDias > 0 ? horasOperando / vagaDias : 0,
      variacao: {
        receita: variacao(a.receita, ant.receita),
        energia: variacao(a.energia, ant.energia),
        sessoes: variacao(a.sessoes, ant.sessoes),
        receitaGoodWe: variacao(receitaGoodWe, ant.royalties + plataforma),
      },
      semDados: a.sessoes === 0 && a.receita === 0,
    };
  });
}

export interface KPIsRede {
  /** pontos em operação (status ATIVO) */
  pontosAtivos: number;
  pontosOperando: number;
  pontosInstalacao: number;
  pontosSuspensos: number;
  pontosTotal: number;
  /** vagas e potência só de pontos em operação */
  carregadoresTotal: number;
  carregadoresOffline: number;
  potenciaInstaladaKW: number;
  sessoesMes: number;
  energiaMesKWh: number;
  faturamentoRedeMes: number;
  royaltiesMes: number;
  ticketMedio: number;
  pontosAbaixoDoLimiar: number;
}

export function kpisDaRede(): KPIsRede {
  return guardar('kpis|rede', () => {
    const r = resumoDaRede('mes');
    const operando = base.pontos.filter(pontoAtivo);
    const ids = new Set(operando.map((x) => x.id));
    const vagas = base.carregadores.filter((c) => ids.has(c.pontoId));
    return {
      pontosAtivos: r.pontosOperando,
      pontosOperando: r.pontosOperando,
      pontosInstalacao: r.pontosInstalacao,
      pontosSuspensos: r.pontosSuspensos,
      pontosTotal: r.pontosTotal,
      carregadoresTotal: vagas.length,
      // vaga de ponto ainda em instalação não é falha da rede
      carregadoresOffline: vagas.filter(vagaSemSinal).length,
      potenciaInstaladaKW: vagas.reduce((t, c) => t + MODELOS_CARREGADOR[c.modelo].potenciaKW, 0),
      sessoesMes: r.sessoes,
      energiaMesKWh: Number(r.energia.toFixed(1)),
      faturamentoRedeMes: r2(r.receita),
      royaltiesMes: r2(r.royalties),
      ticketMedio: r.sessoes ? r2(r.receita / r.sessoes) : 0,
      pontosAbaixoDoLimiar: operando.filter(abaixoDoLimiar).length,
    };
  });
}

/** Agrupamento por zona (praça da rede) — alimenta o desempenho por região. */
export function desempenhoPorRegiao() {
  return guardar('regioes', () => {
    const mapa = new Map<
      string,
      { regiao: Regiao; pontos: number; operando: number; energia: number; faturamento: number; sessoes: number }
    >();
    for (const ponto of base.pontos) {
      const regiao = regiaoDoPonto(ponto);
      const r = resumoDoPonto(ponto.id, 'mes');
      const atual = mapa.get(regiao.id) ?? { regiao, pontos: 0, operando: 0, energia: 0, faturamento: 0, sessoes: 0 };
      atual.pontos += 1;
      if (pontoAtivo(ponto)) atual.operando += 1;
      atual.energia += r.energia;
      atual.faturamento += r.receita;
      atual.sessoes += r.sessoes;
      mapa.set(regiao.id, atual);
    }
    return Array.from(mapa.values())
      .map((x) => ({
        ...x,
        /** "Pinheiros · São Paulo/SP" */
        rotulo: `${x.regiao.zona} · ${x.regiao.cidade}/${x.regiao.uf}`,
        energia: Number(x.energia.toFixed(1)),
        faturamento: r2(x.faturamento),
      }))
      .sort((a, b) => b.faturamento - a.faturamento || b.pontos - a.pontos || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
  });
}

/** alertas curtos de um ponto, para a coluna da tabela da rede */
function alertasRapidos(p: Ponto): string[] {
  if (!pontoAtivo(p)) return [];
  const out: string[] = [];
  const sem = carregadoresDoPonto(p.id).filter(vagaSemSinal).length;
  if (sem) out.push(plural(sem, 'vaga sem sinal', 'vagas sem sinal'));
  if (abaixoDoLimiar(p)) out.push('uso abaixo da meta');
  return out;
}

/** Os pontos da rede com o que a tabela precisa (zona, status, uso, alertas), do maior faturamento para o menor. */
export function rankingPontos() {
  return guardar('ranking', () =>
    base.pontos
      .map((p) => ({
        ponto: p,
        kpis: kpisDoPonto(p.id),
        regiao: regiaoDoPonto(p),
        status: statusDoPonto(p),
        vagas: carregadoresDoPonto(p.id).length,
        alertas: alertasRapidos(p),
        abaixoDoLimiar: abaixoDoLimiar(p),
      }))
      .sort((a, b) => b.kpis.faturamentoMes - a.kpis.faturamentoMes));
}

/** Distribuição da frota por modelo de carregador. */
export function frotaPorModelo() {
  const mapa = new Map<string, number>();
  for (const c of base.carregadores) {
    mapa.set(c.modelo, (mapa.get(c.modelo) ?? 0) + 1);
  }
  return Array.from(mapa.entries()).map(([modelo, qtd]) => ({
    modelo,
    qtd,
    potenciaKW: MODELOS_CARREGADOR[modelo as keyof typeof MODELOS_CARREGADOR].potenciaKW,
  }));
}

/** Pontos disponíveis para o motorista, com preço e disponibilidade agora. */
export function pontosParaMotorista() {
  return base.pontos
    .filter(pontoAtivo)
    .map((p) => {
      const carregadores = carregadoresDoPonto(p.id);
      const livres = carregadores.filter((c) => c.estado === 'DISPONIVEL').length;
      const tarifa = tarifaAtual(p.id);
      return {
        ponto: p,
        regiao: regiaoDoPonto(p),
        totalVagas: carregadores.length,
        vagasLivres: livres,
        precoAgora: tarifa.precoFinalKWh,
        potenciaKW: carregadores.length
          ? MODELOS_CARREGADOR[carregadores[0].modelo].potenciaKW
          : 7,
      };
    })
    .sort((a, b) => b.vagasLivres - a.vagasLivres || a.precoAgora - b.precoAgora);
}

/** Retorno econômico da unidade — usa as mesmas regras do modelo do projeto. */
export function economiaDoPonto(pontoId: string) {
  const ponto = obterPonto(pontoId)!;
  const kpis = kpisDoPonto(pontoId);
  const cfg = FORMATOS[ponto.formato];
  const proj = projecaoDoPonto(pontoId, 'mes');
  const r = resumoDoPonto(pontoId, 'mes');

  // acumulado do mês até agora (plataforma proporcional aos dias)
  const resultadoMes = kpis.liquidoMes + proj.margemVarejo;

  return {
    capex: cfg.capex,
    liquidoRecarga: kpis.liquidoMes,
    margemVarejo: Number(proj.margemVarejo.toFixed(2)),
    resultadoMes: Number(resultadoMes.toFixed(2)),
    /** o mesmo resultado no ritmo do mês até agora, para um mês inteiro (projeção) */
    resultadoMesProjetado: Number(proj.resultadoMensal.toFixed(2)),
    /** payback sobre o ritmo mensal projetado; Infinity quando o ritmo não dá retorno */
    paybackMeses: Number(proj.paybackMeses.toFixed(1)),
    horasUsoDia: kpis.horasUsoDia,
    acimaDoLimiar: kpis.horasUsoDia >= REGRAS.limiarViabilidadeHoras,
    diasDecorridos: r.periodo.diasDecorridos,
    diasNoMes: r.periodo.diasRef,
    /** fração do resultado do mês que vem do movimento que a recarga traz para a loja */
    participacaoVarejo: resultadoMes > 0 ? proj.margemVarejo / resultadoMes : 0,
    confiavel: proj.confiavel,
  };
}

/**
 * Ritmo mensal do ponto no período escolhido: o que foi feito até agora dividido pelos dias
 * decorridos e multiplicado pelos dias do mês. O payback sai daí, nunca do mês incompleto.
 */
export function projecaoDoPonto(pontoId: string, id: PeriodoId = 'mes') {
  const ponto = obterPonto(pontoId);
  const r = resumoDoPonto(pontoId, id);
  const margemVarejo = r.sessoes * REGRAS.conversaoLoja * REGRAS.ticketVarejoIncremental * REGRAS.margemVarejo;
  const ritmo = r.periodo.diasRef / r.periodo.diasDecorridos;
  const operando = Boolean(ponto && pontoAtivo(ponto));
  const resultadoMensal = (r.liquidoBruto + margemVarejo) * ritmo - (operando ? REGRAS.plataformaMes : 0);
  const capex = ponto ? FORMATOS[ponto.formato].capex : 0;
  return {
    capex,
    margemVarejo,
    resultadoMensal,
    paybackMeses: resultadoMensal > 0 ? capex / resultadoMensal : Infinity,
    /** poucos dias ou poucas recargas: a projeção ainda balança */
    confiavel: r.periodo.diasDecorridos >= 3 && r.sessoes >= 5,
  };
}

// ---------------------------------------------------------------- ecossistema
