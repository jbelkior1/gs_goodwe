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
import { CURVA_DEMANDA_HORA, REGRAS } from '../catalogo';

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
    const h = new Date(s.inicio).getHours();
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
  const carregadores = s.formatoDesejado === 'Light' ? 1 : s.formatoDesejado === 'Standard' ? 2 : 4;

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
  const cargaNecessaria = carregadores * 7 + 8;
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
    parecer = `Entrada elétrica insuficiente: ${s.cargaDisponivelKW} kW disponíveis contra ${cargaNecessaria} kW necessários para o formato ${s.formatoDesejado}. Requer upgrade de padrão antes de reavaliar.`;
  } else if (horasUsoPrevistas >= REGRAS.limiarViabilidadeHoras + 0.6) {
    veredito = 'APROVAR';
    parecer = `Uso previsto de ${horasUsoPrevistas.toFixed(1)} h/dia por carregador, acima do limiar de ${REGRAS.limiarViabilidadeHoras} h. Fluxo e perfil do segmento sustentam o investimento.`;
  } else if (horasUsoPrevistas >= REGRAS.limiarViabilidadeHoras) {
    veredito = 'APROVAR_COM_RESSALVA';
    parecer = `Uso previsto de ${horasUsoPrevistas.toFixed(1)} h/dia, apenas ligeiramente acima do limiar de ${REGRAS.limiarViabilidadeHoras} h. Sugerido começar no formato Light e expandir com dados reais.`;
  } else {
    veredito = 'REPROVAR';
    parecer = `Uso previsto de ${horasUsoPrevistas.toFixed(1)} h/dia, abaixo do limiar de ${REGRAS.limiarViabilidadeHoras} h necessário para o retorno. Aprovar este ponto frustraria o franqueado.`;
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
      detalhe: `A ocupação deve chegar a ${Math.round(pico.ocupacaoPrevista * 100)}% às ${pico.hora}h. Aplicar tarifa cheia nesse horário e pré-alocar potência evita fila e protege a entrada elétrica.`,
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
      detalhe: `O ponto opera a ${kpis.horasUsoDia.toFixed(1)} h/dia por carregador, abaixo das ${REGRAS.limiarViabilidadeHoras} h necessárias para o retorno. Ações: sinalização na fachada, divulgação em apps de mapa e parceria de consumo com a loja.`,
      decisao: 'Plano de ativação comercial do ponto',
    });
  }

  if (kpis.ticketMedio > 0 && kpis.ticketMedio < 12) {
    recs.push({
      id: `rec-ticket-${ponto.id}`,
      pontoId: ponto.id,
      severidade: 'info',
      titulo: 'Sessões curtas demais',
      detalhe: `O ticket médio de R$ ${kpis.ticketMedio.toFixed(2)} indica recargas rápidas. Sessões curtas geram pouca permanência — e a permanência é o que traz venda para a loja.`,
      decisao: 'Revisar preço mínimo por sessão',
    });
  }

  return recs;
}

/** Resumo em linguagem natural para o painel do lojista. */
export function resumoGerencial(ponto: Ponto, kpis: KPIsPonto, previsao: PrevisaoHora[]): string {
  const pico = [...previsao].sort((a, b) => b.ocupacaoPrevista - a.ocupacaoPrevista)[0];
  const saude =
    kpis.horasUsoDia >= REGRAS.limiarViabilidadeHoras + 0.7
      ? 'saudável'
      : kpis.horasUsoDia >= REGRAS.limiarViabilidadeHoras
        ? 'no limite'
        : 'abaixo do esperado';

  return (
    `No mês, ${ponto.nome} entregou ${kpis.energiaMesKWh.toFixed(0)} kWh em ${kpis.sessoesMes} sessões, ` +
    `faturando R$ ${kpis.faturamentoMes.toFixed(2)} e deixando R$ ${kpis.liquidoMes.toFixed(2)} líquidos. ` +
    `A utilização está ${saude} (${kpis.horasUsoDia.toFixed(1)} h/dia por carregador, limiar ${REGRAS.limiarViabilidadeHoras} h). ` +
    `O pico costuma ser às ${pico?.hora ?? 18}h — é nessa janela que a recarga mais traz gente para dentro da loja.`
  );
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
        detalhe: `${c.apelido} está há ${Math.round(minutosSemHeartbeat)} min sem enviar telemetria. Verificar rede ou o link Modbus/RS-485.`,
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
