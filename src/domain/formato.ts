/**
 * Formatação única em pt-BR para telas, textos da IA e explicação de preço (vale no app e no
 * simulador). Regra: nenhum número vai para a tela com toFixed — sempre passa por aqui.
 */
import { FUSO } from './tempo';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const numero = (casas: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** R$ 1.466,25 */
export const brl = (v: number): string => moeda.format(v);

/** R$ 980 · R$ 24,1 mil · R$ 1,2 mi */
export function brlCurto(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `R$ ${numero(1).format(v / 1_000_000)} mi`;
  if (a >= 10_000) return `R$ ${numero(1).format(v / 1000)} mil`;
  return brl(v);
}

/** 1.234 · 3,4 */
export const num = (v: number, casas = 0): string => numero(casas).format(v);

/** 833 kWh · 12,6 MWh */
export const kwh = (v: number): string =>
  Math.abs(v) >= 10_000 ? `${num(v / 1000, 1)} MWh` : `${num(v, v < 10 ? 1 : 0)} kWh`;

/** 7,0 kW */
export const kw = (v: number): string => `${num(v, 1)} kW`;

/** R$ 1,90/kWh */
export const tarifaKWh = (v: number): string => `${brl(v)}/kWh`;

/** 3,4 h */
export const horas = (v: number): string => `${num(v, 1)} h`;

/** fração → 12,5% (pct(0.125, 1)) */
export const pct = (fracao: number, casas = 0): string => `${num(fracao * 100, casas)}%`;

/** variação → +4% · −4% · 0% (sinal de menos tipográfico) */
export function delta(fracao: number, casas = 0): string {
  const v = num(Math.abs(fracao) * 100, casas);
  if (Math.abs(fracao) < 0.5 / 10 ** (casas + 2)) return '0%';
  return `${fracao > 0 ? '+' : '−'}${v}%`;
}

const fData = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' });
const fDataAno = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: '2-digit' });
const fHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });
const fMes = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, month: 'short' });

/** 20/10 */
export const data = (iso: string | Date): string => fData.format(new Date(iso));
/** 20/10/26 */
export const dataAno = (iso: string | Date): string => fDataAno.format(new Date(iso));
/** 21:43 */
export const horaMin = (iso: string | Date): string => fHora.format(new Date(iso));
/** 20/10 21:43 */
export const dataHora = (iso: string | Date): string => `${data(iso)} ${horaMin(iso)}`;
/** out */
export const mesCurto = (iso: string | Date): string => fMes.format(new Date(iso)).replace('.', '');

/** há 5 min · há 2 h · há 3 dias */
export function relativo(iso: string | Date, agora = Date.now()): string {
  const s = Math.max(0, (agora - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86_400) return `há ${Math.round(s / 3600)} h`;
  const d = Math.round(s / 86_400);
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
}

/** 1 sessão · 3 sessões */
export const plural = (n: number, um: string, varios: string): string => `${num(n)} ${n === 1 ? um : varios}`;
