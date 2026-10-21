import { useEffect, useRef } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MapaRede.css';
import type { Ponto, Regiao } from '../domain/types';
import { plural, tarifaKWh } from '../domain/formato';

/**
 * Mapa da rede.
 *
 * Mapa de verdade (Leaflet) com os blocos escuros do CARTO sobre dados do OpenStreetMap. Cada ponto
 * é um marcador próprio, na cor da disponibilidade (verde: tem vaga, azul: ocupado, cinza: indisponível),
 * com o número de vagas livres dentro. Passar o mouse (ou tocar) mostra o ponto; clicar chama
 * `aoSelecionar`. O app re-renderiza a cada evento do tempo real: os marcadores são atualizados no
 * lugar, sem recriar o mapa nem mexer na posição que a pessoa escolheu.
 *
 * Os pontos vêm de `pontosParaMotorista()` e a tela decide o que significa "indisponível".
 */

export interface PontoNoMapa {
  ponto: Ponto;
  regiao: Regiao;
  vagasLivres: number;
  totalVagas: number;
  precoAgora: number;
  /** nenhuma vaga em condição de receber carro (manutenção ou sem sinal): marcador cinza */
  indisponivel?: boolean;
}

type Situacao = 'livre' | 'cheio' | 'fora';

const situacaoDe = (p: PontoNoMapa): Situacao =>
  p.indisponivel || p.totalVagas === 0 ? 'fora' : p.vagasLivres > 0 ? 'livre' : 'cheio';

const textoVagas = (p: PontoNoMapa, s: Situacao): string =>
  s === 'fora' ? 'indisponível' : s === 'livre' ? plural(p.vagasLivres, 'vaga livre', 'vagas livres') : 'sem vaga';

/**
 * Blocos do mapa. O CARTO (dark_all) exige uma chave gratuita desde 2026: sem ela os blocos saem com a marca
 * d'água "API KEY REQUIRED". A chave vem de VITE_CARTO_KEY (peça em https://carto.com/basemaps/apikey/; é pública
 * por natureza, vai na URL do bloco). Sem a chave, o mapa usa o cinza escuro da Esri, que não pede chave.
 */
const CHAVE_CARTO = (import.meta.env.VITE_CARTO_KEY as string | undefined)?.trim();
const ATRIBUICAO_CARTO =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors '
  + '&copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>';
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';
const ATRIBUICAO_ESRI = 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors';

