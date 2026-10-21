import type { CSSProperties } from 'react';
import { Icone, type NomeIcone } from '../../ui/icones';

/** ícones que o conjunto do projeto não tem; o traço segue o mesmo padrão (grade 24, traço 1,6) */
const EXTRA = {
  pausa: 'M8 5v14 M16 5v14',
  wifi: 'M2.5 9a14 14 0 0 1 19 0 M5.5 12.5a9.5 9.5 0 0 1 13 0 M8.5 16a5 5 0 0 1 7 0 M12 19.5h.01',
  semWifi: 'M2.5 9a14 14 0 0 1 19 0 M5.5 12.5a9.5 9.5 0 0 1 13 0 M8.5 16a5 5 0 0 1 7 0 M12 19.5h.01 M3 3l18 18',
  chave: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3.5 17.5a1.8 1.8 0 0 0 2.5 2.5l5.8-5.8a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.2-.6-.6-2.2 2.6-2.6Z',
  celular: 'M8 2.5h8a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5Z M11 18.5h2',
  pix: 'M12 3l9 9-9 9-9-9 9-9Z M9 12l3-3 3 3-3 3-3-3Z',
  bloqueio: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M5.6 5.6l12.8 12.8',
} as const;

export type NomeIc = NomeIcone | keyof typeof EXTRA;

export function Ic({ nome, tamanho = 40, cor, style }: { nome: NomeIc; tamanho?: number; cor?: string; style?: CSSProperties }) {
  if (nome in EXTRA) {
    return (
      <svg
        width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke={cor ?? 'currentColor'} strokeWidth={1.6}
        strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', display: 'block', ...style }} aria-hidden="true"
      >
        <path d={EXTRA[nome as keyof typeof EXTRA]} />
      </svg>
    );
  }
  return <Icone nome={nome as NomeIcone} tamanho={tamanho} cor={cor} style={style} />;
}
