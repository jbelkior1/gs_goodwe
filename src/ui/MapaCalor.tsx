import { useEffect, useRef } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MapaCalor.css';
import { adicionarBlocos } from './blocosDoMapa';
import type { PontoDeCalor } from '../domain/engine/prospeccao';

/**
 * Mapa de calor da prospecção: Leaflet (mesmos blocos escuros do mapa da rede) com uma camada de
 * calor desenhada em canvas, sem biblioteca extra. Cada ponto de calor é um borrão cujo peso (0–1)
 * soma com os vizinhos; a soma vira cor numa escala azul → verde → âmbar → vermelho. O raio do borrão
 * é fixo em metros, então o desenho acompanha o zoom.
 *
 * Por cima vão os marcadores: pontos da rede (vermelho), carregadores de terceiros (cinza) e as
 * oportunidades numeradas (a selecionada cresce). Clicar numa oportunidade chama `aoSelecionar`.
 */

export interface MarcadorCalor {
  id: string;
  lat: number;
  lng: number;
  tipo: 'rede' | 'terceiro' | 'oportunidade';
  rotulo: string;
  /** posição no ranking (só oportunidades) */
  n?: number;
}

/** raio de cada borrão, em metros no chão (vira pixels conforme o zoom) */
const RAIO_M = 280;
const ESCALA: [number, string][] = [
  [0, 'rgba(0,0,0,0)'], [0.18, '#1e3a8a'], [0.36, '#2563eb'], [0.55, '#22c55e'], [0.72, '#ffb020'], [0.88, '#ff5560'], [1, '#ffe4e6'],
];

/** a escala de cores em 256 tons (RGBA), feita uma vez */
let paleta: Uint8ClampedArray | null = null;
function obterPaleta(): Uint8ClampedArray {
  if (paleta) return paleta;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 1;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  for (const [pos, cor] of ESCALA) g.addColorStop(pos, cor);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 1);
  paleta = ctx.getImageData(0, 0, 256, 1).data;
  return paleta;
}

/** borrão de um ponto: círculo com sombra desfocada (a técnica do simpleheat), guardado por raio */
const pinceis = new Map<number, HTMLCanvasElement>();
function pincel(r: number): HTMLCanvasElement {
  const chave = Math.round(r);
  const pronto = pinceis.get(chave);
  if (pronto) return pronto;
  const blur = chave * 0.85;
  const lado = (chave + blur) * 2;
  const c = document.createElement('canvas');
  c.width = lado; c.height = lado;
  const ctx = c.getContext('2d')!;
  // o círculo fica fora do quadro e só a sombra dele aparece: borda macia sem gradiente manual
  ctx.shadowOffsetX = ctx.shadowOffsetY = lado * 2;
  ctx.shadowBlur = blur;
  ctx.shadowColor = '#000';
  ctx.beginPath();
  ctx.arc(-lado * 1.5, -lado * 1.5, chave, 0, Math.PI * 2);
  ctx.fill();
  pinceis.set(chave, c);
  return c;
}

/** camada de calor: um canvas no painel de sobreposição, redesenhado quando o mapa para de mexer */
class CamadaCalor extends L.Layer {
  private tela: HTMLCanvasElement | null = null;
  private pontos: PontoDeCalor[];
  private mapa: L.Map | null = null;

  constructor(pontos: PontoDeCalor[]) {
    super();
    this.pontos = pontos;
  }

  definir(pontos: PontoDeCalor[]) {
    this.pontos = pontos;
    this.desenhar();
  }

  onAdd(mapa: L.Map): this {
    this.mapa = mapa;
    this.tela = L.DomUtil.create('canvas', 'mc-calor') as HTMLCanvasElement;
    mapa.getPanes().overlayPane.appendChild(this.tela);
    mapa.on('moveend resize', this.desenhar, this);
    mapa.on('zoomstart', this.esconder, this);
    this.desenhar();
    return this;
  }

  onRemove(mapa: L.Map): this {
    mapa.off('moveend resize', this.desenhar, this);
    mapa.off('zoomstart', this.esconder, this);
    this.tela?.remove();
    this.tela = null;
    this.mapa = null;
    return this;
  }

  private esconder() {
    if (this.tela) this.tela.style.visibility = 'hidden';
  }

