import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** QR gerado no próprio app (sem serviço externo). */
export function QR({ texto, tamanho = 180 }: { texto: string; tamanho?: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(texto, { margin: 1, width: tamanho * 2 }).then(setSrc).catch(() => setSrc(''));
  }, [texto, tamanho]);
  return (
    <div style={{ width: tamanho, height: tamanho, background: '#fff', borderRadius: 10, padding: 8, flexShrink: 0 }}>
      {src && <img src={src} alt="QR code" style={{ width: '100%', height: '100%', display: 'block' }} />}
    </div>
  );
}

/** Endereço completo dentro do app (funciona no GitHub Pages e no Railway). */
export const linkDoApp = (caminho: string) =>
  `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}${caminho}`;
