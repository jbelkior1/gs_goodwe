import { useEffect, useRef, useState } from 'react';
import './LeitorQR.css';

/** o leitor nativo do navegador (Chrome no Android, por exemplo); o iPhone ainda não tem */
interface LeitorNativo { detect: (fonte: CanvasImageSource) => Promise<{ rawValue: string }[]> }
interface ConstrutorNativo {
  new (opcoes: { formats: string[] }): LeitorNativo;
  getSupportedFormats?: () => Promise<string[]>;
}

/** a frase que a pessoa precisa ler quando a câmera não abre */
function motivo(e: unknown): string {
  const nome = (e as { name?: string })?.name;
  if (nome === 'NotAllowedError' || nome === 'SecurityError') {
    return 'O navegador não deixou abrir a câmera. Libere a câmera para este site nas configurações do navegador e tente de novo.';
  }
  if (nome === 'NotFoundError' || nome === 'OverconstrainedError') return 'Este aparelho não tem uma câmera disponível.';
  if (nome === 'NotReadableError') return 'A câmera está sendo usada por outro app. Feche o outro app e tente de novo.';
  return 'Não foi possível abrir a câmera neste aparelho.';
}

/**
 * Lê um QR pela câmera traseira, em tela cheia. Usa o leitor nativo do navegador quando existe e, sem
 * ele (iPhone), a biblioteca jsQR, carregada só quando a câmera abre. Chama `aoLer` uma vez, com o
 * texto do QR; quem chamou decide o que fazer e fecha o leitor. A câmera desliga ao fechar.
 */
export function LeitorQR({ titulo, aoLer, aoFechar }: { titulo: string; aoLer: (texto: string) => void; aoFechar: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const aoLerRef = useRef(aoLer);
  const [erro, setErro] = useState('');
  const [pronto, setPronto] = useState(false);

  useEffect(() => { aoLerRef.current = aoLer; });

  useEffect(() => {
    let vivo = true;
    let fluxo: MediaStream | null = null;
    let espera = 0;

    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setErro('A câmera só abre em endereço seguro (https). Abra o app pelo endereço publicado.');
        return;
      }
      try {
        fluxo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      } catch (e) {
        if (vivo) setErro(motivo(e));
        return;
      }
      const v = video.current;
      if (!vivo || !v) { fluxo.getTracks().forEach((t) => t.stop()); return; }
      v.srcObject = fluxo;
      await v.play().catch(() => undefined);
      setPronto(true);

      let nativo: LeitorNativo | null = null;
      const Construtor = (window as unknown as { BarcodeDetector?: ConstrutorNativo }).BarcodeDetector;
      if (Construtor) {
        try {
          const formatos = await Construtor.getSupportedFormats?.();
          if (!formatos || formatos.includes('qr_code')) nativo = new Construtor({ formats: ['qr_code'] });
        } catch { nativo = null; }
      }
      const jsQR = nativo ? null : (await import('jsqr')).default;
      const quadro = document.createElement('canvas');
      const ctx = quadro.getContext('2d', { willReadFrequently: true });

      const ler = async () => {
        if (!vivo) return;
        let texto: string | undefined;
        if (v.readyState >= 2 && v.videoWidth) {
          if (nativo) {
            texto = (await nativo.detect(v).catch(() => []))[0]?.rawValue;
          } else if (jsQR && ctx) {
            // reduz o quadro: o QR do totem é grande, e menos pixels deixam a leitura rápida no celular
            const escala = Math.min(1, 720 / v.videoWidth);
            quadro.width = Math.round(v.videoWidth * escala);
            quadro.height = Math.round(v.videoHeight * escala);
            ctx.drawImage(v, 0, 0, quadro.width, quadro.height);
            const img = ctx.getImageData(0, 0, quadro.width, quadro.height);
            texto = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data;
          }
        }
        if (texto && vivo) {
          vivo = false;
          navigator.vibrate?.(60);
          aoLerRef.current(texto);
          return;
        }
        espera = window.setTimeout(ler, 160);
      };
      ler();
    })();

    return () => {
      vivo = false;
      window.clearTimeout(espera);
      fluxo?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="lq" role="dialog" aria-label={titulo}>
      <div className="lq-topo">
        <span className="strong">{titulo}</span>
        <button type="button" className="btn sm" onClick={aoFechar}>Fechar</button>
      </div>
      <div className="lq-palco">
        <video ref={video} className="lq-video" playsInline muted autoPlay />
        {!erro && <div className="lq-mira" aria-hidden="true" />}
        {erro && <div className="lq-erro" role="alert">{erro}</div>}
      </div>
      <p className="lq-dica">{erro ? 'Você ainda pode digitar o código de 4 letras.' : pronto ? 'Aponte para o QR do totem. A leitura é automática.' : 'Abrindo a câmera…'}</p>
    </div>
  );
}