function adicionarBlocos(mapa: L.Map): string {
  if (CHAVE_CARTO) {
    L.tileLayer(`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(CHAVE_CARTO)}`, {
      subdomains: 'abcd', maxZoom: 19, detectRetina: true,
    }).addTo(mapa);
    return ATRIBUICAO_CARTO;
  }
  if (import.meta.env.DEV) console.warn('MapaRede: sem VITE_CARTO_KEY, usando o mapa escuro da Esri. Peça a chave em https://carto.com/basemaps/apikey/');
  L.tileLayer(`${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, { maxNativeZoom: 16, maxZoom: 19 }).addTo(mapa);
  L.tileLayer(`${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { maxNativeZoom: 16, maxZoom: 19 }).addTo(mapa);
  return ATRIBUICAO_ESRI;
}

/** quando o mapa não tem ponto nenhum: o Brasil inteiro */
const VISTA_BRASIL = { centro: [-14.2, -51.9] as L.LatLngTuple, zoom: 4 };
/** acima disto o nome aparece ao lado do marcador; abaixo, o marcador encolhe */
const ZOOM_COM_NOME = 13;
const ZOOM_MARCADOR_PEQUENO = 11.5;

const elemento = (tag: string, classe: string, texto = ''): HTMLElement => {
  const el = document.createElement(tag);
  el.className = classe;
  if (texto) el.textContent = texto;
  return el;
};

/** tudo o que o mapa guarda de cada ponto: os elementos são atualizados no lugar (nada de innerHTML) */
interface Marcador {
  marker: L.Marker;
  pino: HTMLElement;
  numero: HTMLElement;
  nome: HTMLElement;
  dicaNome: HTMLElement;
  dicaZona: HTMLElement;
  dicaVagas: HTMLElement;
  dicaPreco: HTMLElement;
  assinatura: string;
}

interface Interno {
  mapa: L.Map;
  marcadores: Map<string, Marcador>;
  /** a pessoa mexeu no mapa: não reenquadrar sozinho */
  interagiu: boolean;
  jaEnquadrou: boolean;
  idsAnteriores: string;
  selecionadoAnterior?: string;
}

function criarMarcador(p: PontoNoMapa, aoClicar: () => void): Marcador {
  const pino = elemento('div', 'mr-pino');
  const numero = elemento('span', 'mr-pino-n');
  const nome = elemento('span', 'mr-pino-nome');
  pino.append(numero, nome);

  const dicaNome = elemento('div', 'mr-dica-nome');
  const dicaZona = elemento('div', 'mr-dica-meta');
  const dicaVagas = elemento('span', '');
  const dicaPreco = elemento('span', '');
  const dicaNum = elemento('div', 'mr-dica-num');
  dicaNum.append(dicaVagas, dicaPreco);
  const dica = elemento('div', '');
  dica.append(dicaNome, dicaZona, dicaNum);

  const marker = L.marker([Number(p.ponto.lat), Number(p.ponto.lng)], {
    icon: L.divIcon({ html: pino, className: 'mr-icone', iconSize: [34, 34], iconAnchor: [17, 17] }),
    keyboard: true,
    riseOnHover: true,
  });
  marker.bindTooltip(dica, { direction: 'top', offset: [0, -20], opacity: 1, className: 'mr-dica' });
  marker.on('click', aoClicar);
  return { marker, pino, numero, nome, dicaNome, dicaZona, dicaVagas, dicaPreco, assinatura: '' };
}

/** atualiza o marcador só quando algo que ele mostra mudou */
function pintarMarcador(m: Marcador, p: PontoNoMapa, ativo: boolean) {
  const situacao = situacaoDe(p);
  const lat = Number(p.ponto.lat);
  const lng = Number(p.ponto.lng);
  const assinatura = [situacao, p.vagasLivres, p.totalVagas, p.precoAgora, p.ponto.nome, p.regiao.zona, ativo, lat, lng].join('|');
  if (assinatura === m.assinatura) return;
  m.assinatura = assinatura;

  m.pino.className = `mr-pino ${situacao}${ativo ? ' ativo' : ''}`;
  m.numero.textContent = situacao === 'fora' ? '–' : String(p.vagasLivres);
  m.nome.textContent = p.ponto.nome;

  m.dicaNome.textContent = p.ponto.nome;
  m.dicaZona.textContent = `${p.regiao.zona} · ${p.regiao.cidade}/${p.regiao.uf}`;
  m.dicaVagas.className = situacao;
  m.dicaVagas.textContent = textoVagas(p, situacao);
  m.dicaPreco.textContent = tarifaKWh(p.precoAgora);

  m.marker.setZIndexOffset(ativo ? 1000 : situacao === 'livre' ? 200 : situacao === 'cheio' ? 100 : 0);
  const atual = m.marker.getLatLng();
  if (atual.lat !== lat || atual.lng !== lng) m.marker.setLatLng([lat, lng]);
  m.marker.getElement()?.setAttribute('aria-label', `${p.ponto.nome}: ${textoVagas(p, situacao)}, ${tarifaKWh(p.precoAgora)}`);
  if (m.marker.isTooltipOpen()) m.marker.getTooltip()?.update();
}

export function MapaRede({
  pontos, selecionado, aoSelecionar, compacto,
}: {
  pontos: PontoNoMapa[];
  selecionado?: string;
  aoSelecionar?: (id: string) => void;
  compacto?: boolean;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const alvo = useRef<HTMLDivElement>(null);
  const interno = useRef<Interno | null>(null);
  const aoSelecionarRef = useRef(aoSelecionar);
  const pontosRef = useRef(pontos);

  useEffect(() => {
    aoSelecionarRef.current = aoSelecionar;
    pontosRef.current = pontos;
  });

  /** enquadra todos os pontos com folga (ou o Brasil, se não há ponto) */
  const enquadrar = (animar: boolean) => {
    const it = interno.current;
    if (!it) return;
    const coords = pontosRef.current
      .map((p) => [Number(p.ponto.lat), Number(p.ponto.lng)] as L.LatLngTuple)
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    if (!coords.length) it.mapa.setView(VISTA_BRASIL.centro, VISTA_BRASIL.zoom, { animate: animar });
    else if (coords.length === 1) it.mapa.setView(coords[0], 15, { animate: animar });
    else it.mapa.fitBounds(L.latLngBounds(coords), {
      paddingTopLeft: [36, 40], paddingBottomRight: [36, 52], maxZoom: 15, animate: animar,
    });
    it.jaEnquadrou = true;
  };

  // o mapa nasce uma vez e é desmontado junto com a tela
  useEffect(() => {
    const el = alvo.current;
    const casca = raiz.current;
    if (!el || !casca) return;

    // no celular, um dedo rola a página (e o mapa não prende a rolagem); dois dedos movem e dão zoom
    const toque = window.matchMedia('(pointer: coarse)').matches;
    const mapa = L.map(el, {
      zoomControl: false,
      attributionControl: false,
      zoomSnap: 0.5,
      zoomDelta: 1,
      minZoom: 3,
      maxZoom: 18,
      dragging: !toque,
      scrollWheelZoom: false,
      center: VISTA_BRASIL.centro,
      zoom: VISTA_BRASIL.zoom,
    });
    const atribuicao = adicionarBlocos(mapa);
    L.control.attribution({ position: 'bottomright', prefix: false }).addAttribution(atribuicao).addTo(mapa);
    L.control.zoom({ position: 'bottomright', zoomInTitle: 'Aproximar', zoomOutTitle: 'Afastar' }).addTo(mapa);

    // a roda do mouse só dá zoom depois que o mapa recebe foco (senão trava a rolagem da tela)
    mapa.on('focus', () => mapa.scrollWheelZoom.enable());
    mapa.on('blur', () => mapa.scrollWheelZoom.disable());

    const aoZoom = () => {
      const z = mapa.getZoom();
      el.classList.toggle('mr-zoom-baixo', z <= ZOOM_MARCADOR_PEQUENO);
      el.classList.toggle('mr-zoom-alto', z >= ZOOM_COM_NOME);
    };
    mapa.on('zoomend', aoZoom);
    aoZoom();

    const it: Interno = { mapa, marcadores: new Map(), interagiu: false, jaEnquadrou: false, idsAnteriores: '' };
    interno.current = it;

    const gestos = new AbortController();
    const mexeu = () => { it.interagiu = true; };
    for (const tipo of ['pointerdown', 'wheel', 'keydown']) el.addEventListener(tipo, mexeu, { passive: true, signal: gestos.signal });

    // dica de dois dedos: aparece quando um dedo só toca o mapa
    let dicaTimer: ReturnType<typeof setTimeout> | undefined;
    if (toque) {
      el.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        casca.classList.add('mr-mostra-dica');
        clearTimeout(dicaTimer);
        dicaTimer = setTimeout(() => casca.classList.remove('mr-mostra-dica'), 1400);
      }, { passive: true, signal: gestos.signal });
    }

    // o tamanho muda com a tela, a moldura do celular e a rotação; o primeiro tamanho válido enquadra os pontos
    const medidor = new ResizeObserver(() => {
      if (!el.clientWidth || !el.clientHeight) return;
      mapa.invalidateSize({ animate: false, pan: false });
      if (!it.jaEnquadrou && pontosRef.current.length) enquadrar(false);
    });
    medidor.observe(el);

    return () => {
      medidor.disconnect();
      gestos.abort();
      clearTimeout(dicaTimer);
      mapa.remove();
      interno.current = null;
    };
    // `enquadrar` só lê refs: não precisa entrar nas dependências
  }, []);

  // marcadores: criados, atualizados no lugar e removidos conforme os pontos mudam
  useEffect(() => {
    const it = interno.current;
    if (!it) return;

    const validos = pontos.filter((p) => Number.isFinite(Number(p.ponto.lat)) && Number.isFinite(Number(p.ponto.lng)));
    const vistos = new Set<string>();
    for (const p of validos) {
      const id = p.ponto.id;
      vistos.add(id);
      let m = it.marcadores.get(id);
      if (!m) {
        m = criarMarcador(p, () => aoSelecionarRef.current?.(id));
        it.marcadores.set(id, m);
        m.marker.addTo(it.mapa);
      }
      pintarMarcador(m, p, id === selecionado);
    }
    for (const [id, m] of it.marcadores) {
      if (vistos.has(id)) continue;
      m.marker.remove();
      it.marcadores.delete(id);
    }

    // conjunto de pontos mudou: reenquadra, a menos que a pessoa já tenha escolhido a vista
    const ids = [...vistos].sort().join(',');
    const tamanhoOk = !!alvo.current?.clientWidth && !!alvo.current?.clientHeight;
    if (ids !== it.idsAnteriores && tamanhoOk && (!it.jaEnquadrou || !it.interagiu)) enquadrar(it.jaEnquadrou);
    it.idsAnteriores = ids;

    // ponto escolhido fora da lista (ou fora da vista): traz para dentro, sem mexer se já está visível
    if (selecionado && selecionado !== it.selecionadoAnterior) {
      const m = it.marcadores.get(selecionado);
      if (m && !it.mapa.getBounds().pad(-0.12).contains(m.marker.getLatLng())) it.mapa.panTo(m.marker.getLatLng());
    }
    it.selecionadoAnterior = selecionado;
  }, [pontos, selecionado]);

  const indisponiveis = pontos.filter((p) => situacaoDe(p) === 'fora').length;

  return (
    <div ref={raiz} className={`mr${compacto ? ' mr-compacto' : ''}`} role="group" aria-label="Mapa dos pontos de recarga">
      <div className="mr-palco">
        <div ref={alvo} className="mr-mapa" />
        <button
          type="button"
          className="mr-enquadrar"
          onClick={() => { if (interno.current) interno.current.interagiu = false; enquadrar(true); }}
        >
          Ver todos
        </button>
        <div className="mr-dica-toque" aria-hidden="true">Use dois dedos para mexer no mapa</div>
      </div>

      <div className="mr-legenda meta">
        <span><span className="mr-ponto livre" />com vaga</span>
        <span><span className="mr-ponto cheio" />ocupado</span>
        {indisponiveis > 0 && <span><span className="mr-ponto fora" />indisponível</span>}
        <span className="mr-legenda-total">{plural(pontos.length, 'ponto', 'pontos')}</span>
      </div>
    </div>
  );
}
