import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { comTela, telaDoNavegador } from '../app/tela';
import { desparearTotem } from '../data/totens';
import { EMBUTIDO } from '../pages/demo/ambienteDemo';
import { AlcaBarra, BarraInferior } from './BarraInferior';
import { gravarBarra, gravarLimiteBarra, lerBarra, lerLimiteBarra, limitarBarra, LIMITES_BARRA } from './barraDoTotem';
import { DESENHO, QuiosqueCtx } from './quiosqueContexto';
import '../pages/totem/totem.css';

const DEMO = import.meta.env.VITE_MODO_DEMO === 'true';

export type ModoTela = 'auto' | 'vertical' | 'horizontal';
const CHAVE = 'pontow.totem.modo';

const lerModo = (): ModoTela => {
  const daUrl = new URLSearchParams(window.location.search).get('modo');
  if (daUrl === 'vertical' || daUrl === 'horizontal' || daUrl === 'auto') return daUrl;
  try { return (localStorage.getItem(CHAVE) as ModoTela) || 'auto'; } catch { return 'auto'; }
};

/**
 * Palco de tamanho fixo que se escala para caber inteiro no espaço do pai, centralizado.
 * Mede o pai com ResizeObserver; é o mesmo mecanismo do quiosque (tela inteira) e da vitrine
 * (dentro da moldura 3D).
 *
 * Com `alturaMinima`, a altura do desenho acompanha o espaço: a largura continua `largura` e a altura
 * vai de `altura` até `alturaMinima` (a grade do totem se reorganiza, sem diminuir texto nem botão).
 * Só abaixo do mínimo o palco passa a diminuir inteiro. É o que a barra de baixo do totem usa.
 */
