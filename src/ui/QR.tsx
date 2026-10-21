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

/**
 * Origem usada nos links e QRs. VITE_URL_PUBLICA (opcional, ex.: http://192.168.0.15:5191) existe porque
 * o celular não abre "localhost": o QR precisa apontar para o endereço do notebook na rede ou para o
 * domínio publicado. Aceita só a origem; qualquer caminho digitado a mais é descartado.
 */
function origemPublica(): string {
  const configurada = (import.meta.env.VITE_URL_PUBLICA as string | undefined)?.trim();
  if (configurada) {
    try { return new URL(configurada).origin; } catch { /* valor inválido: usa a origem do navegador */ }
  }
  return window.location.origin;
}

/** Endereço completo dentro do app (funciona no GitHub Pages e no Railway). */
export const linkDoApp = (caminho: string) =>
  `${origemPublica()}${import.meta.env.BASE_URL.replace(/\/$/, '')}${caminho}`;

/** true quando os QRs apontam para localhost: outro aparelho (o celular) não consegue abrir. */
export function linkSoNesteAparelho(): boolean {
  try {
    const host = new URL(origemPublica()).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
  } catch { return false; }
}
