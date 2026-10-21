import type {
  Anomalia,
  KPIsPonto,
  Ponto,
  PrevisaoHora,
  Recomendacao,
  Regiao,
  Sessao,
  SolicitacaoHomologacao,
  Carregador,
} from '../types';
import { CURVA_DEMANDA_HORA, REGRAS, FORMATOS, MODELOS_CARREGADOR } from '../catalogo';
import type { FormatoFranquia } from '../types';
import { brl, horas, kw, kwh, num, pct } from '../formato';
import { horaLocal } from '../tempo';

/** Potência necessária na entrada: vagas × potência do modelo do formato + 8 kW do comércio. */
export const cargaNecessariaKW = (formato: FormatoFranquia): number =>
  FORMATOS[formato].carregadores * MODELOS_CARREGADOR[FORMATOS[formato].modelo].potenciaKW + 8;

/**
 * PILAR 4 — IA APLICADA
 *
 * Regra que seguimos: toda IA aqui MUDA UMA DECISÃO do sistema.
 * Se um modelo só enfeitaria uma tela, ele não entra.
 *
 * Estratégia de cold start: no dia 1 não há histórico, então partimos de
 * regras + a curva pública de demanda; conforme a rede gera sessões, o peso
 * do histórico real cresce e os modelos assumem.
 */

// ---------------------------------------------------------------- previsão
/**
 * Prevê ocupação e energia por hora, misturando o histórico real do ponto
 * com a curva de referência do setor. Decide: pré-alocação de potência e
 * sugestão de horário ao motorista.
 */
export function preverDemanda(
  sessoesHistoricas: Sessao[],
  qtdCarregadores: number,
): PrevisaoHora[] {
  const porHora = new Array(24).fill(0);
  const energiaPorHora = new Array(24).fill(0);

  for (const s of sessoesHistoricas) {
    const h = horaLocal(s.inicio);
    porHora[h] += 1;
    energiaPorHora[h] += s.energiaKWh;
  }

  const totalAmostras = sessoesHistoricas.length;
  // quanto mais histórico, menos peso para a curva genérica (cold start)
  const pesoHistorico = Math.min(1, totalAmostras / 400);
  const dias = Math.max(1, estimarDias(sessoesHistoricas));

  return Array.from({ length: 24 }, (_, hora) => {
    const mediaSessoes = porHora[hora] / dias;
    const ocupacaoHistorica = Math.min(1, mediaSessoes / Math.max(1, qtdCarregadores));
    const ocupacaoReferencia = CURVA_DEMANDA_HORA[hora] * 0.75;

    const ocupacaoPrevista =
      ocupacaoHistorica * pesoHistorico + ocupacaoReferencia * (1 - pesoHistorico);

    const energiaHistorica = energiaPorHora[hora] / dias;
    const energiaPrevista =
      energiaHistorica * pesoHistorico +
      ocupacaoReferencia * qtdCarregadores * 6.5 * (1 - pesoHistorico);

    return {
      hora,
      ocupacaoPrevista: Number(ocupacaoPrevista.toFixed(3)),
      energiaPrevistaKWh: Number(energiaPrevista.toFixed(2)),
    };
  });
}

function estimarDias(sessoes: Sessao[]): number {
  if (!sessoes.length) return 1;
  let min = Infinity;
  let max = -Infinity;
  for (const s of sessoes) {
    const t = new Date(s.inicio).getTime();
    if (t < min) min = t;
    if (t > max) max = t;
  }
  return Math.max(1, Math.round((max - min) / 86400000));
}

/** Horas do dia com risco de estourar a entrada elétrica. */
export function horasDeRisco(previsao: PrevisaoHora[], limiteKW: number, cargaBaseKW: number): number[] {
  return previsao
    .filter((p) => p.energiaPrevistaKWh + cargaBaseKW > limiteKW * 0.9)
    .map((p) => p.hora);
}

// ---------------------------------------------------------------- viabilidade
export interface AnaliseViabilidade {
  score: number;
  horasUsoPrevistas: number;
  veredito: 'APROVAR' | 'APROVAR_COM_RESSALVA' | 'REPROVAR';
  parecer: string;
  fatores: { rotulo: string; peso: number; nota: number }[];
}

