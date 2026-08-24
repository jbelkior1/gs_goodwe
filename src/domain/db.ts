import { gerarBase, type BaseDados } from './seed';
import { MODELOS_CARREGADOR, REGIOES, REGRAS, FORMATOS, VEICULOS } from './catalogo';
import { calcularDemanda, cargaComercioNaHora } from './engine/demanda';
import { calcularTarifa } from './engine/tarifa';
import { preverDemanda, gerarRecomendacoes, resumoGerencial, detectarAnomalias } from './engine/ia';
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
 * Camada de acesso a dados.
 * Hoje lê da base falsa em memória; amanhã cada função destas vira uma
 * consulta ao Postgres/Supabase — a interface não muda.
 */

export const base: BaseDados = gerarBase();

// ---------------------------------------------------------------- básicos
export const listarPontos = (): Ponto[] => base.pontos;

export const obterPonto = (id: string): Ponto | undefined =>
  base.pontos.find((p) => p.id === id);

export const obterRegiao = (id: string): Regiao =>
  REGIOES.find((r) => r.id === id) ?? REGIOES[0];

export const regiaoDoPonto = (ponto: Ponto): Regiao => obterRegiao(ponto.regiaoId);

export const carregadoresDoPonto = (pontoId: string): Carregador[] =>
  base.carregadores.filter((c) => c.pontoId === pontoId);

export const obterMotorista = (id: string): Motorista | undefined =>
  base.motoristas.find((m) => m.id === id);

export const obterVeiculo = (id: string): Veiculo | undefined =>
  VEICULOS.find((v) => v.id === id);

export const obterFranqueado = (id: string) =>
  base.franqueados.find((f) => f.id === id);

// ---------------------------------------------------------------- sessões
export const sessoesDoPonto = (pontoId: string): Sessao[] =>
  base.sessoes.filter((s) => s.pontoId === pontoId);

export const sessoesAtivas = (pontoId?: string): Sessao[] =>
  base.sessoes.filter(
    (s) =>
      (s.estado === 'CARREGANDO' || s.estado === 'PAUSADO' || s.estado === 'AUTENTICADO') &&
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
    liquidoMes: Number((liquidoMes - REGRAS.plataformaMes).toFixed(2)),
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
  const cargaComercioKW = cargaComercioNaHora(ponto, new Date().getHours());

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
    carregadoresOffline: base.carregadores.filter((c) => c.estado === 'OFFLINE').length,
    sessoesMes,
    energiaMesKWh: Number(todosKpis.reduce((t, k) => t + k.energiaMesKWh, 0).toFixed(1)),
    faturamentoRedeMes: Number(faturamentoRedeMes.toFixed(2)),
    royaltiesMes: Number(royaltiesMes.toFixed(2)),
    ticketMedio: sessoesMes ? Number((faturamentoRedeMes / sessoesMes).toFixed(2)) : 0,
    pontosAbaixoDoLimiar: todosKpis.filter(
      (k) => k.horasUsoDia < REGRAS.limiarViabilidadeHoras,
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
    .filter((p) => p.ativo)
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
