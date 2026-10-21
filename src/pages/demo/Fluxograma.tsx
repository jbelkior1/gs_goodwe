import { PASSOS, type SituacaoDemo } from './fluxo';

/** Os 11 passos do produto, com o que está acontecendo agora destacado (vem da base, ao vivo). */

const GRUPOS: { titulo: string; de: number; ate: number }[] = [
  { titulo: 'Abrir o ponto', de: 1, ate: 4 },
  { titulo: 'O motorista chega', de: 5, ate: 7 },
  { titulo: 'Recarga, pagamento e resultado', de: 8, ate: 11 },
];

export function Fluxograma({ situacao }: { situacao: SituacaoDemo }) {
  const atuais = situacao.passos;
  const primeiro = atuais.length ? Math.min(...atuais) : Infinity;
  const estadoDe = (n: number) => (atuais.includes(n) ? 'atual' : n < primeiro ? 'feito' : 'depois');

  return (
    <div className="dm-fluxo" role="list" aria-label="Fluxograma do produto em 11 passos">
      {GRUPOS.map((g) => (
        <div key={g.titulo} className="dm-grupo" role="listitem">
          <div className="dm-grupo-titulo">{g.titulo}</div>
          <ol className="dm-passos">
            {PASSOS.filter((p) => p.n >= g.de && p.n <= g.ate).map((p) => {
              const estado = estadoDe(p.n);
              return (
                <li key={p.n} className={`dm-passo ${estado}`} aria-current={estado === 'atual' ? 'step' : undefined}>
                  <span className="dm-passo-num">{estado === 'feito' ? '✓' : p.n}</span>
                  <span className="dm-passo-corpo">
                    <span className="dm-passo-quem">
                      {p.quem}
                      {estado === 'atual' && <span className="dm-pilula"><i className="dot pulse" />agora</span>}
                    </span>
                    <span className="dm-passo-titulo">{p.titulo}</span>
                    <span className="dm-passo-texto">{p.texto}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}
