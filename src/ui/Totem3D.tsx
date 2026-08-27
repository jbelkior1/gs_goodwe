import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Totem do eletroposto em 3D.
 *
 * O gabinete é montado com transformações CSS 3D — seis faces reais numa cena
 * com perspectiva, não uma imagem em perspectiva falsa. O conjunto acompanha
 * o mouse de leve, o que dá a leitura de volume sem virar brinquedo; quem
 * pediu menos movimento (prefers-reduced-motion) recebe a peça parada.
 */
export function Totem3D({ children }: { children: ReactNode }) {
  const palco = useRef<HTMLDivElement>(null);
  // ângulo de repouso: o gabinete já nasce de três-quartos, senão a peça lê
  // como um retângulo chapado até alguém passar o mouse
  const [giro, setGiro] = useState({ x: 0, y: 0 });
  const REPOUSO_Y = -9;

  useEffect(() => {
    const menosMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const el = palco.current;
    if (menosMovimento || !el) return;

    const mover = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      // -1 .. 1 em cada eixo, a partir do centro da cena
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      setGiro({
        x: Math.max(-1, Math.min(1, dy)) * -3.2,
        y: Math.max(-1, Math.min(1, dx)) * 6.5,
      });
    };
    const sair = () => setGiro({ x: 0, y: 0 });

    el.addEventListener('pointermove', mover);
    el.addEventListener('pointerleave', sair);
    return () => {
      el.removeEventListener('pointermove', mover);
      el.removeEventListener('pointerleave', sair);
    };
  }, []);

  return (
    <div className="cena3d" ref={palco}>
      <div
        className="totem3d"
        style={{ transform: `rotateX(${giro.x}deg) rotateY(${REPOUSO_Y + giro.y}deg)` }}
      >
        {/* laterais e fundo do gabinete */}
        <div className="t3d-face t3d-esq" />
        <div className="t3d-face t3d-dir" />
        <div className="t3d-face t3d-tras" />
        <div className="t3d-face t3d-topo" />

        {/* frente: moldura + tela */}
        <div className="t3d-frente">
          <div className="t3d-bezel">
            <div className="t3d-camera" />
            <div className="t3d-visor">
              {children}
              <span className="t3d-reflexo" aria-hidden="true" />
            </div>
            <div className="t3d-marca">GOODWE</div>
          </div>

          {/* faixa de luz e leitor de cartão, como no equipamento */}
          <div className="t3d-faixa" />
          <div className="t3d-leitor">
            <span className="t3d-leitor-slot" />
            <span className="t3d-leitor-luz" />
          </div>
        </div>

        {/* base e sombra projetada no piso */}
        <div className="t3d-base" />
      </div>
      <div className="t3d-piso" aria-hidden="true" />
    </div>
  );
}
