import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { limitarBarra } from './barraDoTotem';

/**
 * Barra de baixo do totem em pé. Num totem alto, o rodapé da tela (ação, vagas, demonstração) fica
 * perto do chão: quem instala arrasta a alça do canto inferior direito para cima, a tela "sobe" e o
 * espaço que sobra embaixo vira uma faixa preta com o símbolo do Ponto W. A altura fica guardada no
 * aparelho (barraDoTotem.ts) e o limite é escolhido no menu de manutenção (5 toques no logo).
 */

/** símbolo oficial: o anel vermelho com o W, que é um pico de energia (Identidade Ponto W) */
export function SimboloPontoW({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" role="img" aria-label="Ponto W">
      <circle cx="60" cy="60" r="53" fill="none" stroke="#E60012" strokeWidth="7" />
      <path d="M24 50 L40 84 L60 36 L80 84 L96 50" fill="none" stroke="#F4F2EE" strokeWidth="11" strokeLinejoin="miter" strokeLinecap="butt" />
    </svg>
  );
}

/** a faixa preta que ocupa o espaço de baixo, com o símbolo no meio */
export function BarraInferior({ altura }: { altura: number }) {
  if (altura <= 0) return null;
  return (
    <div className="quiosque-barra" style={{ height: `${altura * 100}%` }} aria-hidden="true">
      <SimboloPontoW className="quiosque-barra-simbolo" />
    </div>
  );
}

/**
 * A alça: arrastar para cima abre a barra (até o limite), para baixo fecha. Também responde às
 * setas do teclado. `aoMudar` recebe a fração da altura da tela; `aoSoltar`, a posição final.
 */
export function AlcaBarra({ valor, limite, aoMudar, aoSoltar }: {
  valor: number; limite: number; aoMudar: (v: number) => void; aoSoltar: (v: number) => void;
}) {
  const arrasto = useRef<{ id: number; y0: number; v0: number; h: number; ultimo: number } | null>(null);

  const inicio = (e: PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    arrasto.current = { id: e.pointerId, y0: e.clientY, v0: valor, h: window.innerHeight || 1, ultimo: valor };
  };
  const movendo = (e: PointerEvent<HTMLButtonElement>) => {
    const a = arrasto.current;
    if (!a || a.id !== e.pointerId) return;
    const v = Math.max(0, Math.min(limite, a.v0 + (a.y0 - e.clientY) / a.h));
    a.ultimo = v;
    aoMudar(v);
  };
  const fim = (e: PointerEvent<HTMLButtonElement>) => {
    const a = arrasto.current;
    if (!a || a.id !== e.pointerId) return;
    arrasto.current = null;
    const v = limitarBarra(a.ultimo, limite);
    aoMudar(v);
    aoSoltar(v);
  };
  const teclas = (e: KeyboardEvent<HTMLButtonElement>) => {
    const passo = { ArrowUp: 0.02, ArrowDown: -0.02 }[e.key];
    const alvo = passo != null ? valor + passo : e.key === 'Home' ? 0 : e.key === 'End' ? limite : null;
    if (alvo == null) return;
    e.preventDefault();
    const v = limitarBarra(Math.max(0, Math.min(limite, alvo)), limite);
    aoMudar(v);
    aoSoltar(v);
  };

  const noTopo = valor >= limite - 0.001;
  return (
    <button
      type="button" className="quiosque-alca" role="slider" aria-orientation="vertical"
      aria-label="Altura da tela do totem: arraste para cima para subir a tela"
      aria-valuemin={0} aria-valuemax={Math.round(limite * 100)} aria-valuenow={Math.round(valor * 100)}
      aria-valuetext={valor > 0 ? `barra de ${Math.round(valor * 100)}% da tela` : 'barra fechada'}
      onPointerDown={inicio} onPointerMove={movendo} onPointerUp={fim} onPointerCancel={fim} onKeyDown={teclas}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={noTopo ? 'M6 9l6 6 6-6' : 'M6 15l6-6 6 6'} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
