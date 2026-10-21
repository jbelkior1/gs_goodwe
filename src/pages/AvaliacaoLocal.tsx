import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { dataHora, horas, num } from '../domain/formato';
import type { FormatoFranquia } from '../domain/types';
import type { AvaliacaoLocal, CabimentoFormato, StatusCabimento } from '../data/avaliacoes';
import { FORMATOS } from '../domain/catalogo';
import { Badge } from '../ui/kit';
import './AvaliacaoLocal.css';

const FORMATOS_LISTA = Object.keys(FORMATOS) as FormatoFranquia[];
const CABIMENTO: Record<StatusCabimento, { tom: 'pos' | 'warn' | 'neg'; rotulo: string }> = {
  cabe: { tom: 'pos', rotulo: 'cabe' },
  limite: { tom: 'warn', rotulo: 'no limite' },
  nao: { tom: 'neg', rotulo: 'não cabe' },
};
const LIGACAO: Record<string, string> = { mono: 'monofásica', bi: 'bifásica', tri: 'trifásica' };

/** Câmera de traço fino, no mesmo padrão dos ícones do app (o conjunto de icones.tsx não tem câmera). */
export function IconeCamera({ tamanho = 14, titulo }: { tamanho?: number; titulo?: string }) {
  return (
    <svg
      width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', display: 'block' }}
      role={titulo ? 'img' : undefined} aria-label={titulo} aria-hidden={titulo ? undefined : true}
    >
      <path d="M4 8h3l1.5-2.5h7L17 8h3v11H4V8Z M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
    </svg>
  );
}

/** O que falta para o formato caber, em palavras: "faltam 2,0 m de frente e 0,4 m de fundo". */
function faltaTexto(c: CabimentoFormato): string {
  const partes: string[] = [];
  if (c.faltaLarguraM > 0) partes.push(`${num(c.faltaLarguraM, 1)} m de frente`);
  if (c.faltaProfundidadeM > 0) partes.push(`${num(c.faltaProfundidadeM, 1)} m de fundo`);
  return partes.length ? `faltam ${partes.join(' e ')}` : '';
}

interface Ampliada { url: string; legenda: string }

function Foto({ url, legenda, aoAmpliar }: { url: string | null; legenda: string; aoAmpliar: (a: Ampliada, abridor: HTMLElement) => void }) {
  const [falhou, setFalhou] = useState(false);
  return (
    <figure className="al-foto">
      {url && !falhou ? (
        <button type="button" className="al-foto-btn" onClick={(e) => aoAmpliar({ url, legenda }, e.currentTarget)}
                aria-label={`Ampliar: ${legenda}`}>
          <img src={url} alt={legenda} loading="lazy" onError={() => setFalhou(true)} />
        </button>
      ) : (
        <div className="al-foto-falta">Imagem indisponível</div>
      )}
      <figcaption>{legenda}</figcaption>
    </figure>
  );
}

/**
 * Avaliação do local (gs_vr) como cartão de leitura: foto e Ponto W projetado lado a lado (clicam para
 * ampliar), medidas, se cada formato cabe e a viabilidade. Serve ao formulário Seja GoodWe e à
 * Homologação. `formatoPedido` (o formato escolhido ou pedido) ganha uma linha própria dizendo se cabe.
 */
