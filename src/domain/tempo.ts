/**
 * Relógio da rede: tudo que depende de hora (faixa de preço, dia do gráfico, "hoje") usa o fuso
 * de Brasília, não o do aparelho nem o do servidor (um agente em UTC deslocaria o pico em 3 h).
 */
export const FUSO = 'America/Sao_Paulo';

type Quando = Date | string | number;

const partes = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
});
const DIAS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function local(q: Quando = new Date()) {
  const p = Object.fromEntries(partes.formatToParts(new Date(q)).map((x) => [x.type, x.value]));
  return { ano: p.year, mes: p.month, dia: p.day, hora: Number(p.hour), minuto: Number(p.minute), semana: DIAS.indexOf(p.weekday) };
}

/** hora 0–23 em Brasília */
export const horaLocal = (q?: Quando): number => local(q).hora;

/** minuto 0–59 em Brasília */
export const minutoLocal = (q?: Quando): number => local(q).minuto;

/** chave do dia em Brasília: 'AAAA-MM-DD' (use no lugar de toISOString().slice(0, 10)) */
export function diaLocal(q?: Quando): string {
  const l = local(q);
  return `${l.ano}-${l.mes}-${l.dia}`;
}

/** 0 = domingo … 6 = sábado, em Brasília */
export const diaSemanaLocal = (q?: Quando): number => local(q).semana;

/** sábado ou domingo */
export const fimDeSemana = (q?: Quando): boolean => [0, 6].includes(diaSemanaLocal(q));

/** a mesma chave de dia, n dias antes (n pode ser negativo) */
export function diaLocalMenos(n: number, q: Quando = new Date()): string {
  return diaLocal(new Date(new Date(q).getTime() - n * 86_400_000));
}
