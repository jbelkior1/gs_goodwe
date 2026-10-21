import { gerarBase, type BaseDados } from './seed';
import { supabase, buscarTudo } from '../data/supabase';
import { geracaoSolarKW } from './engine/solar';
import { MODELOS_CARREGADOR, REGIOES, REGRAS, FORMATOS, VEICULOS } from './catalogo';
import { calcularDemanda, cargaComercioNaHora } from './engine/demanda';
import { calcularTarifa } from './engine/tarifa';
import { preverDemanda, gerarRecomendacoes, resumoGerencial, detectarAnomalias } from './engine/ia';
import { resumoSolar, mixDoDia } from './engine/solar';
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

/** tabela do banco → lista em `base` */
const TABELAS = {
  franqueados: 'franqueados', pontos: 'pontos', carregadores: 'carregadores', motoristas: 'motoristas',
  sessoes: 'sessoes', telemetria: 'telemetria', cobrancas: 'cobrancas', homologacoes: 'homologacoes',
} as const;

export async function carregarBase(): Promise<'banco' | 'local'> {
  if (!supabase) {
    Object.assign(base, gerarBase());
    return 'local';
  }
  // assina antes de ler: o que mudar durante a leitura fica na fila e é aplicado depois
  assinarTempoReal();
  await reler();
  return 'banco';
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

async function buscarBase() {
  const desde = new Date(Date.now() - 6 * 3600_000).toISOString();
  const [franqueados, pontos, carregadores, motoristas, sessoes, telemetria, cobrancas, homologacoes] = await Promise.all([
    buscarTudo<BaseDados['franqueados'][number]>('franqueados'),
    buscarTudo<Ponto>('pontos'),
    buscarTudo<Carregador>('carregadores'),
    buscarTudo<Motorista>('motoristas'),
    buscarTudo<Sessao>('sessoes'),
    buscarTudo<BaseDados['telemetria'][number]>('telemetria', (q) => q.gte('ts', desde)),
    buscarTudo<Cobranca>('cobrancas'),
    buscarTudo<BaseDados['homologacoes'][number]>('homologacoes'),
  ]);
  return { franqueados, pontos, carregadores, motoristas, sessoes, telemetria, cobrancas, homologacoes,
    geradoEm: new Date().toISOString() };
}

function assinarTempoReal() {
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
      return;
    }
    caiu = true;
    console.warn('tempo real:', status, erro?.message ?? '');
  });
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__pontow = { base, canal };
}

// ---------------------------------------------------------------- básicos
export const listarPontos = (): Ponto[] => base.pontos;

export const obterPonto = (id: string): Ponto | undefined =>
  base.pontos.find((p) => p.id === id);

export const pontoAtivo = (p: Ponto) => p.ativo && (p.status ?? 'ATIVO') === 'ATIVO';

const EM_ANDAMENTO = ['ABERTA', 'AUTENTICADO', 'CARREGANDO', 'PAUSADO', 'ENCERRANDO'];

/**
 * Sessão "da vaga agora": a que está em andamento ou, enquanto o mesmo carro continua no cabo,
 * a que acabou de terminar (a pagar ou paga). Conta pendente de carro que já saiu não trava a vaga.
 */
export const sessaoDaVaga = (carregadorId: string): Sessao | undefined => {
  const daVaga = base.sessoes.filter((s) => s.carregadorId === carregadorId).sort((a, b) => b.inicio.localeCompare(a.inicio));
  const andamento = daVaga.find((s) => EM_ANDAMENTO.includes(s.estado));
  if (andamento) return andamento;
  const carro = base.carregadores.find((c) => c.id === carregadorId)?.carro;
  const ultima = daVaga[0];
  if (!carro || !ultima?.fim || !['CONCLUIDO', 'FATURADO'].includes(ultima.estado)) return undefined;
  const mesmoCarro = carro.sessaoId
    ? carro.sessaoId === ultima.id
    : new Date(carro.conectadoEm).getTime() <= new Date(ultima.fim).getTime();
  return mesmoCarro ? ultima : undefined;
};

/** o agente da vaga manda sinal a cada 20 s; sem sinal há mais de 90 s, a vaga está fora do ar */
export const semSinal = (c: Carregador) => Date.now() - new Date(c.ultimoHeartbeat).getTime() > 90_000;

export const sessaoPorCodigo = (codigo: string): Sessao | undefined =>
  base.sessoes.find((s) => s.estado === 'ABERTA' && s.codigoVinculo?.toUpperCase() === codigo.trim().toUpperCase());

