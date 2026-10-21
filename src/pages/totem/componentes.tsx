import type { ReactNode } from 'react';
import { brl } from '../../domain/formato';
import { vagaLivre } from '../../domain/engine/totem';
import { Ic, type NomeIc } from './icones';
import type { DadosTela } from './tipos';

/** anel de bateria (SVG puro, 400 × 400): o CSS dá o tamanho e as cores */
export function Anel({ pct, pausada }: { pct: number; pausada?: boolean }) {
  const r = 170;
  const circ = 2 * Math.PI * r;
  const p = Math.min(100, Math.max(0, pct));
  return (
    <svg viewBox="0 0 400 400" className={`tk-anel-svg ${pausada ? 'pausada' : ''}`} aria-hidden="true" focusable="false">
      <circle cx="200" cy="200" r={r} className="tk-anel-trilho" />
      <circle
        cx="200" cy="200" r={r} className="tk-anel-carga" transform="rotate(-90 200 200)"
        strokeDasharray={`${(p / 100) * circ} ${circ}`}
      />
    </svg>
  );
}

/**
 * Minicurva da potência na recarga. SVG simples (sem biblioteca de gráfico: o recharts desenha uma
 * caixa de foco em volta do svg no toque). Quem chama só entrega a série com 3 pontos ou mais.
 */
export function Minicurva({ serie }: { serie: number[] }) {
  const W = 600;
  const H = 120;
  const max = Math.max(1, ...serie) * 1.15;
  const pts = serie.map((v, i) => `${(i / Math.max(1, serie.length - 1)) * W},${H - (v / max) * (H - 8) - 4}`);
  const linha = `M${pts.join(' L')}`;
  return (
    <svg className="tk-minicurva" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Potência ao longo da recarga" focusable="false">
      <path d={`${linha} L${W},${H} L0,${H} Z`} className="tk-minicurva-area" />
      <path d={linha} className="tk-minicurva-linha" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** número grande com rótulo; o tamanho cai quando o texto é comprido para nunca estourar a coluna */
export function Numero({ valor, rotulo, destaque }: { valor: string; rotulo: string; destaque?: boolean }) {
  const tam = valor.length > 8 ? 'p' : valor.length > 6 ? 'm' : 'g';
  return (
    <div className={`tk-numero ${destaque ? 'destaque' : ''} t-${tam}`}>
      <span className="tk-numero-valor">{valor}</span>
      <span className="tk-rotulo">{rotulo}</span>
    </div>
  );
}

/** anel girando: "estou trabalhando nisso" */
export function Giro() {
  return <span className="tk-giro solto" aria-hidden="true" />;
}

/** a tela de um estado simples: ícone (ou giro), título grande, instrução e apoio */
export function Bloco({
  icone, giro, tom = 'neutro', titulo, texto, apoio, extra,
}: {
  icone?: NomeIc; giro?: boolean; tom?: 'neutro' | 'ok' | 'aviso' | 'erro';
  titulo: ReactNode; texto?: ReactNode; apoio?: ReactNode; extra?: ReactNode;
}) {
  return (
    <div className="tk-bloco" role="status">
      <div className={`tk-bloco-icone ${tom}`}>
        {giro && <span className="tk-giro" aria-hidden="true" />}
        {icone && <Ic nome={icone} tamanho={150} />}
      </div>
      <h1 className="tk-titulo-grande">{titulo}</h1>
      {texto && <p className="tk-instrucao-g">{texto}</p>}
      {apoio && <p className="tk-instrucao dim">{apoio}</p>}
      {extra}
    </div>
  );
}

/** o preço do kWh em destaque, com o rótulo de cima */
export function PrecoTravado({ valor, rotulo }: { valor: number; rotulo: string }) {
  return (
    <div className="tk-bloco-num">
      <span className="tk-rotulo">{rotulo}</span>
      <div className="tk-preco-valor">{valor > 0 ? brl(valor) : '—'}<small>/kWh</small></div>
    </div>
  );
}

/** Controles de demonstração: o carro chega no cabo sem passar pelo painel do franqueado. Só no demo. */
export function Simulacao({ d }: { d: DadosTela }) {
  const livres = d.vagas.filter((v) => vagaLivre(v.dados.vaga) && v.situacao === 'livre');
  const comCarro = d.vagas.filter((v) => v.comCarro);
  const varias = d.vagas.length > 1;
  if (!livres.length && !comCarro.length) return null;
  return (
    <div className="tk-demo">
      <span className="tk-demo-rotulo">Demonstração</span>
      {livres.map((v) => (
        <button key={v.id} className="tk-demo-btn" disabled={d.ocupado} onClick={() => d.simularCarro(v.id)}>
          {varias ? `${v.apelido} · ` : ''}Simular carro conectado (demonstração)
        </button>
      ))}
      {comCarro.map((v) => (
        <button key={v.id} className="tk-demo-btn" disabled={d.ocupado} onClick={() => d.retirarCabo(v.id)}>
          {varias ? `${v.apelido} · ` : ''}Simular retirada do cabo (demonstração)
        </button>
      ))}
    </div>
  );
}
