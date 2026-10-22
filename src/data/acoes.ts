import { exigirBanco } from './supabase';
import { vincularAvaliacao } from './avaliacoes';
import { base, cotacaoDaSessao, obterPonto, obterSessao, regiaoDoPonto } from '../domain/db';
import { analisarViabilidade } from '../domain/engine/ia';
import { cent, sugerirPrecoBase, validarPrecoBase } from '../domain/engine/tarifa';
import { tarifaKWh } from '../domain/formato';
import { FORMATOS, REGIOES } from '../domain/catalogo';
import type { Cobranca, FormatoFranquia, SegmentoComercio, Sessao } from '../domain/types';

/**
 * Ações do MVP: gravam no Supabase; o tempo real traz a mudança de volta para todas as telas.
 * O simulador (simulador/index.ts) faz o papel das vagas e reage aos estados gravados aqui.
 */

const novoId = (prefixo: string) => `${prefixo}-${crypto.randomUUID().slice(0, 8)}`;

async function ok<T>(p: PromiseLike<{ error: { message: string } | null; data?: unknown }>) {
  const { error, data } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

export async function registrarEvento(tipo: string, pontoId?: string | null, sessaoId?: string | null, detalhe?: unknown, ator?: string) {
  await exigirBanco().from('eventos').insert({ tipo, pontoId, sessaoId, detalhe: detalhe ?? null, ator: ator ?? null });
}

// ---------------------------------------------------------------- motorista
/**
 * Preço que vai valer para a sessão ABERTA. Dentro da validade usa o preço travado no totem (não recalcula);
 * fora dela cota de novo. Se a tela mostrou outro preço (`precoEsperado`), não grava: avisa que mudou.
 */
function precoDaSessao(sessao: Sessao, precoEsperado?: number) {
  const cot = cotacaoDaSessao(obterSessao(sessao.id) ?? sessao);
  if (!(cot.precoKWh > 0)) throw new Error('Não foi possível cotar o preço desta recarga. Tente de novo em instantes.');
  if (precoEsperado != null && Math.abs(precoEsperado - cot.precoKWh) > 0.004) {
    throw new Error(`O preço mudou para ${tarifaKWh(cot.precoKWh)}. Confira o valor e confirme de novo.`);
  }
  return cot;
}

/**
 * O motorista leu o QR: assume a sessão e a recarga começa (o simulador libera a vaga).
 * O preço é o cotado no totem e fica travado; só é refeito se a cotação venceu.
 */
export async function vincularSessao(sessao: Sessao, motoristaId: string, veiculoId: string, socInformado?: number, limiteValor?: number, precoEsperado?: number, meio: 'QR' | 'CODIGO' = 'QR') {
  if (socInformado != null && (!Number.isFinite(socInformado) || socInformado < 0 || socInformado > 100)) {
    throw new Error('Informe a bateria entre 0 e 100%.');
  }
  const cot = precoDaSessao(sessao, precoEsperado);
  const linhas = await ok<Sessao[]>(exigirBanco().from('sessoes').update({
    estado: 'AUTENTICADO', motoristaId, veiculoId, autorizacao: meio, codigoVinculo: null,
    ...(cot.travada ? {} : { tarifaAplicadaKWh: cot.precoKWh }),
    ...(socInformado != null ? { socInicial: socInformado, socAtual: socInformado } : {}),
    limiteValor: limiteValor && limiteValor > 0 ? limiteValor : null,
  }).eq('id', sessao.id).eq('estado', 'ABERTA').select());
  if (!linhas?.length) throw new Error('Este código já foi usado ou a sessão expirou.');
  await registrarEvento('SESSAO_VINCULADA', sessao.pontoId, sessao.id,
    { tarifa: cot.precoKWh, cotacao: cot.travada ? 'TRAVADA' : 'RECOTADA', anterior: cot.anterior ?? null, motoristaId }, motoristaId);
  return linhas[0];
}

/** Visitante no totem: começa sem conta e paga o Pix no próprio totem ao encerrar. Mesma regra de preço travado. */
export async function iniciarVisitante(sessao: Sessao, limiteValor?: number, precoEsperado?: number) {
  const cot = precoDaSessao(sessao, precoEsperado);
  const linhas = await ok<Sessao[]>(exigirBanco().from('sessoes').update({
    estado: 'AUTENTICADO', autorizacao: 'VISITANTE', codigoVinculo: null,
    ...(cot.travada ? {} : { tarifaAplicadaKWh: cot.precoKWh }),
    limiteValor: limiteValor ?? null,
  }).eq('id', sessao.id).eq('estado', 'ABERTA').select());
  if (!linhas?.length) throw new Error('Esta vaga já foi assumida por outra pessoa.');
  await registrarEvento('SESSAO_VISITANTE', sessao.pontoId, sessao.id,
    { tarifa: cot.precoKWh, cotacao: cot.travada ? 'TRAVADA' : 'RECOTADA', anterior: cot.anterior ?? null }, 'totem');
}

export async function encerrarSessao(sessao: Sessao, origem: string) {
  await ok(exigirBanco().from('sessoes').update({ estado: 'ENCERRANDO' })
    .eq('id', sessao.id).in('estado', ['AUTENTICADO', 'CARREGANDO', 'PAUSADO']));
  await registrarEvento('ENCERRAMENTO_SOLICITADO', sessao.pontoId, sessao.id, { origem });
}

/** Pix simulado: confirma a cobrança e fecha a sessão. */
export async function pagarCobranca(cobranca: Cobranca) {
  const agora = new Date().toISOString();
  await ok(exigirBanco().from('cobrancas').update({ status: 'PAGO', pagaEm: agora }).eq('id', cobranca.id));
  await ok(exigirBanco().from('sessoes').update({ estado: 'FATURADO' }).eq('id', cobranca.sessaoId));
  await registrarEvento('PAGAMENTO_CONFIRMADO', cobranca.pontoId, cobranca.sessaoId, { valor: cobranca.valor, txid: cobranca.txid });
}

// ---------------------------------------------------------------- bancada de simulação (franqueado e totem)
export async function conectarCarro(carregadorId: string, veiculoId: string, socReal: number) {
  await ok(exigirBanco().from('carregadores').update({
    carro: { veiculoId, socReal, conectadoEm: new Date().toISOString() }, estado: 'OCUPADO',
  }).eq('id', carregadorId));
}

export async function desconectarCarro(carregadorId: string) {
  await ok(exigirBanco().from('carregadores').update({ carro: null }).eq('id', carregadorId));
}

export async function definirManutencao(carregadorId: string, ligar: boolean) {
  await ok(exigirBanco().from('carregadores').update({ estado: ligar ? 'MANUTENCAO' : 'DISPONIVEL', carro: null }).eq('id', carregadorId));
}

// ---------------------------------------------------------------- franquia
export async function enviarSolicitacao(d: {
  comercio: string; cnpj: string; regiaoId: string; segmento: SegmentoComercio; formatoDesejado: FormatoFranquia;
  cargaDisponivelKW: number; fluxoDiarioPessoas: number;
  /** avaliação do local feita no gs_vr (opcional): vai junto no pedido e é amarrada a ele */
  avaliacaoId?: string;
}, solicitanteId: string) {
  const regiao = REGIOES.find((r) => r.id === d.regiaoId) ?? REGIOES[0];
  const a = analisarViabilidade(d, regiao);
  const id = novoId('h');
  await ok(exigirBanco().from('homologacoes').insert({
    id, ...d, status: 'ANALISE', scoreViabilidade: a.score, horasUsoPrevistas: a.horasUsoPrevistas,
    parecer: a.parecer, solicitanteId,
  }));
  if (d.avaliacaoId) await vincularAvaliacao(d.avaliacaoId, id, solicitanteId);
}

/** GoodWe decide. Aprovar cria o franqueado, o ponto (em instalação) e as vagas do formato. */
export async function decidirSolicitacao(id: string, decisao: 'APROVADO' | 'REPROVADO' | 'VISTORIA') {
  const h = base.homologacoes.find((x) => x.id === id);
  if (!h) throw new Error('Solicitação não encontrada.');
  const sb = exigirBanco();
  if (decisao !== 'APROVADO') {
    // pedido já aprovado (com ponto criado) não volta atrás por uma tela desatualizada
    await ok(sb.from('homologacoes').update({ status: decisao }).eq('id', id).neq('status', 'APROVADO'));
    return;
  }
  // reserva primeiro: dois cliques (ou duas pessoas) não criam dois pontos
  const { data: reservada, error } = await sb.from('homologacoes').update({ status: 'APROVADO' })
    .eq('id', id).neq('status', 'APROVADO').select('id');
  if (error) throw new Error(error.message);
  if (!reservada?.length) throw new Error('Esta solicitação já foi aprovada.');
  try {
    await criarPontoAprovado(h);
  } catch (e) {
    await sb.from('homologacoes').update({ status: h.status }).eq('id', id);
    throw e;
  }
}

async function criarPontoAprovado(h: (typeof base.homologacoes)[number]) {
  const sb = exigirBanco();
  const id = h.id;
  const regiao = REGIOES.find((r) => r.id === h.regiaoId) ?? REGIOES[0];
  const cfg = FORMATOS[h.formatoDesejado];
  // ids derivados do pedido + upsert: se algo falhar no meio, aprovar de novo não cria ponto órfão
  const base36 = h.id.replace(/^h-/, '');
  const franqueadoId = `f-${base36}`;
  const pontoId = `p-${base36}`;
  await ok(sb.from('franqueados').upsert({ id: franqueadoId, nome: h.comercio, razaoSocial: `${h.comercio} LTDA`, cnpj: h.cnpj }));
  await ok(sb.from('pontos').upsert({
    id: pontoId, nome: h.comercio, franqueadoId, regiaoId: h.regiaoId, endereco: `${regiao.zona}, ${regiao.cidade}/${regiao.uf}`,
    formato: h.formatoDesejado, segmento: h.segmento, status: 'INSTALACAO', ativo: false,
    limitePotenciaKW: h.cargaDisponivelKW, limiteCorrenteA: Math.round((h.cargaDisponivelKW * 1000) / 220),
    // perto do centro da região, mas sem cair em cima de outro ponto no mapa (~1 km)
    cargaBaseKW: 8, precoBaseKWh: sugerirPrecoBase(regiao), lat: regiao.lat + (Math.random() - 0.5) * 0.02, lng: regiao.lng + (Math.random() - 0.5) * 0.02,
  }));
  await ok(sb.from('carregadores').upsert(Array.from({ length: cfg.carregadores }, (_, i) => ({
    id: `${pontoId}-c${i + 1}`, pontoId, apelido: `Vaga ${i + 1}`, modelo: cfg.modelo, estado: 'OFFLINE', firmware: 'HCA-G2 v3.2.0',
  }))));
  await ok(sb.from('homologacoes').update({ pontoId }).eq('id', id));
  if (h.solicitanteId) {
    await ok(sb.from('perfis').update({ papel: 'franqueado', franqueadoId }).eq('id', h.solicitanteId));
  }
  await registrarEvento('PONTO_CONCEDIDO', pontoId, null, { solicitacao: id, formato: h.formatoDesejado });
}

export async function salvarPonto(pontoId: string, campos: Partial<{
  nome: string; endereco: string; precoBaseKWh: number; limitePotenciaKW: number; cargaBaseKW: number;
}>) {
  const ponto = obterPonto(pontoId);
  if (!ponto) throw new Error('Ponto não encontrado.');
  if (campos.nome != null && !campos.nome.trim()) throw new Error('Informe o nome do ponto.');
  if (campos.limitePotenciaKW != null && !(Number.isFinite(campos.limitePotenciaKW) && campos.limitePotenciaKW > 0)) {
    throw new Error('O limite da entrada elétrica precisa ser maior que zero.');
  }
  if (campos.cargaBaseKW != null && !(Number.isFinite(campos.cargaBaseKW) && campos.cargaBaseKW >= 0)) {
    throw new Error('A carga típica do comércio não pode ser negativa.');
  }
  const limpos = { ...campos };
  if (campos.precoBaseKWh != null) {
    const v = validarPrecoBase(campos.precoBaseKWh, regiaoDoPonto(ponto));
    if (!v.valido) throw new Error(v.erro);
    limpos.precoBaseKWh = cent(campos.precoBaseKWh);
  }
  const extra = limpos.limitePotenciaKW ? { limiteCorrenteA: Math.round((limpos.limitePotenciaKW * 1000) / 220) } : {};
  await ok(exigirBanco().from('pontos').update({ ...limpos, ...extra }).eq('id', pontoId));
}

/** Ponto instalado: entra no mapa do motorista e as vagas ficam disponíveis. Só ativa com preço base válido. */
export async function ativarPonto(pontoId: string) {
  const ponto = obterPonto(pontoId);
  if (ponto) {
    const v = validarPrecoBase(Number(ponto.precoBaseKWh), regiaoDoPonto(ponto));
    if (!v.valido) throw new Error(`Acerte o preço base antes de ativar. ${v.erro}`);
  }
  const sb = exigirBanco();
  await ok(sb.from('pontos').update({ status: 'ATIVO', ativo: true, inauguradoEm: new Date().toISOString() }).eq('id', pontoId));
  await ok(sb.from('carregadores').update({ estado: 'DISPONIVEL', ultimoHeartbeat: new Date().toISOString() })
    .eq('pontoId', pontoId).eq('estado', 'OFFLINE'));
  await registrarEvento('PONTO_ATIVADO', pontoId);
}

export async function mudarStatusPonto(pontoId: string, status: 'ATIVO' | 'SUSPENSO') {
  await ok(exigirBanco().from('pontos').update({ status, ativo: status === 'ATIVO' }).eq('id', pontoId));
  await registrarEvento(`PONTO_${status}`, pontoId);
}

export const custoEnergiaDoPonto = (pontoId: string) => {
  const p = obterPonto(pontoId);
  return p ? regiaoDoPonto(p).custoEnergiaKWh : 0.85;
};
