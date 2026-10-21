import type { Persona } from './estado';

/**
 * Vitrine (notebook: barra lateral com todos os painéis + aparelho emoldurado) ou tela cheia
 * (só o ambiente daquele papel, como no aparelho real). ?tela=cheia ou ?tela=vitrine escolhe e
 * fica lembrado por papel; sem escolha, motorista e totem abrem em tela cheia no celular.
 */
export function telaCheia(qual: Persona, search: string): boolean {
  const pedido = new URLSearchParams(search).get('tela');
  const chave = `pontow.tela.${qual}`;
  try {
    if (pedido === 'cheia' || pedido === 'vitrine') localStorage.setItem(chave, pedido);
    const salvo = localStorage.getItem(chave);
    if (salvo) return salvo === 'cheia';
  } catch {
    if (pedido) return pedido === 'cheia';
  }
  return (qual === 'motorista' || qual === 'totem') && window.innerWidth < 768;
}

/** mesmo endereço, trocando só o modo de tela */
export function comTela(pathname: string, search: string, tela: 'cheia' | 'vitrine'): string {
  const p = new URLSearchParams(search);
  p.set('tela', tela);
  return `${pathname}?${p.toString()}`;
}

/** liga ou desliga a tela cheia do navegador junto com a troca de modo (precisa de clique) */
export function telaDoNavegador(cheia: boolean) {
  try {
    if (cheia && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    if (!cheia && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  } catch { /* navegador sem a API de tela cheia */ }
}
