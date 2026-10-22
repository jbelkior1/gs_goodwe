import { useEffect, useRef } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MapaCalor.css';
import { adicionarBlocos } from './blocosDoMapa';
import type { PontoDeCalor } from '../domain/engine/prospeccao';

/**
 * Mapa de calor da prospecção: Leaflet (mesmos blocos escuros do mapa da rede) com uma camada de
 * calor desenhada em canvas, sem biblioteca extra. Cada amostra espalha o seu peso (0–1) com um núcleo
 * gaussiano largo; o maior valor de cada lugar vira cor na escala clássica azul → ciano → verde → amarelo → vermelho,
 * sobre um véu azul no mapa todo. O raio é em metros (com limites em pixels), então acompanha o zoom.
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

/**
 * Raio de influência de cada amostra, em metros no chão: grande de propósito, para vias vizinhas se
 * fundirem em manchas contínuas (o visual clássico de mapa de calor), com limites em pixels para o
 * desenho não sumir no zoom de cidade nem virar um borrão único de perto.
 */
const RAIO_M = 2600;
const RAIO_MIN_PX = 52;
const RAIO_MAX_PX = 170;
/** a conta é feita numa grade de CELULA × CELULA pixels e ampliada com suavização: rápido e sem degraus */
const CELULA = 4;
/** véu azul sobre o mapa todo (como no mapa de calor de cliques): o "frio" também é cor */
const VEU = 0.38;
const ESCALA: [number, string][] = [
  [0, '#1b1bb3'], [0.2, '#1f4fff'], [0.38, '#00c8ff'], [0.55, '#14f07a'], [0.7, '#e6ff00'], [0.82, '#ffb000'], [0.92, '#ff4a00'], [1, '#e00000'],
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

/** núcleo gaussiano (raio em células), guardado por raio */
const nucleos = new Map<number, Float32Array>();
function nucleo(raio: number): Float32Array {
  const pronto = nucleos.get(raio);
  if (pronto) return pronto;
  const lado = raio * 2 + 1;
  const k = new Float32Array(lado * lado);
  const sigma = raio / 2.4;
  for (let y = -raio; y <= raio; y++) {
    for (let x = -raio; x <= raio; x++) {
      const d2 = x * x + y * y;
      if (d2 <= raio * raio) k[(y + raio) * lado + (x + raio)] = Math.exp(-d2 / (2 * sigma * sigma));
    }
  }
  nucleos.set(raio, k);
  return k;
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
    const rPx = Math.min(RAIO_MAX_PX, Math.max(RAIO_MIN_PX, RAIO_M / mPorPx));
    const raio = Math.max(2, Math.round(rPx / CELULA));
    const k = nucleo(raio);
    const lado = raio * 2 + 1;

    // 1) espalha cada amostra numa grade de números (sem os degraus de 8 bits do canvas). Cada célula
    //    guarda a MAIOR influência que recebe, não a soma: um cruzamento de vias medianas não pode
    //    esquentar mais que uma via ótima sozinha, senão o vermelho do mapa não bate com o ranking.
    const gw = Math.ceil(tam.x / CELULA);
    const gh = Math.ceil(tam.y / CELULA);
    const grade = new Float32Array(gw * gh);
    for (const [la, ln, peso] of this.pontos) {
      if (peso <= 0) continue;
      const pt = mapa.latLngToContainerPoint([la, ln]);
      const cx = Math.round(pt.x / CELULA);
      const cy = Math.round(pt.y / CELULA);
      if (cx < -raio || cy < -raio || cx > gw + raio || cy > gh + raio) continue;
      for (let y = Math.max(0, cy - raio); y <= Math.min(gh - 1, cy + raio); y++) {
        const ky = (y - cy + raio) * lado;
        const linha = y * gw;
        for (let x = Math.max(0, cx - raio); x <= Math.min(gw - 1, cx + raio); x++) {
          const v = peso * k[ky + (x - cx + raio)];
          if (v > grade[linha + x]) grade[linha + x] = v;
        }
      }
    }

    // 2) contraste automático: o topo (percentil 97 do que tem calor) já é vermelho; a curva abre os
    //    tons do meio (verde e amarelo), como no mapa de calor de cliques
    const comCalor: number[] = [];
    for (let i = 0; i < grade.length; i += 3) if (grade[i] > 0) comCalor.push(grade[i]);
    comCalor.sort((a, b) => a - b);
    const max = comCalor.length ? comCalor[Math.floor(comCalor.length * 0.97)] : 0;
    const pal = obterPaleta();
    const pequena = document.createElement('canvas');
    pequena.width = gw;
    pequena.height = gh;
    const pctx = pequena.getContext('2d')!;
    const img = pctx.createImageData(gw, gh);
    const d = img.data;
    const veu = Math.round(VEU * 255);
    for (let i = 0; i < grade.length; i++) {
      const v = max > 0 ? Math.pow(Math.min(1, grade[i] / max), 0.55) : 0;
      const j = Math.min(255, Math.round(v * 255)) * 4;
      d[i * 4] = pal[j];
      d[i * 4 + 1] = pal[j + 1];
      d[i * 4 + 2] = pal[j + 2];
      // o frio fica só no véu; o quente fica mais opaco, sem esconder de vez o mapa embaixo
      d[i * 4 + 3] = Math.round(veu + v * (215 - veu));
    }
    pctx.putImageData(img, 0, 0);

    // 3) amplia a grade para o tamanho do mapa com suavização: as manchas saem contínuas
    const ctx = tela.getContext('2d')!;
    ctx.clearRect(0, 0, tam.x, tam.y);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(pequena, 0, 0, gw * CELULA, gh * CELULA);
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
