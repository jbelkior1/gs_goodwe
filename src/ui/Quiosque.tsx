import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { comTela, telaDoNavegador } from '../app/tela';

const DEMO = import.meta.env.VITE_MODO_DEMO === 'true';

export type ModoTela = 'auto' | 'vertical' | 'horizontal';
const CHAVE = 'pontow.totem.modo';
/** tamanho de desenho de cada modo; a tela real é escalada para caber inteira */
const DESENHO = { vertical: { w: 432, h: 768 }, horizontal: { w: 768, h: 432 } } as const;

const lerModo = (): ModoTela => {
  const daUrl = new URLSearchParams(window.location.search).get('modo');
  if (daUrl === 'vertical' || daUrl === 'horizontal' || daUrl === 'auto') return daUrl;
  try { return (localStorage.getItem(CHAVE) as ModoTela) || 'auto'; } catch { return 'auto'; }
};

/**
 * Tela cheia de quiosque (totem real): desenha numa proporção fixa e escala para a tela do
 * aparelho, em retrato ou paisagem. O botão discreto no canto troca o modo e liga a tela cheia.
 */
export function Quiosque({ children }: { children: (orientacao: 'vertical' | 'horizontal') => ReactNode }) {
  const [modo, setModo] = useState<ModoTela>(lerModo);
  const [tam, setTam] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const medir = () => setTam({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);
  useEffect(() => { try { localStorage.setItem(CHAVE, modo); } catch { /* sem armazenamento */ } }, [modo]);

  const orientacao = modo === 'auto' ? (tam.h >= tam.w ? 'vertical' : 'horizontal') : modo;
  const d = DESENHO[orientacao];
  const escala = Math.min(tam.w / d.w, tam.h / d.h);

  const telaCheia = () => {
    const el = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen?.().catch(() => {});
    setMenu(false);
  };

  return (
    <div className="quiosque">
      <div className="quiosque-palco" style={{ width: d.w, height: d.h, transform: `scale(${escala})` }}>
        {children(orientacao)}
      </div>
      <button className="quiosque-config" aria-label="Configurar tela" onClick={() => setMenu((m) => !m)}>⚙</button>
      {menu && (
        <div className="quiosque-menu" role="menu">
          <div className="kpi-label">Modo da tela</div>
          {(['auto', 'vertical', 'horizontal'] as ModoTela[]).map((m) => (
            <button key={m} className={`chip ${modo === m ? 'on' : ''}`} onClick={() => { setModo(m); setMenu(false); }}>
              {m === 'auto' ? 'Automático' : m === 'vertical' ? 'Vertical' : 'Horizontal'}
            </button>
          ))}
          <button className="btn" onClick={telaCheia}>Tela cheia</button>
          {DEMO && <Link className="btn" to={comTela('/totem', window.location.search, 'vitrine')} onClick={() => telaDoNavegador(false)}>Sair da tela cheia</Link>}
        </div>
      )}
    </div>
  );
}
