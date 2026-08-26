import type { CSSProperties } from 'react';

/**
 * Conjunto de ícones do padrão GoodWe/ChargeGrid.
 *
 * O padrão da empresa usa ícone vetorial de traço fino (peso óptico do
 * Phosphor regular), nunca emoji. Aqui eles são desenhados na grade 24 com
 * traço de 1.6 e cantos arredondados, herdando `currentColor` — assim a mesma
 * peça serve para menu, badge e gráfico.
 */

export type NomeIcone =
  | 'mapa' | 'raio' | 'painel' | 'tomada' | 'dinheiro' | 'globo' | 'check'
  | 'carro' | 'loja' | 'antena' | 'sol' | 'bateria' | 'alerta' | 'relogio'
  | 'setaCima' | 'setaBaixo' | 'traco' | 'qr' | 'pulso';

const D: Record<NomeIcone, string> = {
  // pino de mapa
  mapa: 'M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z M12 10.5v.01',
  // raio
  raio: 'M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z',
  // colunas
  painel: 'M4 20V10 M9.5 20V4 M15 20v-7 M20.5 20v-4',
  // tomada / conector
  tomada: 'M9 3v5 M15 3v5 M6 8h12v3a6 6 0 0 1-12 0V8Z M12 17v4',
  // cédula
  dinheiro: 'M3 6.5h18v11H3v-11Z M12 15a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  // globo
  globo: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M3.5 9.5h17 M3.5 14.5h17 M12 3c-2.4 2.4-3.6 5.4-3.6 9s1.2 6.6 3.6 9c2.4-2.4 3.6-5.4 3.6-9S14.4 5.4 12 3Z',
  // check em círculo
  check: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M8 12.2l2.7 2.8L16 9.5',
  // carro
  carro: 'M4 16.5v2.5h2.5v-2.5 M17.5 16.5V19H20v-2.5 M3.5 16.5h17v-4l-1.8-4.2a2 2 0 0 0-1.8-1.2H7.1a2 2 0 0 0-1.8 1.2L3.5 12.5v4Z M3.5 12.5h17 M7 14.5h.01 M17 14.5h.01',
  // fachada de loja
  loja: 'M4 10.5V20h16v-9.5 M3 10.5 5 4.5h14l2 6a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z M9.5 20v-5.5h5V20',
  // antena / rede
  antena: 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z M7.8 7.8a6 6 0 0 0 0 8.4 M16.2 16.2a6 6 0 0 0 0-8.4 M4.9 4.9a10 10 0 0 0 0 14.2 M19.1 19.1a10 10 0 0 0 0-14.2',
  // sol
  sol: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z M12 2v2.5 M12 19.5V22 M2 12h2.5 M19.5 12H22 M4.9 4.9l1.8 1.8 M17.3 17.3l1.8 1.8 M19.1 4.9l-1.8 1.8 M6.7 17.3l-1.8 1.8',
  // bateria
  bateria: 'M2.5 8h14v8h-14V8Z M19.5 10.5v3 M5.5 11v2 M9 11v2',
  // triângulo de alerta
  alerta: 'M12 4 2.8 20h18.4L12 4Z M12 10v4 M12 17.2v.01',
  // relógio
  relogio: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 7.5V12l3 2',
  setaCima: 'M12 19V5 M6 11l6-6 6 6',
  setaBaixo: 'M12 5v14 M6 13l6 6 6-6',
  traco: 'M5 12h14',
  // qr code
  qr: 'M4 4h5v5H4V4Z M15 4h5v5h-5V4Z M4 15h5v5H4v-5Z M15 15h2v2h-2v-2Z M19 19h1 M12 4v4 M12 12h3 M12 16v4 M19 12h1',
  // pulso / telemetria
  pulso: 'M3 12h4l2.5-6 4 12 2.5-6H21',
};

export function Icone({
  nome, tamanho = 16, cor, style,
}: { nome: NomeIcone; tamanho?: number; cor?: string; style?: CSSProperties }) {
  return (
    <svg
      width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none"
      stroke={cor ?? 'currentColor'} strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ flex: 'none', display: 'block', ...style }}
      aria-hidden="true"
    >
      <path d={D[nome]} />
    </svg>
  );
}