/**
 * O modelo que decide a HOMOLOGAÇÃO do ponto.
 * Como a unidade só se paga acima de ~2,3 h/dia por carregador, aprovar um
 * local fraco prejudica o franqueado e suja a marca. Esta é a IA com a
 * consequência econômica mais direta do sistema.
 */
export function analisarViabilidade(
  s: Pick<
    SolicitacaoHomologacao,
    'fluxoDiarioPessoas' | 'cargaDisponivelKW' | 'formatoDesejado' | 'segmento'
  >,
  regiao: Regiao,
): AnaliseViabilidade {

  // segmentos onde o tempo de permanência combina com o tempo de recarga
  const aderenciaSegmento: Record<string, number> = {
    'Mercado': 0.95,
    'Shopping': 1.0,
    'Café / Restaurante': 0.9,
    'Clínica': 0.8,
    'Posto': 0.7,
    'Loja de rua': 0.55,
    'Farmácia': 0.45,
  };

  const notaFluxo = Math.min(1, s.fluxoDiarioPessoas / 900);
  const notaRegiao = regiao.densidadeEV;
  const notaSegmento = aderenciaSegmento[s.segmento] ?? 0.6;
  const cargaNecessaria = cargaNecessariaKW(s.formatoDesejado);
  const notaCarga = Math.min(1, s.cargaDisponivelKW / cargaNecessaria);

  const fatores = [
    { rotulo: 'Fluxo de pessoas', peso: 0.3, nota: notaFluxo },
    { rotulo: 'Densidade de EVs na região', peso: 0.28, nota: notaRegiao },
    { rotulo: 'Aderência do segmento', peso: 0.24, nota: notaSegmento },
    { rotulo: 'Capacidade elétrica', peso: 0.18, nota: notaCarga },
  ];

  const score = Math.round(fatores.reduce((t, f) => t + f.peso * f.nota, 0) * 100);

  // converte o score em horas de uso esperadas por carregador
  const horasUsoPrevistas = Number((0.6 + (score / 100) * 4.6).toFixed(2));

  let veredito: AnaliseViabilidade['veredito'];
  let parecer: string;

  if (notaCarga < 0.75) {
    veredito = 'REPROVAR';
    parecer = `Entrada elétrica insuficiente: ${kw(s.cargaDisponivelKW)} disponíveis contra ${kw(cargaNecessaria)} necessários para o formato ${s.formatoDesejado}. Requer upgrade de padrão antes de reavaliar.`;
  } else if (horasUsoPrevistas >= REGRAS.limiarViabilidadeHoras + 0.6) {
    veredito = 'APROVAR';
    parecer = `Uso previsto de ${horas(horasUsoPrevistas)}/dia por carregador, acima do limiar de ${horas(REGRAS.limiarViabilidadeHoras)}. Fluxo e perfil do segmento sustentam o investimento.`;
  } else if (horasUsoPrevistas >= REGRAS.limiarViabilidadeHoras) {
    veredito = 'APROVAR_COM_RESSALVA';
    parecer = `Uso previsto de ${horas(horasUsoPrevistas)}/dia, apenas ligeiramente acima do limiar de ${horas(REGRAS.limiarViabilidadeHoras)}. Sugerido começar no formato Light e expandir com dados reais.`;
  } else {
    veredito = 'REPROVAR';
    parecer = `Uso previsto de ${horas(horasUsoPrevistas)}/dia, abaixo do limiar de ${horas(REGRAS.limiarViabilidadeHoras)} necessário para o retorno. Aprovar este ponto frustraria o franqueado.`;
  }

  return { score, horasUsoPrevistas, veredito, parecer, fatores };
}