export function PalcoEscalado({ largura, altura, alturaMinima, children }: {
  largura: number; altura: number; alturaMinima?: number; children: ReactNode;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [medida, setMedida] = useState({ escala: 0, altura });
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!(w > 0 && h > 0)) return;
      const alt = alturaMinima ? Math.round(Math.min(altura, Math.max(alturaMinima, (h * largura) / w))) : altura;
      setMedida({ escala: Math.min(w / largura, h / alt), altura: alt });
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [largura, altura, alturaMinima]);
  const { escala } = medida;
  return (
    <div ref={caixa} className="palco-esc">
      <div
        className="palco-esc-palco"
        style={{ width: largura, height: medida.altura, transform: `translate(-50%, -50%) scale(${escala || 1})`, visibility: escala ? 'visible' : 'hidden' }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Casca de quiosque do totem real: desenha na resolução real (1080×1920 ou 1920×1080), escala só
 * se a tela for diferente, mantém a tela acesa, tenta tela cheia no primeiro toque e bloqueia
 * menu de contexto, seleção, pinça e zoom do navegador. A engrenagem pública não existe mais:
 * o menu de manutenção abre com 5 toques seguidos no logo (veja useToquesSecretos).
 * Em pé, a alça do canto inferior direito abre a barra de baixo (BarraInferior.tsx): num totem
 * alto, a tela sobe até a mão de quem usa e a faixa que sobra embaixo mostra o símbolo do Ponto W.
 */
export function Quiosque({ children }: { children: (orientacao: 'vertical' | 'horizontal') => ReactNode }) {
  const [modo, setModo] = useState<ModoTela>(lerModo);
  const [tam, setTam] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [menu, setMenu] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const medir = () => setTam({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);
  useEffect(() => { try { localStorage.setItem(CHAVE, modo); } catch { /* sem armazenamento */ } }, [modo]);

  // tela acesa: o wake lock cai quando a aba fica escondida, então pede de novo ao voltar
  useEffect(() => {
    let sentinela: WakeLockSentinel | null = null;
    const pedir = async () => {
      try {
        if (document.visibilityState !== 'visible' || !navigator.wakeLock) return;
        sentinela = await navigator.wakeLock.request('screen');
      } catch { /* sem suporte ou sem permissão: o aparelho precisa estar configurado para não dormir */ }
    };
    pedir();
    document.addEventListener('visibilitychange', pedir);
    return () => {
      document.removeEventListener('visibilitychange', pedir);
      sentinela?.release().catch(() => {});
    };
  }, []);

  // tela cheia só vem de um toque da pessoa: tenta no primeiro
  useEffect(() => {
    const tentar = () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    };
    window.addEventListener('pointerdown', tentar, { once: true });
    return () => window.removeEventListener('pointerdown', tentar);
  }, []);

  // modo quiosque: sem menu de contexto, seleção, pinça nem zoom — só enquanto o totem está na tela
  useEffect(() => {
    const el = raiz.current;
    const barra = (e: Event) => e.preventDefault();
    const pinca = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
    const roda = (e: WheelEvent) => { if (e.ctrlKey) e.preventDefault(); };
    const teclas = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0', '_'].includes(e.key)) e.preventDefault();
    };
    el?.addEventListener('contextmenu', barra);
    el?.addEventListener('selectstart', barra);
    el?.addEventListener('gesturestart', barra);
    el?.addEventListener('touchmove', pinca, { passive: false });
    window.addEventListener('wheel', roda, { passive: false });
    window.addEventListener('keydown', teclas);
    return () => {
      el?.removeEventListener('contextmenu', barra);
      el?.removeEventListener('selectstart', barra);
      el?.removeEventListener('gesturestart', barra);
      el?.removeEventListener('touchmove', pinca);
      window.removeEventListener('wheel', roda);
      window.removeEventListener('keydown', teclas);
    };
  }, []);

  const orientacao = modo === 'auto' ? (tam.h >= tam.w ? 'vertical' : 'horizontal') : modo;
  const d = DESENHO[orientacao];
  const abrirMenu = useCallback(() => setMenu(true), []);
  const ctx = useMemo(() => ({ abrirMenu }), [abrirMenu]);
  // a tela só é desenhada de novo quando a orientação muda: arrastar a alça não re-renderiza o totem
  const conteudo = useMemo(() => children(orientacao), [children, orientacao]);

  // barra de baixo (totem alto): só no totem em pé de verdade (o palco da central /demo embute o totem
  // em tela cheia e fica como sempre foi); a altura fica guardada no aparelho
  const [barra, setBarra] = useState(lerBarra);
  const [limite, setLimite] = useState(lerLimiteBarra);
  const emPe = orientacao === 'vertical' && !EMBUTIDO;
  const alturaBarra = emPe ? limitarBarra(barra, limite) : 0;
  const mudarLimite = (v: number) => {
    setLimite(v); gravarLimiteBarra(v);
    const nova = limitarBarra(barra, v);
    setBarra(nova); gravarBarra(nova);
  };
  const recolher = () => { setBarra(0); gravarBarra(0); };

  return (
    <div className="quiosque" ref={raiz}>
      <div className="quiosque-tela">
        {/* barra fechada: o palco só escala, como antes (uma tela fora de 9:16 não reorganiza o totem) */}
        <PalcoEscalado largura={d.w} altura={d.h} alturaMinima={alturaBarra > 0 ? ALTURA_MINIMA_EM_PE : undefined}>
          <QuiosqueCtx.Provider value={ctx}>
            {conteudo}
            {menu && (
              <MenuManutencao
                modo={modo} aoMudarModo={setModo} aoFechar={() => setMenu(false)}
                emPe={emPe} limite={limite} aoMudarLimite={mudarLimite} barraAberta={alturaBarra > 0} aoRecolher={recolher}
              />
            )}
          </QuiosqueCtx.Provider>
        </PalcoEscalado>
        {emPe && limite > 0 && <AlcaBarra valor={alturaBarra} limite={limite} aoMudar={setBarra} aoSoltar={gravarBarra} />}
      </div>
      <BarraInferior altura={alturaBarra} />
    </div>
  );
}

/**
 * Em pé, a altura útil pode cair até aqui (a barra de baixo come o resto) com texto e botões no
 * tamanho normal; a grade cede espaço no meio. Abaixo disso o palco diminui inteiro.
 */
const ALTURA_MINIMA_EM_PE = 1440;

/** Menu de manutenção (5 toques no logo): modo da tela, barra de baixo, tela cheia e desparear. Fecha sozinho em 20 s. */
function MenuManutencao({ modo, aoMudarModo, aoFechar, emPe, limite, aoMudarLimite, barraAberta, aoRecolher }: {
  modo: ModoTela; aoMudarModo: (m: ModoTela) => void; aoFechar: () => void;
  emPe: boolean; limite: number; aoMudarLimite: (v: number) => void; barraAberta: boolean; aoRecolher: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(aoFechar, 20000);
    return () => window.clearTimeout(id);
  }, [aoFechar, confirmando]);

  const telaCheia = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
    aoFechar();
  };
  const desparear = async () => {
    if (!confirmando) { setConfirmando(true); return; }
    setOcupado(true);
    await desparearTotem();
    // recarrega sem ?ponto=: o link antigo prenderia o aparelho de volta ao ponto
    const u = new URL(window.location.href);
    u.searchParams.delete('ponto');
    window.location.assign(u.toString());
  };

  return (
    <div className="qm-fundo" onClick={aoFechar}>
      <div className="qm" role="dialog" aria-label="Configuração do totem" onClick={(e) => e.stopPropagation()}>
        <div className="qm-titulo">Configuração do totem</div>
        <div className="qm-rotulo">Modo da tela</div>
        <div className="qm-linha">
          {(['auto', 'vertical', 'horizontal'] as ModoTela[]).map((m) => (
            <button key={m} className={`qm-btn ${modo === m ? 'on' : ''}`} onClick={() => { aoMudarModo(m); aoFechar(); }}>
              {m === 'auto' ? 'Automático' : m === 'vertical' ? 'Vertical' : 'Horizontal'}
            </button>
          ))}
        </div>
        {emPe && (
          <>
            <div className="qm-rotulo">Barra de baixo (totem alto)</div>
            <div className="qm-linha">
              {LIMITES_BARRA.map((v) => (
                <button key={v} className={`qm-btn ${Math.abs(limite - v) < 0.001 ? 'on' : ''}`} onClick={() => aoMudarLimite(v)}>
                  {v === 0 ? 'Desligada' : `Até ${Math.round(v * 100)}%`}
                </button>
              ))}
            </div>
            {barraAberta && <button className="qm-btn" onClick={() => { aoRecolher(); aoFechar(); }}>Recolher a barra</button>}
          </>
        )}
        <button className="qm-btn" onClick={telaCheia}>Tela cheia: ligar ou desligar</button>
        {DEMO && (
          <Link className="qm-btn" to={comTela('/totem', window.location.search, 'vitrine')} onClick={() => telaDoNavegador(false)}>
            Sair da tela cheia
          </Link>
        )}
        <button className={`qm-btn perigo ${confirmando ? 'on' : ''}`} disabled={ocupado} onClick={desparear}>
          {ocupado ? 'Despareando…' : confirmando ? 'Toque de novo para desparear' : 'Desparear este totem'}
        </button>
        <button className="qm-btn" onClick={aoFechar}>Fechar</button>
      </div>
    </div>
  );
}
