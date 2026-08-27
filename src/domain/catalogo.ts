import type {
  ModeloCarregador,
  Regiao,
  TipoCarregador,
  Veiculo,
  FormatoFranquia,
  SegmentoComercio,
} from './types';

/**
 * Catálogo de referência — espelha a linha HCA G2 da GoodWe.
 * Fonte: briefing EV Challenge 2026 + ficha do GW7K-HCA-20.
 */
export const MODELOS_CARREGADOR: Record<TipoCarregador, ModeloCarregador> = {
  'GW7K-HCA-20': {
    id: 'GW7K-HCA-20',
    potenciaKW: 7,
    fases: 1,
    tensaoV: 220,
    correnteMaxA: 32,
    conector: 'Tipo 2 (IEC 62196-2)',
    protocolos: ['Modbus RTU (RS-485)', 'Wi-Fi', 'LAN', 'Bluetooth'],
    suportaOCPP: false,
  },
  'GW11K-HCA-20': {
    id: 'GW11K-HCA-20',
    potenciaKW: 11,
    fases: 3,
    tensaoV: 380,
    correnteMaxA: 16,
    conector: 'Tipo 2 (IEC 62196-2)',
    protocolos: ['Modbus RTU (RS-485)', 'Wi-Fi', 'LAN', 'Bluetooth'],
    suportaOCPP: false,
  },
  'GW22K-HCA-20': {
    id: 'GW22K-HCA-20',
    potenciaKW: 22,
    fases: 3,
    tensaoV: 380,
    correnteMaxA: 32,
    conector: 'Tipo 2 (IEC 62196-2)',
    protocolos: ['Modbus RTU (RS-485)', 'Wi-Fi', 'LAN', 'Bluetooth'],
    suportaOCPP: false,
  },
};

/** Regiões com tarifa de energia realista por distribuidora (R$/kWh com impostos). */
export const REGIOES: Regiao[] = [
  { id: 'r-sp-pinheiros', uf: 'SP', cidade: 'São Paulo', zona: 'Pinheiros', custoEnergiaKWh: 0.85, densidadeEV: 0.95, lat: -23.5646, lng: -46.696 },
  { id: 'r-sp-moema', uf: 'SP', cidade: 'São Paulo', zona: 'Moema', custoEnergiaKWh: 0.85, densidadeEV: 0.9, lat: -23.6021, lng: -46.6669 },
  { id: 'r-sp-tatuape', uf: 'SP', cidade: 'São Paulo', zona: 'Tatuapé', custoEnergiaKWh: 0.85, densidadeEV: 0.62, lat: -23.5405, lng: -46.5766 },
  { id: 'r-sp-campinas', uf: 'SP', cidade: 'Campinas', zona: 'Cambuí', custoEnergiaKWh: 0.82, densidadeEV: 0.7, lat: -22.8983, lng: -47.0498 },
  { id: 'r-rj-barra', uf: 'RJ', cidade: 'Rio de Janeiro', zona: 'Barra da Tijuca', custoEnergiaKWh: 1.12, densidadeEV: 0.78, lat: -23.0045, lng: -43.365 },
  { id: 'r-rj-botafogo', uf: 'RJ', cidade: 'Rio de Janeiro', zona: 'Botafogo', custoEnergiaKWh: 1.12, densidadeEV: 0.66, lat: -22.9519, lng: -43.1841 },
  { id: 'r-mg-savassi', uf: 'MG', cidade: 'Belo Horizonte', zona: 'Savassi', custoEnergiaKWh: 0.91, densidadeEV: 0.6, lat: -19.9386, lng: -43.9333 },
  { id: 'r-pr-batel', uf: 'PR', cidade: 'Curitiba', zona: 'Batel', custoEnergiaKWh: 0.78, densidadeEV: 0.64, lat: -25.4372, lng: -49.2879 },
  { id: 'r-sc-centro', uf: 'SC', cidade: 'Florianópolis', zona: 'Centro', custoEnergiaKWh: 0.76, densidadeEV: 0.58, lat: -27.5954, lng: -48.548 },
  { id: 'r-rs-moinhos', uf: 'RS', cidade: 'Porto Alegre', zona: 'Moinhos de Vento', custoEnergiaKWh: 0.74, densidadeEV: 0.55, lat: -30.0244, lng: -51.205 },
  { id: 'r-df-asa-sul', uf: 'DF', cidade: 'Brasília', zona: 'Asa Sul', custoEnergiaKWh: 0.83, densidadeEV: 0.72, lat: -15.8267, lng: -47.9021 },
  { id: 'r-ba-ondina', uf: 'BA', cidade: 'Salvador', zona: 'Ondina', custoEnergiaKWh: 0.94, densidadeEV: 0.4, lat: -13.0069, lng: -38.5069 },
  { id: 'r-pe-boaviagem', uf: 'PE', cidade: 'Recife', zona: 'Boa Viagem', custoEnergiaKWh: 0.89, densidadeEV: 0.42, lat: -8.129, lng: -34.9026 },
  { id: 'r-go-setor-bueno', uf: 'GO', cidade: 'Goiânia', zona: 'Setor Bueno', custoEnergiaKWh: 0.8, densidadeEV: 0.45, lat: -16.705, lng: -49.2703 },
];

