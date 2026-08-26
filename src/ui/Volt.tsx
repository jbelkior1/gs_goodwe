/**
 * Volt — mascote do totem.
 *
 * Desenhado em SVG e animado por CSS (nada de GIF ou Lottie): flutua, pisca em
 * intervalos irregulares e muda de expressão conforme o estado. As cores saem
 * dos tokens do padrão, então ele acompanha o tema do sistema.
 */

export type EstadoVolt = 'ocioso' | 'pensando' | 'falando';

export function Volt({ estado = 'ocioso', tamanho = 128 }: { estado?: EstadoVolt; tamanho?: number }) {
  return (
    <div className={`volt volt-${estado}`} style={{ width: tamanho, height: tamanho * 1.06 }}>
      <svg viewBox="0 0 120 128" width="100%" height="100%" aria-label="Volt, assistente do totem">
        <defs>
          <linearGradient id="voltCorpo" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1d1d22" />
            <stop offset="100%" stopColor="#121215" />
          </linearGradient>
          <radialGradient id="voltVisor" cx="50%" cy="42%" r="62%">
            <stop offset="0%" stopColor="#2a0a10" />
            <stop offset="100%" stopColor="#0a0a0b" />
          </radialGradient>
        </defs>

        {/* halo */}
        <ellipse className="volt-halo" cx="60" cy="58" rx="46" ry="42" fill="rgba(230,0,18,.13)" />

        {/* antena */}
        <line x1="60" y1="16" x2="60" y2="26" stroke="rgba(244,242,238,.34)" strokeWidth="2" strokeLinecap="round" />
        <circle className="volt-antena" cx="60" cy="12" r="4.5" fill="#e60012" />

        {/* cabeça */}
        <rect x="22" y="26" width="76" height="58" rx="18" fill="url(#voltCorpo)" stroke="rgba(244,242,238,.14)" />
        <rect x="30" y="34" width="60" height="42" rx="13" fill="url(#voltVisor)" stroke="rgba(230,0,18,.30)" />

        {/* olhos */}
        <g className="volt-olhos" fill="#ff3b45">
          <rect x="42" y="48" width="11" height="13" rx="5.5" />
          <rect x="67" y="48" width="11" height="13" rx="5.5" />
        </g>

        {/* boca: barrinhas de áudio quando fala */}
        <g className="volt-boca" fill="rgba(255,59,69,.85)">
          <rect x="50" y="66" width="3" height="5" rx="1.5" />
          <rect x="56" y="64" width="3" height="9" rx="1.5" />
          <rect x="62" y="66" width="3" height="5" rx="1.5" />
          <rect x="68" y="67" width="3" height="3" rx="1.5" />
        </g>

        {/* orelhas / alto-falantes */}
        <rect x="14" y="46" width="7" height="18" rx="3.5" fill="#17171b" stroke="rgba(244,242,238,.12)" />
        <rect x="99" y="46" width="7" height="18" rx="3.5" fill="#17171b" stroke="rgba(244,242,238,.12)" />

        {/* tronco */}
        <rect x="34" y="88" width="52" height="28" rx="12" fill="url(#voltCorpo)" stroke="rgba(244,242,238,.14)" />
        <path
          d="M62 94 L54 104 h6 l-2 8 8-10h-6z"
          fill="#e60012"
          className="volt-raio"
        />

        {/* sombra no chão */}
        <ellipse className="volt-sombra" cx="60" cy="122" rx="26" ry="4" fill="rgba(0,0,0,.55)" />
      </svg>
    </div>
  );
}
