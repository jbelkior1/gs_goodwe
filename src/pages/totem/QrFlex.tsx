import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * QR que ocupa o espaço que o CSS der (quadrado, fundo branco): o totem desenha o QR na maior
 * área livre da tela, então o tamanho não é fixo. Gerado no próprio app, em alta resolução.
 */
export function QrFlex({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let vivo = true;
    QRCode.toDataURL(texto, { margin: 3, width: 1000, errorCorrectionLevel: 'M' })
      .then((s) => { if (vivo) setSrc(s); })
      .catch(() => { if (vivo) setSrc(''); });
    return () => { vivo = false; };
  }, [texto]);
  return (
    <div className="tk-qr" role="img" aria-label={rotulo}>
      {src && <img src={src} alt="" draggable={false} />}
    </div>
  );
}
