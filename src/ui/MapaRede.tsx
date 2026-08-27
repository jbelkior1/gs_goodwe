import { useMemo, useState } from 'react';
import type { Ponto, Regiao } from '../domain/types';

/**
 * Mapa da rede.
 *
 * Desenhado em SVG a partir das coordenadas reais dos pontos — sem tile de
 * mapa externo, então funciona offline e não depende de chave de serviço. O
 * contorno é uma simplificação do litoral e da fronteira do Brasil, suficiente
 * para o motorista se localizar entre as capitais onde a rede opera.
 */

export interface PontoNoMapa {
  ponto: Ponto;
  regiao: Regiao;
  vagasLivres: number;
  totalVagas: number;
  precoAgora: number;
}

// caixa geográfica que cobre as praças da rede, com folga
const LIMITES = { norte: -6.5, sul: -32, oeste: -53.5, leste: -33.5 };
const L = 100; // o viewBox é normalizado em 100 × 100 e esticado pelo CSS

const projetar = (lat: number, lng: number) => ({
  x: ((lng - LIMITES.oeste) / (LIMITES.leste - LIMITES.oeste)) * L,
  y: ((LIMITES.norte - lat) / (LIMITES.norte - LIMITES.sul)) * L,
});

/** Contorno simplificado do Brasil dentro da caixa acima (traço, não preenchimento fiel). */
const CONTORNO =
  'M14 2 L30 1 L44 5 L57 2 L70 8 L82 13 L90 22 L95 34 L97 45 '
  + 'L93 56 L86 65 L80 74 L72 82 L62 89 L52 95 L41 98 L31 94 '
  + 'L23 86 L17 76 L12 64 L8 51 L7 38 L8 25 L10 12 Z';

export function MapaRede({
  pontos, selecionado, aoSelecionar, compacto,
}: {
  pontos: PontoNoMapa[];
  selecionado?: string;
  aoSelecionar?: (id: string) => void;
  compacto?: boolean;
}) {
  const [sobre, setSobre] = useState<string | null>(null);

  const marcadores = useMemo(
    () => pontos.map((p) => ({ ...p, ...projetar(p.ponto.lat, p.ponto.lng) })),
    [pontos],
  );

  const ativo = marcadores.find((m) => m.ponto.id === (sobre ?? selecionado));

  return (
    <div className={`mapa ${compacto ? 'mapa-compacto' : ''}`}>
      <svg viewBox={`0 0 ${L} ${L}`} className="mapa-svg" preserveAspectRatio="xMidYMid meet">
        <defs>
          
          <pattern id="mapaGrade" width="6.25" height="6.25" patternUnits="userSpaceOnUse">
            <path d="M6.25 0H0V6.25" fill="none" stroke="rgba(244,242,238,.05)" strokeWidth=".2" />
          </pattern>
        </defs>

        <rect width={L} height={L} fill="url(#mapaGrade)" />
        <rect width={L} height={L} fill="transparent" />
        <path d={CONTORNO} className="mapa-contorno" />

        {/* rotas entre as praças, para dar leitura de rede e não de pontos soltos */}
        {marcadores.slice(0, -1).map((m, i) => {
          const n = marcadores[i + 1];
          return (
            <line key={`r-${m.ponto.id}`} x1={m.x} y1={m.y} x2={n.x} y2={n.y} className="mapa-rota" />
          );
        })}

        {marcadores.map((m) => {
          const livre = m.vagasLivres > 0;
          const destacado = m.ponto.id === (sobre ?? selecionado);
          return (
            <g
              key={m.ponto.id}
              className={`mapa-marcador ${livre ? 'livre' : 'cheio'} ${destacado ? 'ativo' : ''}`}
              transform={`translate(${m.x} ${m.y})`}
              onPointerEnter={() => setSobre(m.ponto.id)}
              onPointerLeave={() => setSobre(null)}
              onClick={() => aoSelecionar?.(m.ponto.id)}
              role={aoSelecionar ? 'button' : undefined}
              tabIndex={aoSelecionar ? 0 : undefined}
              onKeyDown={(e) => { if (e.key === 'Enter') aoSelecionar?.(m.ponto.id); }}
            >
              {livre && <circle r="3.4" className="mapa-pulso" />}
              <circle r="1.9" className="mapa-halo" />
              <circle r="0.95" className="mapa-nucleo" />
            </g>
          );
        })}
      </svg>

      {ativo && (
        <div
          className="mapa-tip"
          style={{
            left: `${Math.min(72, Math.max(4, ativo.x))}%`,
            top: `${Math.min(80, Math.max(4, ativo.y))}%`,
          }}
        >
          <div className="mapa-tip-nome">{ativo.ponto.nome}</div>
          <div className="mapa-tip-meta">
            {ativo.regiao.zona} · {ativo.regiao.cidade}/{ativo.regiao.uf}
          </div>
          <div className="mapa-tip-num">
            <span className={ativo.vagasLivres > 0 ? 'ok' : 'cheio'}>
              {ativo.vagasLivres > 0 ? `${ativo.vagasLivres} livre(s)` : 'sem vaga'}
            </span>
            <span>R$ {ativo.precoAgora.toFixed(2).replace('.', ',')}/kWh</span>
          </div>
        </div>
      )}

      <div className="mapa-legenda meta">
        <span><span className="mapa-ponto ok" />com vaga</span>
        <span><span className="mapa-ponto cheio" />ocupado</span>
        <span className="mapa-legenda-total">{pontos.length} PONTOS</span>
      </div>
    </div>
  );
}