// ---------------------------------------------------------------- recomendações
/** Traduz métricas em orientação de gestão (a camada de NLP do sistema). */
export function gerarRecomendacoes(
  ponto: Ponto,
  kpis: KPIsPonto,
  previsao: PrevisaoHora[],
): Recomendacao[] {
  const recs: Recomendacao[] = [];
  const pico = [...previsao].sort((a, b) => b.ocupacaoPrevista - a.ocupacaoPrevista)[0];
  const vale = [...previsao]
    .filter((p) => p.hora >= 6 && p.hora <= 22)
    .sort((a, b) => a.ocupacaoPrevista - b.ocupacaoPrevista)[0];

  if (pico && pico.ocupacaoPrevista > 0.75) {
    recs.push({
      id: `rec-pico-${ponto.id}`,
      pontoId: ponto.id,
      severidade: 'atencao',
      titulo: `Pico previsto às ${pico.hora}h`,
      detalhe: `A ocupação deve chegar a ${pct(pico.ocupacaoPrevista)} às ${pico.hora}h. Aplicar tarifa cheia nesse horário e pré-alocar potência evita fila e protege a entrada elétrica.`,
      decisao: 'Tarifa da faixa + pré-alocação de potência',
    });
  }

  if (vale && vale.ocupacaoPrevista < 0.25) {
    recs.push({
      id: `rec-vale-${ponto.id}`,
      pontoId: ponto.id,
      severidade: 'info',
      titulo: `Ociosidade às ${vale.hora}h`,
      detalhe: `Às ${vale.hora}h o ponto fica praticamente vazio. Um desconto nessa faixa atrai recarga de oportunidade e traz cliente para a loja no horário fraco.`,
      decisao: 'Desconto na faixa de vale',
    });
  }

  if (kpis.horasUsoDia < REGRAS.limiarViabilidadeHoras) {
    recs.push({
      id: `rec-limiar-${ponto.id}`,
      pontoId: ponto.id,
      severidade: 'critico',
      titulo: 'Abaixo do limiar de viabilidade',
      detalhe: `O ponto opera a ${horas(kpis.horasUsoDia)}/dia por carregador, abaixo das ${horas(REGRAS.limiarViabilidadeHoras)} necessárias para o retorno. Ações: sinalização na fachada, divulgação em apps de mapa e parceria de consumo com a loja.`,
      decisao: 'Plano de ativação comercial do ponto',
    });
  }

  if (kpis.ticketMedio > 0 && kpis.ticketMedio < 12) {
    recs.push({
      id: `rec-ticket-${ponto.id}`,
      pontoId: ponto.id,
      severidade: 'info',
      titulo: 'Sessões curtas demais',
      detalhe: `O ticket médio de ${brl(kpis.ticketMedio)} indica recargas rápidas. Sessões curtas geram pouca permanência — e a permanência é o que traz venda para a loja.`,
      decisao: 'Revisar preço mínimo por sessão',
    });
  }

  return recs;
}

/** Resumo em linguagem natural para o painel do lojista. */
export function resumoGerencial(
  ponto: Ponto,
  kpis: KPIsPonto,
  previsao: PrevisaoHora[],
  /** sessões fechadas do ponto na base; com poucas, o pico vem da curva de referência do setor */
  sessoesNaBase = Infinity,
): string {
  if (kpis.sessoesMes === 0) {
    return `${ponto.nome} ainda não fechou recargas neste mês. A leitura aparece assim que as primeiras sessões forem concluídas.`;
  }
  const pico = [...previsao].sort((a, b) => b.ocupacaoPrevista - a.ocupacaoPrevista)[0];
  const saude =
    kpis.horasUsoDia >= REGRAS.limiarViabilidadeHoras + 0.7
      ? 'saudável'
      : kpis.horasUsoDia >= REGRAS.limiarViabilidadeHoras
        ? 'no limite'
        : 'abaixo do esperado';
  const sobrePico = !pico
    ? ''
    : sessoesNaBase >= 30
      ? ` O pico costuma ser às ${pico.hora}h — é nessa janela que a recarga mais traz gente para dentro da loja.`
      : ` Ainda há poucos dados reais; pela curva de referência do setor, o pico tende a ser às ${pico.hora}h.`;

  return (
    `No mês, ${ponto.nome} entregou ${kwh(kpis.energiaMesKWh)} em ${num(kpis.sessoesMes)} ${kpis.sessoesMes === 1 ? 'sessão' : 'sessões'}, ` +
    `faturando ${brl(kpis.faturamentoMes)} e deixando ${brl(kpis.liquidoMes)} líquidos. ` +
    `A utilização está ${saude} (${horas(kpis.horasUsoDia)}/dia por carregador, meta de ${horas(REGRAS.limiarViabilidadeHoras)}).` +
    sobrePico
  );
}

