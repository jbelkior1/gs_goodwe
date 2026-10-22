import * as L from 'leaflet';

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

export function adicionarBlocos(mapa: L.Map): string {
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
