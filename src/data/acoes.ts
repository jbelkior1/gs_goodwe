import { exigirBanco } from './supabase';
import { base, obterPonto, regiaoDoPonto, tarifaAtual } from '../domain/db';
import { analisarViabilidade } from '../domain/engine/ia';
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
/** O motorista leu o QR: assume a sessão, trava o preço e a recarga começa (o simulador libera a vaga). */
export async function vincularSessao(sessao: Sessao, motoristaId: string, veiculoId: string, socInformado?: number, limiteValor?: number) {
  const tarifa = tarifaAtual(sessao.pontoId).precoFinalKWh;
  const linhas = await ok<Sessao[]>(exigirBanco().from('sessoes').update({
    estado: 'AUTENTICADO', motoristaId, veiculoId, autorizacao: 'QR', codigoVinculo: null,
    tarifaAplicadaKWh: tarifa,
    ...(socInformado != null ? { socInicial: socInformado, socAtual: socInformado } : {}),
    limiteValor: limiteValor && limiteValor > 0 ? limiteValor : null,
  }).eq('id', sessao.id).eq('estado', 'ABERTA').select());
  if (!linhas?.length) throw new Error('Este código já foi usado ou a sessão expirou.');
  await registrarEvento('SESSAO_VINCULADA', sessao.pontoId, sessao.id, { tarifa, motoristaId }, motoristaId);
  return linhas[0];
}

/** Visitante no totem: começa sem conta e paga o Pix no próprio totem ao encerrar. */
export async function iniciarVisitante(sessao: Sessao, limiteValor?: number) {
  const tarifa = tarifaAtual(sessao.pontoId).precoFinalKWh;
  const linhas = await ok<Sessao[]>(exigirBanco().from('sessoes').update({
    estado: 'AUTENTICADO', autorizacao: 'VISITANTE', codigoVinculo: null, tarifaAplicadaKWh: tarifa,
    limiteValor: limiteValor ?? null,
  }).eq('id', sessao.id).eq('estado', 'ABERTA').select());
  if (!linhas?.length) throw new Error('Esta vaga já foi assumida por outra pessoa.');
  await registrarEvento('SESSAO_VISITANTE', sessao.pontoId, sessao.id, { tarifa }, 'totem');
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
}, solicitanteId: string) {
  const regiao = REGIOES.find((r) => r.id === d.regiaoId) ?? REGIOES[0];
  const a = analisarViabilidade(d, regiao);
  await ok(exigirBanco().from('homologacoes').insert({
    id: novoId('h'), ...d, status: 'ANALISE', scoreViabilidade: a.score, horasUsoPrevistas: a.horasUsoPrevistas,
    parecer: a.parecer, solicitanteId,
  }));
}

/** GoodWe decide. Aprovar cria o franqueado, o ponto (em instalação) e as vagas do formato. */
export async function decidirSolicitacao(id: string, decisao: 'APROVADO' | 'REPROVADO' | 'VISTORIA') {
  const h = base.homologacoes.find((x) => x.id === id);
  if (!h) throw new Error('Solicitação não encontrada.');
  const sb = exigirBanco();
  if (decisao !== 'APROVADO') {
    await ok(sb.from('homologacoes').update({ status: decisao }).eq('id', id));
    return;
  }
  const regiao = REGIOES.find((r) => r.id === h.regiaoId) ?? REGIOES[0];
  const cfg = FORMATOS[h.formatoDesejado];
  const franqueadoId = novoId('f');
  const pontoId = novoId('p');
  await ok(sb.from('franqueados').insert({ id: franqueadoId, nome: h.comercio, razaoSocial: `${h.comercio} LTDA`, cnpj: h.cnpj }));
  await ok(sb.from('pontos').insert({
    id: pontoId, nome: h.comercio, franqueadoId, regiaoId: h.regiaoId, endereco: `${regiao.zona}, ${regiao.cidade}/${regiao.uf}`,
    formato: h.formatoDesejado, segmento: h.segmento, status: 'INSTALACAO', ativo: false,
    limitePotenciaKW: h.cargaDisponivelKW, limiteCorrenteA: Math.round((h.cargaDisponivelKW * 1000) / 220),
    cargaBaseKW: 8, precoBaseKWh: 1.9, lat: regiao.lat, lng: regiao.lng,
  }));
  await ok(sb.from('carregadores').insert(Array.from({ length: cfg.carregadores }, (_, i) => ({
    id: `${pontoId}-c${i + 1}`, pontoId, apelido: `Vaga ${i + 1}`, modelo: cfg.modelo, estado: 'OFFLINE', firmware: 'HCA-G2 v3.2.0',
  }))));
  await ok(sb.from('homologacoes').update({ status: 'APROVADO', pontoId }).eq('id', id));
  if (h.solicitanteId) {
    await ok(sb.from('perfis').update({ papel: 'franqueado', franqueadoId }).eq('id', h.solicitanteId));
  }
  await registrarEvento('PONTO_CONCEDIDO', pontoId, null, { solicitacao: id, formato: h.formatoDesejado });
}

export async function salvarPonto(pontoId: string, campos: Partial<{
  nome: string; endereco: string; precoBaseKWh: number; limitePotenciaKW: number; cargaBaseKW: number;
  temSolar: boolean; potenciaFVkWp: number;
}>) {
  const extra = campos.limitePotenciaKW ? { limiteCorrenteA: Math.round((campos.limitePotenciaKW * 1000) / 220) } : {};
  await ok(exigirBanco().from('pontos').update({ ...campos, ...extra }).eq('id', pontoId));
}

/** Ponto instalado: entra no mapa do motorista e as vagas ficam disponíveis. */
export async function ativarPonto(pontoId: string) {
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
