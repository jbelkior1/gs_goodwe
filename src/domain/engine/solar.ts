import type { Ponto, Regiao } from '../types';
import { CURVA_SOLAR_HORA, FATOR_CO2_KG_KWH } from '../catalogo';
import { cargaComercioNaHora } from './demanda';

/**
 * ECOSSISTEMA GOODWE — inversor + FV + bateria junto do carregador.
 *
 * O HCA G2 tem os modos "Prioridade Solar" e "FV + Bateria": quando há
 * geração, a recarga puxa menos da rede. Isso tem dois efeitos que o sistema
 * mostra explicitamente:
 *   1. barateia o kWh vendido (margem maior para o franqueado);
 *   2. libera potência na entrada elétrica — mais folga para o controle
 *      de demanda, ou seja, menos pausa em horário de pico.
 */

export interface MixHora {
  hora: number;
  solarKW: number;
  baterialKW: number;
  redeKW: number;
  demandaKW: number;
}

/** Geração fotovoltaica estimada em uma hora (kW). */
export function geracaoSolarKW(ponto: Ponto, hora: number): number {
  if (!ponto.temSolar) return 0;
  // fator de performance típico de sistema FV (perdas, temperatura, inversor)
  const performance = 0.78;
  return Number((ponto.potenciaFVkWp * CURVA_SOLAR_HORA[hora % 24] * performance).toFixed(2));
}

/**
 * Monta o mix energético do dia: quanto da demanda (comércio + recarga) é
 * atendido por sol, por bateria e pela rede.
 */
export function mixDoDia(ponto: Ponto, recargaMediaKW: number): MixHora[] {
  let cargaBateria = ponto.temBateria ? 0 : 0;
  const horas: MixHora[] = [];

  for (let hora = 0; hora < 24; hora++) {
    const comercio = cargaComercioNaHora(ponto, hora);
    // a recarga acontece mais no horário comercial
    const recarga = recargaMediaKW * (hora >= 8 && hora <= 21 ? 1 : 0.15);
    const demandaKW = Number((comercio + recarga).toFixed(2));

    const solarBruto = geracaoSolarKW(ponto, hora);
    const solarUsado = Math.min(solarBruto, demandaKW);
    const excedente = Math.max(0, solarBruto - demandaKW);

    // excedente carrega a bateria; à noite ela devolve
    let bateriaKW = 0;
    if (ponto.temBateria) {
      if (excedente > 0) {
        const espaco = ponto.capacidadeBateriaKWh - cargaBateria;
        cargaBateria += Math.min(excedente, espaco);
      } else {
        const faltante = demandaKW - solarUsado;
        // descarrega no pico da noite, preservando 20% de reserva
        if (faltante > 0 && (hora >= 17 || hora <= 6)) {
          const disponivel = Math.max(0, cargaBateria - ponto.capacidadeBateriaKWh * 0.2);
          bateriaKW = Math.min(faltante, disponivel, ponto.capacidadeBateriaKWh * 0.5);
          cargaBateria -= bateriaKW;
        }
      }
    }

    horas.push({
      hora,
      solarKW: Number(solarUsado.toFixed(2)),
      baterialKW: Number(bateriaKW.toFixed(2)),
      redeKW: Number(Math.max(0, demandaKW - solarUsado - bateriaKW).toFixed(2)),
      demandaKW,
    });
  }

  return horas;
}

export interface ResumoSolar {
  temEcossistema: boolean;
  potenciaFVkWp: number;
  capacidadeBateriaKWh: number;
  geracaoDiaKWh: number;
  autoconsumoDiaKWh: number;
  /** fração da demanda coberta por sol + bateria */
  autossuficiencia: number;
  economiaMes: number;
  co2EvitadoMesKg: number;
  /** potência que o sol libera na entrada elétrica no horário de pico solar */
  folgaExtraKW: number;
}

export function resumoSolar(
  ponto: Ponto,
  regiao: Regiao,
  recargaMediaKW: number,
): ResumoSolar {
  const mix = mixDoDia(ponto, recargaMediaKW);

  const geracaoDiaKWh = Array.from({ length: 24 }, (_, h) => geracaoSolarKW(ponto, h))
    .reduce((t, v) => t + v, 0);
  const autoconsumoDiaKWh = mix.reduce((t, m) => t + m.solarKW + m.baterialKW, 0);
  const demandaDiaKWh = mix.reduce((t, m) => t + m.demandaKW, 0);

  const economiaMes = autoconsumoDiaKWh * 30 * regiao.custoEnergiaKWh;
  const co2EvitadoMesKg = autoconsumoDiaKWh * 30 * FATOR_CO2_KG_KWH;

  // no pico solar (12h) o sol cobre parte da carga e devolve folga à entrada
  const folgaExtraKW = geracaoSolarKW(ponto, 12);

  return {
    temEcossistema: ponto.temSolar,
    potenciaFVkWp: ponto.potenciaFVkWp,
    capacidadeBateriaKWh: ponto.capacidadeBateriaKWh,
    geracaoDiaKWh: Number(geracaoDiaKWh.toFixed(1)),
    autoconsumoDiaKWh: Number(autoconsumoDiaKWh.toFixed(1)),
    autossuficiencia: demandaDiaKWh ? Number((autoconsumoDiaKWh / demandaDiaKWh).toFixed(3)) : 0,
    economiaMes: Number(economiaMes.toFixed(2)),
    co2EvitadoMesKg: Number(co2EvitadoMesKg.toFixed(1)),
    folgaExtraKW: Number(folgaExtraKW.toFixed(2)),
  };
}
