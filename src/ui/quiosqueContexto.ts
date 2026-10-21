import { createContext, useCallback, useContext, useEffect, useRef } from 'react';

/** resolução REAL de cada modo (1 px CSS = 1 px do monitor): só escala quando a tela é diferente */
export const DESENHO = { vertical: { w: 1080, h: 1920 }, horizontal: { w: 1920, h: 1080 } } as const;

/** O que o quiosque (a casca do aparelho) oferece às telas do totem. */
export interface CtxQuiosque {
  /** abre o menu de manutenção escondido */
  abrirMenu: () => void;
}

export const QuiosqueCtx = createContext<CtxQuiosque | null>(null);

/** null quando o totem está na vitrine (sem casca de quiosque) */
export const useQuiosque = (): CtxQuiosque | null => useContext(QuiosqueCtx);

/**
 * Chama aoInativar depois de `ms` sem toque nem tecla, uma vez por período de inatividade.
 * Vale na vitrine e no aparelho: o totem zera conversa, escolha de vaga e erros.
 */
export function useInatividade(ms: number, aoInativar: () => void) {
  const ultimo = useRef(aoInativar);
  useEffect(() => { ultimo.current = aoInativar; });
  useEffect(() => {
    let timer = 0;
    const armar = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => ultimo.current(), ms);
    };
    armar();
    const eventos = ['pointerdown', 'keydown', 'wheel'] as const;
    eventos.forEach((e) => window.addEventListener(e, armar, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      eventos.forEach((e) => window.removeEventListener(e, armar));
    };
  }, [ms]);
}

/** Acesso escondido: N toques seguidos (padrão: 5 em 3 s) no mesmo ponto. Devolve o onClick. */
export function useToquesSecretos(aoAtingir: () => void, quantos = 5, janelaMs = 3000) {
  const toques = useRef<number[]>([]);
  return useCallback(() => {
    const agora = Date.now();
    toques.current = [...toques.current.filter((t) => agora - t < janelaMs), agora];
    if (toques.current.length >= quantos) {
      toques.current = [];
      aoAtingir();
    }
  }, [aoAtingir, quantos, janelaMs]);
}