/** recarga em andamento (ou a pagar) do motorista */
export const sessaoDoMotorista = (motoristaId?: string | null): Sessao | undefined =>
  motoristaId
    ? base.sessoes
        .filter((s) => s.motoristaId === motoristaId && ['AUTENTICADO', 'CARREGANDO', 'PAUSADO', 'ENCERRANDO', 'CONCLUIDO'].includes(s.estado))
        .sort((a, b) => b.inicio.localeCompare(a.inicio))[0]
    : undefined;

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
const inicioDoMes = (): number => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
};

export const noMesAtual = (isoDate: string): boolean =>
  new Date(isoDate).getTime() >= inicioDoMes();

export const ultimosDias = (isoDate: string, dias: number): boolean =>
  new Date(isoDate).getTime() >= Date.now() - dias * 86400000;

// ---------------------------------------------------------------- KPIs
export function kpisDoPonto(pontoId: string): KPIsPonto {
  const carregadores = carregadoresDoPonto(pontoId);
  const sessoesMes = sessoesDoPonto(pontoId).filter(
    (s) => noMesAtual(s.inicio) && (s.estado === 'FATURADO' || s.estado === 'CONCLUIDO'),
  );
  const cobrancasMes = cobrancasDoPonto(pontoId).filter(
    (c) => noMesAtual(c.criadaEm) && c.status === 'PAGO',
  );

  const energiaMesKWh = sessoesMes.reduce((t, s) => t + s.energiaKWh, 0);
  const faturamentoMes = cobrancasMes.reduce((t, c) => t + c.valor, 0);
  const custoEnergiaMes = cobrancasMes.reduce((t, c) => t + c.custoEnergia, 0);
  const royaltiesMes = cobrancasMes.reduce(
    (t, c) => t + c.royaltyGoodWe + c.fundoMarketing,
    0,
  );
  const liquidoMes = cobrancasMes.reduce((t, c) => t + c.liquidoLojista, 0);

  const diasNoMes = Math.max(1, new Date().getDate());
  const horasCarregando = sessoesMes.reduce((t, s) => {
    if (!s.fim) return t;
    return t + (new Date(s.fim).getTime() - new Date(s.inicio).getTime()) / 3600000;
  }, 0);
  const horasUsoDia = horasCarregando / diasNoMes / Math.max(1, carregadores.length);

  return {
    pontoId,
    energiaMesKWh: Number(energiaMesKWh.toFixed(1)),
    sessoesMes: sessoesMes.length,
    faturamentoMes: Number(faturamentoMes.toFixed(2)),
    custoEnergiaMes: Number(custoEnergiaMes.toFixed(2)),
    royaltiesMes: Number(royaltiesMes.toFixed(2)),
    // a mensalidade da plataforma começa quando o ponto entra em operação
    liquidoMes: Number((liquidoMes - (base.pontos.some((p) => p.id === pontoId && pontoAtivo(p)) ? REGRAS.plataformaMes : 0)).toFixed(2)),
    horasUsoDia: Number(horasUsoDia.toFixed(2)),
    ocupacaoPct: Number(Math.min(1, horasUsoDia / 12).toFixed(3)),
    ticketMedio: sessoesMes.length
      ? Number((faturamentoMes / sessoesMes.length).toFixed(2))
      : 0,
  };
}

/** Série diária de energia e faturamento — alimenta os gráficos. */
export function serieDiaria(pontoId: string | null, dias = 30) {
  const sessoes = pontoId ? sessoesDoPonto(pontoId) : base.sessoes;
  const cobrancas = pontoId ? cobrancasDoPonto(pontoId) : base.cobrancas;

  const mapa = new Map<string, { dia: string; energia: number; faturamento: number; sessoes: number }>();
  for (let d = dias - 1; d >= 0; d--) {
    const dt = new Date(Date.now() - d * 86400000);
    const chave = dt.toISOString().slice(0, 10);
    mapa.set(chave, { dia: chave.slice(8) + '/' + chave.slice(5, 7), energia: 0, faturamento: 0, sessoes: 0 });
  }

  for (const s of sessoes) {
    const chave = s.inicio.slice(0, 10);
    const item = mapa.get(chave);
    if (item) {
      item.energia += s.energiaKWh;
      item.sessoes += 1;
    }
  }
  for (const c of cobrancas) {
    if (c.status !== 'PAGO') continue;
    const chave = c.criadaEm.slice(0, 10);
    const item = mapa.get(chave);
    if (item) item.faturamento += c.valor;
  }

  return Array.from(mapa.values()).map((x) => ({
    ...x,
    energia: Number(x.energia.toFixed(1)),
    faturamento: Number(x.faturamento.toFixed(2)),
  }));
}

