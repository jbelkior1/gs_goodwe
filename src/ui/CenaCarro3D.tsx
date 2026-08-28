export function CenaCarro3D() {
  return (
    <svg width="100" height="64" viewBox="0 0 140 90" fill="none" style={{ flex: 'none', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.4))' }}>
      {/* Fio iluminado simulando o fluxo de energia */}
      <path d="M 85 55 Q 65 75 45 45" stroke="var(--k-red)" strokeWidth="2.5" fill="none" strokeDasharray="6 4" style={{ animation: 'kpulse 1.5s infinite linear' }} />
      <path d="M 85 55 Q 65 75 45 45" stroke="var(--k-red)" strokeWidth="6" fill="none" opacity="0.2" />

      {/* Sombras no chao */}
      <ellipse cx="40" cy="55" rx="24" ry="12" fill="rgba(0,0,0,0.6)" />
      <ellipse cx="95" cy="58" rx="12" ry="6" fill="rgba(0,0,0,0.7)" />

      {/* --- CARRO ISOMETRICO (Estilo Google Maps/Uber) --- */}
      <g transform="translate(10, 20)">
        {/* Roda traseira */}
        <ellipse cx="20" cy="30" rx="4" ry="7" fill="#111" />
        {/* Roda dianteira */}
        <ellipse cx="50" cy="30" rx="4" ry="7" fill="#111" />
        
        {/* Lateral principal do carro (Chassi) */}
        <path d="M 12 22 L 56 22 L 62 16 L 10 16 Z" fill="#D8D8DC" />
        <path d="M 10 16 L 62 16 L 56 6 L 18 6 Z" fill="#F4F2EE" />
        
        {/* Para-choque frente */}
        <path d="M 56 22 L 62 16 L 52 10 Z" fill="#A0A0A5" />
        
        {/* Teto (Vidros e cabine) */}
        <path d="M 22 6 L 46 6 L 40 -2 L 26 -2 Z" fill="#1C1C1E" />
        {/* Teto superior */}
        <path d="M 26 -2 L 40 -2 L 35 -6 L 28 -6 Z" fill="#3A3A3C" />
        {/* Vidro lateral */}
        <path d="M 24 4 L 44 4 L 38 -1 L 28 -1 Z" fill="#4B4B4F" />

        {/* Farol traseiro */}
        <polygon points="12,22 10,16 13,16 15,22" fill="var(--k-red)" />
        {/* Farol dianteiro */}
        <polygon points="56,22 62,16 58,16 53,22" fill="#E8F4FF" />

        {/* Porta de carga (onde o fio conecta) */}
        <ellipse cx="35" cy="18" rx="2" ry="4" fill="var(--k-panel-2)" />
        <circle cx="35" cy="18" r="1.5" fill="var(--k-red)" />
      </g>

      {/* --- TOTEM ISOMETRICO --- */}
      <g transform="translate(85, 15)">
        {/* Lado Escuro (Esquerda) */}
        <path d="M 0 15 L 12 8 L 12 40 L 0 46 Z" fill="#131315" />
        {/* Frente (Direita) */}
        <path d="M 12 8 L 24 15 L 24 46 L 12 40 Z" fill="#2C2C2E" />
        {/* Topo */}
        <path d="M 0 15 L 12 8 L 24 15 L 12 22 Z" fill="#3A3A3C" />
        
        {/* Tela na frente */}
        <polygon points="14,14 22,19 22,30 14,25" fill="#000" />
        <polygon points="15,16 21,19.5 21,24 15,20.5" fill="rgba(244,242,238,0.1)" />
        
        {/* Detalhe de luz (Status) */}
        <polygon points="14,35 22,39 22,40 14,36" fill="var(--k-red)" />

        {/* Conector no Totem */}
        <circle cx="6" cy="30" r="1.5" fill="var(--k-red)" />
      </g>
    </svg>
  );
}