export function AvaliacaoLocalVista({ av, formatoPedido }: { av: AvaliacaoLocal; formatoPedido?: FormatoFranquia }) {
  const d = av.dados;
  const [ampliada, setAmpliada] = useState<Ampliada | null>(null);
  const abridor = useRef<HTMLElement | null>(null);
  const fechar = useRef<HTMLButtonElement>(null);

  const ampliar = (a: Ampliada, el: HTMLElement) => { abridor.current = el; setAmpliada(a); };
  const encerrar = () => { setAmpliada(null); abridor.current?.focus(); };

  useEffect(() => {
    if (!ampliada) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAmpliada(null); abridor.current?.focus(); } };
    window.addEventListener('keydown', tecla);
    fechar.current?.focus();
    return () => window.removeEventListener('keydown', tecla);
  }, [ampliada]);

  const mostrado = d.formato ?? d.formatoRecomendado;
  const pedido = formatoPedido ? d.cabimento[formatoPedido] : undefined;
  const v = d.viabilidade;
  const vTom = v?.veredito === 'APROVAR' ? 'pos' : v?.veredito === 'APROVAR_COM_RESSALVA' ? 'warn' : 'neg';
  const vRotulo = v?.veredito === 'APROVAR' ? 'Alto potencial' : v?.veredito === 'APROVAR_COM_RESSALVA' ? 'Viável, com ressalva' : 'Abaixo do mínimo';
  const el = d.entradaEletrica;
  const exigencias = FORMATOS_LISTA.map((f) => ({ f, c: d.cabimento[f] })).filter((x) => x.c);

  return (
    <div className="al">
      {d.exemplo && (
        <p className="al-exemplo tiny">Esta avaliação usou a foto de exemplo do gs_vr, não um local real.</p>
      )}

      <div className="al-fotos">
        <Foto url={av.fotoUrl} legenda="Foto do local" aoAmpliar={ampliar} />
        <Foto url={av.renderUrl} legenda={mostrado ? `Ponto W ${mostrado} projetado` : 'Ponto W projetado'} aoAmpliar={ampliar} />
      </div>

      <dl className="al-medidas">
        <div><dt className="kpi-label">Frente</dt><dd>{num(d.area.larguraM, 1)} m</dd></div>
        <div><dt className="kpi-label">Fundo</dt><dd>{num(d.area.profundidadeM, 1)} m</dd></div>
        <div><dt className="kpi-label">Área</dt><dd>{num(d.area.areaM2)} m²</dd></div>
      </dl>

      {exigencias.length > 0 && (
        <div className="al-bloco">
          <div className="kpi-label">O que cabe nesta área</div>
          <div className="al-chips">
            {exigencias.map(({ f, c }) => (
              <Badge key={f} tom={CABIMENTO[c!.status].tom} dot>{f}: {CABIMENTO[c!.status].rotulo}</Badge>
            ))}
          </div>
          <p className="tiny muted al-nota">
            {exigencias.map(({ f, c }) => `${f} precisa de ${num(c!.exigeLarguraM, 1)} x ${num(c!.exigeProfundidadeM, 1)} m`).join(' · ')}.
          </p>
        </div>
      )}

      {formatoPedido && pedido && pedido.status !== 'cabe' && (
        <div className={`al-aviso ${pedido.status === 'nao' ? 'neg' : 'warn'}`} role="note">
          {pedido.status === 'nao'
            ? <>O formato <b>{formatoPedido}</b> não cabe na área avaliada{faltaTexto(pedido) ? ` (${faltaTexto(pedido)})` : ''}. Escolha um formato menor ou refaça a avaliação.</>
            : <>O formato <b>{formatoPedido}</b> fica no limite da área avaliada: a vistoria confirma no local.</>}
        </div>
      )}
      {formatoPedido && pedido?.status === 'cabe' && (
        <p className="tiny al-nota">O formato <b>{formatoPedido}</b> cabe na área avaliada.</p>
      )}

      {v && (
        <div className="al-viab">
          <div>
            <div className="kpi-label">Potencial do ponto</div>
            <div className="al-score">{num(v.score)}<small> / 100</small></div>
          </div>
          <div>
            <div className="kpi-label">Uso previsto</div>
            <div className="al-score">{horas(v.horasUsoPrevistas)}<small> / dia</small></div>
          </div>
          <Badge tom={vTom} dot>{vRotulo}</Badge>
        </div>
      )}

      <ul className="al-detalhes tiny muted">
        {el && (el.disjuntorA != null || el.cargaDisponivelKW != null) && (
          <li>
            Entrada elétrica{el.informada ? '' : ' (padrão, não confirmada)'}:{' '}
            {el.ligacao ? `${LIGACAO[el.ligacao] ?? el.ligacao}, ` : ''}
            {el.disjuntorA != null ? `disjuntor de ${num(el.disjuntorA)} A` : ''}
            {el.cargaDisponivelKW != null ? ` (cerca de ${num(el.cargaDisponivelKW, 1)} kW)` : ''}.
          </li>
        )}
        {d.lente && <li>{d.lente}. Avaliado em {dataHora(av.criadoEm)}.</li>}
        {d.avisos.map((a) => <li key={a}>{a}</li>)}
      </ul>

      {ampliada && createPortal(
        <div className="al-lightbox" role="dialog" aria-modal="true" aria-label={ampliada.legenda} onClick={encerrar}>
          <button ref={fechar} type="button" className="btn al-fechar" onClick={encerrar}>Fechar</button>
          <img src={ampliada.url} alt={ampliada.legenda} onClick={(e) => e.stopPropagation()} />
          <span className="al-lightbox-legenda">{ampliada.legenda}</span>
        </div>,
        document.body,
      )}
    </div>
  );
}
