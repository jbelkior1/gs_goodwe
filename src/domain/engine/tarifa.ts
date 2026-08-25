import type { Ponto, Regiao } from '../types';
import { CURVA_DEMANDA_HORA, REGRAS } from '../catalogo';

/**
 * PILAR 3 — TARIFAÇÃO E PAGAMENTO
 *
 * A REN ANEEL 1.000/2021 permite preço livremente negociado na recarga
 * comercial. Isso torna legal (e necessário) precificar de forma dinâmica.
 * O preço é sempre mostrado ANTES de iniciar e travado na sessão.
 */

export interface ComposicaoTarifa {
  precoBaseKWh: number;
  fatorHorario: number;
  fatorOcupacao: number;
  fatorEnergia: number;
  precoFinalKWh: number;
  custoEnergiaKWh: number;
  margemKWh: number;
  margemPct: number;
  explicacao: string[];
}

/**
 * Fator por faixa horária: mais caro no pico, desconto no vale.
 * Empurra parte da demanda para fora do horário crítico — o que também
 * alivia o controle de demanda.
 */
export function fatorHorario(hora: number): number {
  const d = CURVA_DEMANDA_HORA[hora % 24];
  if (d >= 0.85) return 1.2;
  if (d >= 0.6) return 1.08;
  if (d >= 0.3) return 1.0;
  if (d >= 0.1) return 0.92;
  return 0.85;
}

/** Quanto mais cheio o ponto, mais valiosa a vaga. */
export function fatorOcupacao(ocupacao: number): number {
  if (ocupacao >= 0.9) return 1.15;
  if (ocupacao >= 0.7) return 1.07;
  if (ocupacao <= 0.2) return 0.95;
  return 1.0;
}

/** Repassa variação do custo de energia da região, com amortecimento. */
export function fatorEnergia(custoRegiao: number, custoReferencia = 0.85): number {
  const razao = custoRegiao / custoReferencia;
  return Number((1 + (razao - 1) * 0.6).toFixed(3));
}

export function calcularTarifa(
  ponto: Ponto,
  regiao: Regiao,
  hora: number,
  ocupacao: number,
): ComposicaoTarifa {
  const fh = fatorHorario(hora);
  const fo = fatorOcupacao(ocupacao);
  const fe = fatorEnergia(regiao.custoEnergiaKWh);

  const precoFinalKWh = Number((ponto.precoBaseKWh * fh * fo * fe).toFixed(2));
  const margemKWh = Number((precoFinalKWh - regiao.custoEnergiaKWh).toFixed(2));

  const explicacao: string[] = [];
  explicacao.push(`Preço base do ponto: R$ ${ponto.precoBaseKWh.toFixed(2)}/kWh`);
  if (fh > 1) explicacao.push(`Horário de pico (+${Math.round((fh - 1) * 100)}%)`);
  else if (fh < 1) explicacao.push(`Fora de pico (${Math.round((fh - 1) * 100)}%)`);
  if (fo > 1) explicacao.push(`Ponto concorrido (+${Math.round((fo - 1) * 100)}%)`);
  else if (fo < 1) explicacao.push(`Ponto vazio (${Math.round((fo - 1) * 100)}%)`);
  if (Math.abs(fe - 1) > 0.01) {
    explicacao.push(
      `Custo de energia em ${regiao.cidade} (${fe > 1 ? '+' : ''}${Math.round((fe - 1) * 100)}%)`,
    );
  }

  return {
    precoBaseKWh: ponto.precoBaseKWh,
    fatorHorario: fh,
    fatorOcupacao: fo,
    fatorEnergia: fe,
    precoFinalKWh,
    custoEnergiaKWh: regiao.custoEnergiaKWh,
    margemKWh,
    margemPct: precoFinalKWh ? margemKWh / precoFinalKWh : 0,
    explicacao,
  };
}

export interface RepassePagamento {
  valorBruto: number;
  custoEnergia: number;
  royaltyGoodWe: number;
  fundoMarketing: number;
  gateway: number;
  liquidoLojista: number;
}

/**
 * Reparte o valor de uma recarga.
 * Royalties e fundo incidem SÓ sobre a recarga — nunca sobre as vendas da
 * loja do comerciante. Essa fronteira é o que torna a franquia atrativa.
 */
export function repartir(valorBruto: number, energiaKWh: number, custoEnergiaKWh: number): RepassePagamento {
  const custoEnergia = Number((energiaKWh * custoEnergiaKWh).toFixed(2));
  const royaltyGoodWe = Number((valorBruto * REGRAS.royaltyPct).toFixed(2));
  const fundoMarketing = Number((valorBruto * REGRAS.fundoPct).toFixed(2));
  const gateway = Number((valorBruto * REGRAS.gatewayPct).toFixed(2));
  const liquidoLojista = Number(
    (valorBruto - custoEnergia - royaltyGoodWe - fundoMarketing - gateway).toFixed(2),
  );
  return { valorBruto, custoEnergia, royaltyGoodWe, fundoMarketing, gateway, liquidoLojista };
}

/** Gera um txid no formato de Pix dinâmico (mock). */
export function gerarTxid(sessaoId: string): string {
  const base = sessaoId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `PONTOW${base.slice(-10).padStart(10, '0')}`;
}

/**
 * Payload copia-e-cola do Pix (MOCK, formato EMV simplificado).
 * A chave e ficticia e o codigo nao e valido para pagamento real —
 * serve so para a demonstracao da tela.
 */
export function gerarPixCopiaECola(txid: string, valor: number): string {
  const v = valor.toFixed(2);
  return `00020126580014BR.GOV.BCB.PIX0130pix@pontow.demo5204000053039865802BR5913PONTO W LTDA6009SAO PAULO62070503${txid}5405${v}6304ABCD`;
}