/** Modelos elétricos com presença real no Brasil. */
export const VEICULOS: Veiculo[] = [
  { id: 'v-dolphin', montadora: 'BYD', modelo: 'Dolphin', capacidadeKWh: 44.9, potenciaMaxACkW: 7 },
  { id: 'v-dolphin-mini', montadora: 'BYD', modelo: 'Dolphin Mini', capacidadeKWh: 38, potenciaMaxACkW: 6.6 },
  { id: 'v-seal', montadora: 'BYD', modelo: 'Seal', capacidadeKWh: 82.5, potenciaMaxACkW: 11 },
  { id: 'v-song-plus', montadora: 'BYD', modelo: 'Song Plus', capacidadeKWh: 18.3, potenciaMaxACkW: 6.6 },
  { id: 'v-yuan-plus', montadora: 'BYD', modelo: 'Yuan Plus', capacidadeKWh: 60.5, potenciaMaxACkW: 7 },
  { id: 'v-zeekr-x', montadora: 'Zeekr', modelo: 'X', capacidadeKWh: 66, potenciaMaxACkW: 11 },
  { id: 'v-gwm-ora', montadora: 'GWM', modelo: 'Ora 03', capacidadeKWh: 48, potenciaMaxACkW: 6.6 },
  { id: 'v-volvo-ex30', montadora: 'Volvo', modelo: 'EX30', capacidadeKWh: 69, potenciaMaxACkW: 11 },
  { id: 'v-renault-kwid', montadora: 'Renault', modelo: 'Kwid E-Tech', capacidadeKWh: 26.8, potenciaMaxACkW: 6.6 },
  { id: 'v-fiat-500e', montadora: 'Fiat', modelo: '500e', capacidadeKWh: 42, potenciaMaxACkW: 11 },
  { id: 'v-tesla-m3', montadora: 'Tesla', modelo: 'Model 3', capacidadeKWh: 60, potenciaMaxACkW: 11 },
  { id: 'v-jeep-compass', montadora: 'Jeep', modelo: 'Compass 4xe', capacidadeKWh: 11.4, potenciaMaxACkW: 7.4 },
];

/** Configuração comercial de cada formato de franquia. */
export const FORMATOS: Record<
  FormatoFranquia,
  { carregadores: number; capex: number; taxaFranquia: number; modelo: TipoCarregador }
> = {
  Light: { carregadores: 1, capex: 20500, taxaFranquia: 8000, modelo: 'GW7K-HCA-20' },
  Standard: { carregadores: 2, capex: 37000, taxaFranquia: 14000, modelo: 'GW7K-HCA-20' },
  Hub: { carregadores: 4, capex: 78500, taxaFranquia: 24000, modelo: 'GW11K-HCA-20' },
};

export const SEGMENTOS: SegmentoComercio[] = [
  'Café / Restaurante',
  'Mercado',
  'Farmácia',
  'Shopping',
  'Posto',
  'Clínica',
  'Loja de rua',
];

/** Regras econômicas da franquia (mesmas premissas do documento do projeto). */
export const REGRAS = {
  royaltyPct: 0.06,
  fundoPct: 0.02,
  gatewayPct: 0.015,
  plataformaMes: 180,
  /** utilização mínima por carregador para a unidade se pagar (h/dia) */
  limiarViabilidadeHoras: 2.3,
  ticketVarejoIncremental: 28,
  margemVarejo: 0.35,
  conversaoLoja: 0.5,
} as const;

/**
 * Curva de demanda típica de recarga em comércio (0–23h), normalizada.
 * Picos no almoço e no fim da tarde — é o padrão que a IA aprende.
 */
export const CURVA_DEMANDA_HORA = [
  0.02, 0.01, 0.01, 0.01, 0.01, 0.02, 0.05, 0.12, 0.25, 0.38, 0.5, 0.68,
  0.82, 0.75, 0.6, 0.55, 0.62, 0.85, 1.0, 0.92, 0.7, 0.45, 0.22, 0.08,
];

/**
 * Geração solar típica ao longo do dia (0–23h), normalizada pelo pico.
 * O HCA G2 tem os modos "Prioridade Solar" e "FV + Bateria" — quando há
 * geração, a recarga puxa menos da rede e sobra mais potência na entrada.
 */
export const CURVA_SOLAR_HORA = [
  0, 0, 0, 0, 0, 0.02, 0.10, 0.26, 0.45, 0.64, 0.80, 0.93,
  1.0, 0.97, 0.88, 0.72, 0.53, 0.32, 0.14, 0.03, 0, 0, 0, 0,
];

/** Fator médio de emissão do SIN brasileiro (kg CO2 por kWh). */
export const FATOR_CO2_KG_KWH = 0.0385;