// ---------------------------------------------------------------- previsão financeira
export interface PrevisaoFinanceira {
  horasUsoDia: number;
  vagas: number;
  energiaMesKWh: number;
  sessoesMes: number;
  receitaMes: number;
  custoEnergiaMes: number;
  royaltiesMes: number;
  gatewayMes: number;
  plataformaMes: number;
  margemVarejoMes: number;
  /** o que fica com o comércio por mês, já com a plataforma e o ganho no varejo */
  resultadoMes: number;
  capex: number;
  /** Infinity quando o resultado não é positivo */
  paybackMeses: number;
}

/**
 * Quanto o ponto deve render por mês a partir do uso previsto (h/dia por vaga).
 * Usada na homologação e no painel do ponto ainda em instalação: não é histórico, é estimativa.
 * `kwhPorHora` é a energia média entregue por hora de recarga na rede; `kwhPorSessao`, a média por sessão.
 */
export function preverFinanceiro(a: {
  formato: FormatoFranquia;
  horasUsoDia: number;
  precoKWh: number;
  custoEnergiaKWh: number;
  kwhPorHora: number;
  kwhPorSessao: number;
}): PrevisaoFinanceira {
  const cfg = FORMATOS[a.formato];
  const energia = a.horasUsoDia * 30 * cfg.carregadores * a.kwhPorHora;
  const sessoes = a.kwhPorSessao > 0 ? energia / a.kwhPorSessao : 0;
  const receita = energia * a.precoKWh;
  const custoEnergia = energia * a.custoEnergiaKWh;
  const royalties = receita * (REGRAS.royaltyPct + REGRAS.fundoPct);
  const gateway = receita * REGRAS.gatewayPct;
  const varejo = sessoes * REGRAS.conversaoLoja * REGRAS.ticketVarejoIncremental * REGRAS.margemVarejo;
  const resultado = receita - custoEnergia - royalties - gateway - REGRAS.plataformaMes + varejo;
  return {
    horasUsoDia: a.horasUsoDia,
    vagas: cfg.carregadores,
    energiaMesKWh: energia,
    sessoesMes: sessoes,
    receitaMes: receita,
    custoEnergiaMes: custoEnergia,
    royaltiesMes: royalties,
    gatewayMes: gateway,
    plataformaMes: REGRAS.plataformaMes,
    margemVarejoMes: varejo,
    resultadoMes: resultado,
    capex: cfg.capex,
    paybackMeses: resultado > 0 ? cfg.capex / resultado : Infinity,
  };
}

// ---------------------------------------------------------------- anomalias
export function detectarAnomalias(
  ponto: Ponto,
  carregadores: Carregador[],
  sessoes: Sessao[],
  agora: Date,
): Anomalia[] {
  const anomalias: Anomalia[] = [];

  for (const c of carregadores) {
    const minutosSemHeartbeat =
      (agora.getTime() - new Date(c.ultimoHeartbeat).getTime()) / 60000;
    if (c.estado === 'OFFLINE' || minutosSemHeartbeat > 30) {
      anomalias.push({
        id: `an-off-${c.id}`,
        pontoId: ponto.id,
        carregadorId: c.id,
        tipo: 'Carregador sem comunicação',
        detectadaEm: agora.toISOString(),
        detalhe: `${c.apelido} está há ${minutosSemHeartbeat >= 120 ? `${num(minutosSemHeartbeat / 60)} h` : `${num(minutosSemHeartbeat)} min`} sem enviar telemetria. Verificar rede ou o link Modbus/RS-485.`,
      });
    }
  }

  const concluidas = sessoes.filter((s) => s.estado === 'CONCLUIDO' || s.estado === 'FATURADO');
  const curtas = concluidas.filter((s) => s.energiaKWh < 1.5);
  if (concluidas.length >= 10 && curtas.length / concluidas.length > 0.25) {
    anomalias.push({
      id: `an-curtas-${ponto.id}`,
      pontoId: ponto.id,
      tipo: 'Excesso de sessões interrompidas',
      detectadaEm: agora.toISOString(),
      detalhe: `${curtas.length} de ${concluidas.length} sessões entregaram menos de 1,5 kWh. Pode indicar mau contato no conector ou desistência por preço.`,
    });
  }

  return anomalias;
}