  desenhar() {
    const mapa = this.mapa;
    const tela = this.tela;
    if (!mapa || !tela) return;
    const tam = mapa.getSize();
    if (!tam.x || !tam.y) return;
    tela.width = tam.x;
    tela.height = tam.y;
    tela.style.width = `${tam.x}px`;
    tela.style.height = `${tam.y}px`;
    L.DomUtil.setPosition(tela, mapa.containerPointToLayerPoint([0, 0]));
    tela.style.visibility = 'visible';

    // metros por pixel nesta latitude e neste zoom (Web Mercator, blocos de 256 px)
    const lat = mapa.getCenter().lat;
    const mPorPx = (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / 2 ** (mapa.getZoom() + 8);
    const r = Math.min(48, Math.max(7, RAIO_M / mPorPx));
    const p = pincel(r);
    const meio = p.width / 2;

    const ctx = tela.getContext('2d', { willReadFrequently: true })!;
    ctx.clearRect(0, 0, tam.x, tam.y);
    // borrões vizinhos se somam: o alfa de cada um é baixo para a via cheia não virar um bloco só
    for (const [la, ln, peso] of this.pontos) {
      const pt = mapa.latLngToContainerPoint([la, ln]);
      if (pt.x < -meio || pt.y < -meio || pt.x > tam.x + meio || pt.y > tam.y + meio) continue;
      ctx.globalAlpha = Math.max(0.04, Math.min(1, peso)) * 0.34;
      ctx.drawImage(p, pt.x - meio, pt.y - meio);
    }
    ctx.globalAlpha = 1;

    // pinta: a intensidade acumulada (alfa) escolhe a cor da escala
    const img = ctx.getImageData(0, 0, tam.x, tam.y);
    const d = img.data;
    const pal = obterPaleta();
    for (let i = 3; i < d.length; i += 4) {
      const a = d[i];
      if (!a) continue;
      const j = Math.min(255, a) * 4;
      d[i - 3] = pal[j];
      d[i - 2] = pal[j + 1];
      d[i - 1] = pal[j + 2];
      d[i] = Math.min(225, a * 1.6);
    }
    ctx.putImageData(img, 0, 0);
  }
}

function icone(m: MarcadorCalor, ativo: boolean): L.DivIcon {
  const el = document.createElement('div');
  el.className = `mc-pino ${m.tipo}${ativo ? ' ativo' : ''}`;
  if (m.tipo === 'oportunidade') el.textContent = String(m.n ?? '');
  const tam = m.tipo === 'oportunidade' ? (ativo ? 36 : 28) : m.tipo === 'rede' ? 18 : 12;
  return L.divIcon({ html: el, className: 'mc-icone', iconSize: [tam, tam], iconAnchor: [tam / 2, tam / 2] });
}

export function MapaCalor({
  calor, marcadores, selecionado, aoSelecionar,
}: {
  calor: PontoDeCalor[];
  marcadores: MarcadorCalor[];
  selecionado?: string;
  aoSelecionar?: (id: string) => void;
}) {
  const alvo = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const camadaRef = useRef<CamadaCalor | null>(null);
  const grupoRef = useRef<L.LayerGroup | null>(null);
  const aoSelecionarRef = useRef(aoSelecionar);
  const calorRef = useRef(calor);
  const marcadoresRef = useRef(marcadores);
  const enquadrou = useRef(false);

  useEffect(() => {
    aoSelecionarRef.current = aoSelecionar;
    calorRef.current = calor;
    marcadoresRef.current = marcadores;
  });

  // o mapa nasce uma vez; o primeiro tamanho válido enquadra o calor
  useEffect(() => {
    const el = alvo.current;
    if (!el) return;
    const mapa = L.map(el, {
      zoomControl: false, attributionControl: false, zoomSnap: 0.5, minZoom: 9, maxZoom: 16,
      scrollWheelZoom: false, center: [-23.56, -46.65], zoom: 11,
    });
    const atribuicao = adicionarBlocos(mapa);
    L.control.attribution({ position: 'bottomright', prefix: false }).addAttribution(atribuicao).addTo(mapa);
    L.control.zoom({ position: 'bottomright', zoomInTitle: 'Aproximar', zoomOutTitle: 'Afastar' }).addTo(mapa);
    mapa.on('focus', () => mapa.scrollWheelZoom.enable());
    mapa.on('blur', () => mapa.scrollWheelZoom.disable());

    const camada = new CamadaCalor(calorRef.current);
    camada.addTo(mapa);
    const grupo = L.layerGroup().addTo(mapa);
    mapaRef.current = mapa;
    camadaRef.current = camada;
    grupoRef.current = grupo;

    const medidor = new ResizeObserver(() => {
      if (!el.clientWidth || !el.clientHeight) return;
      mapa.invalidateSize({ animate: false, pan: false });
      if (!enquadrou.current && calorRef.current.length) {
        mapa.fitBounds(L.latLngBounds(calorRef.current.map(([la, ln]) => [la, ln] as L.LatLngTuple)), { padding: [24, 24], maxZoom: 13 });
        enquadrou.current = true;
      }
      camada.desenhar();
    });
    medidor.observe(el);
    return () => {
      medidor.disconnect();
      mapa.remove();
      mapaRef.current = null;
      camadaRef.current = null;
      grupoRef.current = null;
    };
  }, []);

  useEffect(() => { camadaRef.current?.definir(calor); }, [calor]);

  // marcadores: refeitos inteiros (são poucos), a oportunidade escolhida por cima de todos
  useEffect(() => {
    const grupo = grupoRef.current;
    if (!grupo) return;
    grupo.clearLayers();
    for (const m of marcadores) {
      const ativo = m.id === selecionado;
      const mk = L.marker([m.lat, m.lng], {
        icon: icone(m, ativo), keyboard: m.tipo === 'oportunidade', riseOnHover: true,
        zIndexOffset: ativo ? 2000 : m.tipo === 'oportunidade' ? 1000 - (m.n ?? 0) : m.tipo === 'rede' ? 500 : 0,
      });
      mk.bindTooltip(m.rotulo, { direction: 'top', offset: [0, -10], className: 'mc-dica' });
      if (m.tipo === 'oportunidade') mk.on('click', () => aoSelecionarRef.current?.(m.id));
      mk.addTo(grupo);
    }
  }, [marcadores, selecionado]);

  // oportunidade escolhida fora da vista: traz para dentro
  useEffect(() => {
    // só quando a escolha muda (lê os marcadores pela ref): ligar ou desligar uma camada não mexe na vista
    const mapa = mapaRef.current;
    const m = marcadoresRef.current.find((x) => x.id === selecionado);
    if (!mapa || !m) return;
    const p = L.latLng(m.lat, m.lng);
    if (!mapa.getBounds().pad(-0.15).contains(p)) mapa.panTo(p);
  }, [selecionado]);

  return (
    <div className="mc" role="group" aria-label="Mapa de calor da prospecção">
      <div ref={alvo} className="mc-mapa" />
    </div>
  );
}