/** Distribuição de sessões por hora do dia. */
export function perfilHorario(pontoId: string | null) {
  const sessoes = pontoId ? sessoesDoPonto(pontoId) : base.sessoes;
  const horas = Array.from({ length: 24 }, (_, h) => ({ hora: h, sessoes: 0, energia: 0 }));
  for (const s of sessoes) {
    const h = new Date(s.inicio).getHours();
    horas[h].sessoes += 1;
    horas[h].energia += s.energiaKWh;
  }
  return horas.map((x) => ({ ...x, energia: Number(x.energia.toFixed(1)) }));
}

// ---------------------------------------------------------------- demanda
/** Estado atual do controle de demanda de um ponto. */
export function demandaDoPonto(pontoId: string) {
  const ponto = obterPonto(pontoId)!;
  const carregadores = carregadoresDoPonto(pontoId);
  const ativas = sessoesAtivas(pontoId);
  const h = new Date().getHours();
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
export function tarifaAtual(pontoId: string) {
  const ponto = obterPonto(pontoId)!;
  const regiao = regiaoDoPonto(ponto);
  const carregadores = carregadoresDoPonto(pontoId);
  const ativas = sessoesAtivas(pontoId);
  const ocupacao = carregadores.length ? ativas.length / carregadores.length : 0;
  return calcularTarifa(ponto, regiao, new Date().getHours(), ocupacao);
}

// ---------------------------------------------------------------- IA
export function inteligenciaDoPonto(pontoId: string) {
  const ponto = obterPonto(pontoId)!;
  const carregadores = carregadoresDoPonto(pontoId);
  const historico = sessoesDoPonto(pontoId).filter((s) => s.estado === 'FATURADO');
  const kpis = kpisDoPonto(pontoId);

  const previsao = preverDemanda(historico, carregadores.length);
  const recomendacoes = gerarRecomendacoes(ponto, kpis, previsao);
  const resumo = resumoGerencial(ponto, kpis, previsao);
  const anomalias = detectarAnomalias(ponto, carregadores, historico, new Date());

  return { previsao, recomendacoes, resumo, anomalias, kpis };
}

// ---------------------------------------------------------------- rede
export interface KPIsRede {
  pontosAtivos: number;
  pontosTotal: number;
  carregadoresTotal: number;
  carregadoresOffline: number;
  sessoesMes: number;
  energiaMesKWh: number;
  faturamentoRedeMes: number;
  royaltiesMes: number;
  ticketMedio: number;
  pontosAbaixoDoLimiar: number;
}

export function kpisDaRede(): KPIsRede {
  const todosKpis = base.pontos.map((p) => kpisDoPonto(p.id));
  const cobrancasMes = base.cobrancas.filter(
    (c) => noMesAtual(c.criadaEm) && c.status === 'PAGO',
  );

  const faturamentoRedeMes = cobrancasMes.reduce((t, c) => t + c.valor, 0);
  const royaltiesMes = cobrancasMes.reduce(
    (t, c) => t + c.royaltyGoodWe + c.fundoMarketing,
    0,
  );
  const sessoesMes = todosKpis.reduce((t, k) => t + k.sessoesMes, 0);

  return {
    pontosAtivos: base.pontos.filter((p) => p.ativo).length,
    pontosTotal: base.pontos.length,
    carregadoresTotal: base.carregadores.length,
    // vaga de ponto ainda em instalação não é falha da rede
    carregadoresOffline: base.carregadores.filter((c) => c.estado === 'OFFLINE' && base.pontos.some((p) => p.id === c.pontoId && pontoAtivo(p))).length,
    sessoesMes,
    energiaMesKWh: Number(todosKpis.reduce((t, k) => t + k.energiaMesKWh, 0).toFixed(1)),
    faturamentoRedeMes: Number(faturamentoRedeMes.toFixed(2)),
    royaltiesMes: Number(royaltiesMes.toFixed(2)),
    ticketMedio: sessoesMes ? Number((faturamentoRedeMes / sessoesMes).toFixed(2)) : 0,
    pontosAbaixoDoLimiar: todosKpis.filter(
      (k) => k.horasUsoDia < REGRAS.limiarViabilidadeHoras && base.pontos.some((p) => p.id === k.pontoId && pontoAtivo(p)),
    ).length,
  };
}

/** Agrupamento por região — alimenta o mapa/ranking da rede. */
export function desempenhoPorRegiao() {
  const mapa = new Map<
    string,
    { regiao: Regiao; pontos: number; energia: number; faturamento: number; sessoes: number }
  >();

  for (const ponto of base.pontos) {
    const regiao = regiaoDoPonto(ponto);
    const k = kpisDoPonto(ponto.id);
    const atual = mapa.get(regiao.id) ?? {
      regiao,
      pontos: 0,
      energia: 0,
      faturamento: 0,
      sessoes: 0,
    };
    atual.pontos += 1;
    atual.energia += k.energiaMesKWh;
    atual.faturamento += k.faturamentoMes;
    atual.sessoes += k.sessoesMes;
    mapa.set(regiao.id, atual);
  }

  return Array.from(mapa.values())
    .map((x) => ({
      ...x,
      energia: Number(x.energia.toFixed(1)),
      faturamento: Number(x.faturamento.toFixed(2)),
    }))
    .sort((a, b) => b.faturamento - a.faturamento);
}

/** Ranking de pontos por resultado, com o limiar de viabilidade marcado. */
export function rankingPontos() {
  return base.pontos
    .map((p) => ({ ponto: p, kpis: kpisDoPonto(p.id) }))
    .sort((a, b) => b.kpis.faturamentoMes - a.kpis.faturamentoMes);
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

  const sessoesMes = kpis.sessoesMes;
  const margemVarejo =
    sessoesMes * REGRAS.conversaoLoja * REGRAS.ticketVarejoIncremental * REGRAS.margemVarejo;
  const resultadoMes = kpis.liquidoMes + margemVarejo;
  const paybackMeses = resultadoMes > 0 ? cfg.capex / resultadoMes : Infinity;

  return {
    capex: cfg.capex,
    liquidoRecarga: kpis.liquidoMes,
    margemVarejo: Number(margemVarejo.toFixed(2)),
    resultadoMes: Number(resultadoMes.toFixed(2)),
    paybackMeses: Number(paybackMeses.toFixed(1)),
    horasUsoDia: kpis.horasUsoDia,
    acimaDoLimiar: kpis.horasUsoDia >= REGRAS.limiarViabilidadeHoras,
  };
}

// ---------------------------------------------------------------- ecossistema
/** Mix energetico do ponto: sol, bateria e rede (modos do HCA G2). */
export function solarDoPonto(pontoId: string) {
  const ponto = obterPonto(pontoId)!;
  const regiao = regiaoDoPonto(ponto);
  const kpis = kpisDoPonto(pontoId);
  // potencia media dedicada a recarga ao longo do dia
  const recargaMediaKW = kpis.energiaMesKWh / Math.max(1, new Date().getDate()) / 14;

  const resumo = resumoSolar(ponto, regiao, recargaMediaKW);

  // Quanto da ENERGIA VENDIDA na recarga veio do sol/bateria. Separamos isso da
  // economia total do comercio (que inclui geladeira, luz, ar) para nao misturar
  // o resultado do negocio de recarga com a conta de luz inteira do lojista.
  const economiaRecargaMes = Number(
    (kpis.energiaMesKWh * resumo.autossuficiencia * regiao.custoEnergiaKWh).toFixed(2),
  );

  return {
    resumo: { ...resumo, economiaRecargaMes },
    mix: mixDoDia(ponto, recargaMediaKW),
  };
}

/** Consolidado de solar na rede — quantos pontos ja sao clientes do ecossistema. */
export function solarDaRede() {
  const comSolar = base.pontos.filter((p) => p.temSolar);
  const comBateria = base.pontos.filter((p) => p.temBateria);
  const potenciaFV = comSolar.reduce((t, p) => t + p.potenciaFVkWp, 0);

  let economiaRecarga = 0;
  let economiaTotal = 0;
  let co2 = 0;
  for (const p of base.pontos) {
    const s = solarDoPonto(p.id).resumo;
    economiaRecarga += s.economiaRecargaMes;
    economiaTotal += s.economiaMes;
    co2 += s.co2EvitadoMesKg;
  }

  return {
    pontosComSolar: comSolar.length,
    pontosComBateria: comBateria.length,
    pontosSemSolar: base.pontos.length - comSolar.length,
    potenciaFVkWp: Number(potenciaFV.toFixed(1)),
    economiaRecargaMes: Number(economiaRecarga.toFixed(2)),
    economiaTotalMes: Number(economiaTotal.toFixed(2)),
    co2EvitadoMesKg: Number(co2.toFixed(1)),
  };
}
