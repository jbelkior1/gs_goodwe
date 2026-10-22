import type { Ponto } from '../types';
import { CURVA_SOLAR_HORA } from '../catalogo';

/**
 * Geração própria do ponto (inversor + FV). Hoje NENHUM ponto da rede tem geração própria (22/10/2026:
 * o solar saiu das telas e dos dados), então isto devolve sempre zero. Fica só porque o controle de
 * demanda e o simulador abatem a geração da carga do comércio: com `temSolar` falso, a conta é a mesma
 * de um ponto sem painel.
 */
export function geracaoSolarKW(ponto: Ponto, hora: number): number {
  if (!ponto.temSolar) return 0;
  // fator de performance típico de sistema FV (perdas, temperatura, inversor)
  const performance = 0.78;
  return Number((ponto.potenciaFVkWp * CURVA_SOLAR_HORA[hora % 24] * performance).toFixed(2));
}
