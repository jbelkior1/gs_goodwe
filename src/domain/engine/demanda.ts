import type { Carregador, Ponto, Sessao } from '../types';
import { MODELOS_CARREGADOR } from '../catalogo';

/**
 * PILAR 1 — CONTROLE DE DEMANDA
 *
 * Cada ponto tem um limite elétrico de entrada. A soma da carga do próprio
 * comércio + as recargas ativas não pode passar desse limite, senão o
 * disjuntor abre. Este motor distribui a potência disponível entre as sessões
 * e reduz/pausa quem for preciso — é o "controle dinâmico" do HCA G2,
 * generalizado para vários carregadores.
 */

export interface EntradaDemanda {
  ponto: Ponto;
  carregadores: Carregador[];
  sessoesAtivas: Sessao[];
  /** carga instantânea do comércio (kW), lida do medidor */
  cargaComercioKW: number;
}

export interface AlocacaoSessao {
  sessaoId: string;
  carregadorId: string;
  potenciaSolicitadaKW: number;
  potenciaConcedidaKW: number;
  limitado: boolean;
  pausado: boolean;
  motivo?: string;
}

export interface ResultadoDemanda {
  limitePontoKW: number;
  cargaComercioKW: number;
  disponivelParaRecargaKW: number;
  demandaSolicitadaKW: number;
  demandaConcedidaKW: number;
  /** 0–1 — quanto da entrada elétrica está sendo usada */
  utilizacaoEntrada: number;
  emRestricao: boolean;
  alocacoes: AlocacaoSessao[];
}

/** margem de segurança: nunca encostar no limite do disjuntor */
const MARGEM_SEGURANCA = 0.92;
/** abaixo disso não vale manter a sessão ligada — melhor pausar */
const POTENCIA_MINIMA_UTIL_KW = 1.4;

/**
 * Prioridade de atendimento quando falta potência.
 * Quem está quase cheio cede espaço para quem chegou agora — o carro cheio
 * ganha pouco com mais 10 minutos, o vazio ganha muito.
 */
function prioridade(s: Sessao): number {
  const urgencia = 1 - s.socAtual / 100;
  const bonusTarifa = s.tarifaAplicadaKWh > 2 ? 0.15 : 0;
  return urgencia + bonusTarifa;
}

/**
 * Quanto o carro consegue puxar agora.
 * Acima de ~80% a bateria entra em CV e a corrente cai sozinha (curva CC/CV)
 * — o carregador não força, quem decide é o carro.
 */
export function potenciaDesejadaKW(
  sessao: Sessao,
  carregador: Carregador,
  potenciaMaxVeiculoKW: number,
): number {
  const teto = Math.min(
    MODELOS_CARREGADOR[carregador.modelo].potenciaKW,
    potenciaMaxVeiculoKW,
  );
  if (sessao.socAtual >= 100) return 0;
  if (sessao.socAtual <= 80) return teto;
  // rampa de descida de 100% do teto (em 80%) até 12% (em 100%)
  const fator = 1 - ((sessao.socAtual - 80) / 20) * 0.88;
  return teto * Math.max(0.12, fator);
}

export function calcularDemanda(
  entrada: EntradaDemanda,
  potenciaMaxVeiculoPorSessao: Record<string, number>,
): ResultadoDemanda {
  const { ponto, carregadores, sessoesAtivas, cargaComercioKW } = entrada;

  const limitePontoKW = ponto.limitePotenciaKW;
  const tetoSeguro = limitePontoKW * MARGEM_SEGURANCA;
  const disponivel = Math.max(0, tetoSeguro - cargaComercioKW);

  const porId = new Map(carregadores.map((c) => [c.id, c]));

  const pedidos = sessoesAtivas
    .map((s) => {
      const carregador = porId.get(s.carregadorId);
      const solicitada = carregador
        ? potenciaDesejadaKW(s, carregador, potenciaMaxVeiculoPorSessao[s.id] ?? 7)
        : 0;
      return { sessao: s, carregador, solicitada, prio: prioridade(s) };
    })
    .sort((a, b) => b.prio - a.prio);

  const demandaSolicitadaKW = pedidos.reduce((t, p) => t + p.solicitada, 0);

  const alocacoes: AlocacaoSessao[] = [];
  let restante = disponivel;

  for (const p of pedidos) {
    if (!p.carregador) continue;

    let concedida = Math.min(p.solicitada, restante);
    let pausado = false;
    let motivo: string | undefined;

    if (concedida < POTENCIA_MINIMA_UTIL_KW && p.solicitada > 0) {
      // não há potência útil sobrando: pausa e devolve o que reservou
      concedida = 0;
      pausado = true;
      motivo = 'Sem potência disponível — aguardando folga na entrada elétrica';
    } else if (concedida < p.solicitada - 0.05) {
      motivo = 'Potência reduzida para proteger o disjuntor do comércio';
    }

    restante = Math.max(0, restante - concedida);

    alocacoes.push({
      sessaoId: p.sessao.id,
      carregadorId: p.carregador.id,
      potenciaSolicitadaKW: Number(p.solicitada.toFixed(2)),
      potenciaConcedidaKW: Number(concedida.toFixed(2)),
      limitado: concedida < p.solicitada - 0.05,
      pausado,
      motivo,
    });
  }

  const demandaConcedidaKW = alocacoes.reduce((t, a) => t + a.potenciaConcedidaKW, 0);

  return {
    limitePontoKW,
    cargaComercioKW: Number(cargaComercioKW.toFixed(2)),
    disponivelParaRecargaKW: Number(disponivel.toFixed(2)),
    demandaSolicitadaKW: Number(demandaSolicitadaKW.toFixed(2)),
    demandaConcedidaKW: Number(demandaConcedidaKW.toFixed(2)),
    utilizacaoEntrada: limitePontoKW
      ? (cargaComercioKW + demandaConcedidaKW) / limitePontoKW
      : 0,
    emRestricao: demandaConcedidaKW < demandaSolicitadaKW - 0.05,
    alocacoes,
  };
}

/** Carga do comércio ao longo do dia (kW) — geladeiras, luzes, ar-condicionado. */
export function cargaComercioNaHora(ponto: Ponto, hora: number): number {
  // comércio acorda ~7h, pico no meio do dia, cai à noite
  const perfil = [
    0.25, 0.22, 0.2, 0.2, 0.22, 0.3, 0.5, 0.72, 0.85, 0.92, 0.96, 1.0,
    1.0, 0.95, 0.9, 0.88, 0.9, 0.95, 0.92, 0.8, 0.6, 0.45, 0.35, 0.28,
  ];
  return Number((ponto.cargaBaseKW * perfil[hora % 24]).toFixed(2));
}
