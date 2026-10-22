/**
 * Memória da barra de baixo do totem em pé (componentes em BarraInferior.tsx): quanto da altura da
 * tela a barra ocupa e até quanto ela pode subir. Fica no aparelho (localStorage), por totem.
 */

const CHAVE_BARRA = 'pontow.totem.barra';
const CHAVE_LIMITE = 'pontow.totem.barraMax';
/** limites oferecidos no menu de manutenção, em fração da altura da tela (0 = alça desligada) */
export const LIMITES_BARRA = [0, 0.2, 0.3, 0.4] as const;
const LIMITE_PADRAO = 0.3;
/** abaixo disso a barra fecha: evita uma faixa de poucos pixels aberta sem querer */
const MINIMO_ABERTA = 0.02;

const fracao = (v: string | null, padrao: number) => {
  const n = Number(v);
  return v != null && Number.isFinite(n) && n >= 0 && n <= 1 ? n : padrao;
};
const ler = (chave: string, padrao: number) => {
  try { return fracao(localStorage.getItem(chave), padrao); } catch { return padrao; }
};
const gravar = (chave: string, valor: number) => {
  try { localStorage.setItem(chave, String(Math.round(valor * 1000) / 1000)); } catch { /* sem armazenamento: vale até recarregar */ }
};

export const lerBarra = () => ler(CHAVE_BARRA, 0);
export const lerLimiteBarra = () => ler(CHAVE_LIMITE, LIMITE_PADRAO);
export const gravarBarra = (v: number) => gravar(CHAVE_BARRA, v);
export const gravarLimiteBarra = (v: number) => gravar(CHAVE_LIMITE, v);
/** a altura que vale: nunca acima do limite, e quase fechada vira fechada */
export const limitarBarra = (v: number, limite: number) => (v < MINIMO_ABERTA ? 0 : Math.min(v, limite));
