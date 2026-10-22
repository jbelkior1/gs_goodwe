import type { FormatoFranquia, Regiao, SegmentoComercio } from '../types';

/**
 * Prospecção ativa: onde passa muito carro e ainda falta carregador. Lógica pura (sem React e sem
 * banco): recebe as vias com o fluxo de veículos, os carregadores que já existem (os pontos da rede e
 * os de terceiros) e os comércios candidatos, e devolve o mapa de calor e as oportunidades ordenadas.
 *
 * MVP: o fluxo das vias, os carregadores de terceiros e os candidatos são simulados
 * (domain/prospeccaoSimulada.ts). Os pontos da rede são os de verdade. Quando houver dado real
 * (contagens da CET, OpenChargeMap, CNPJ), só a origem muda: esta conta continua a mesma.
 *
 * Score de oportunidade (0 a 100) = fluxo × lacuna × densidade de EV:
 *   fluxo   = veículos/dia na via, até FLUXO_CHEIO (a partir daí conta como cheio)
 *   lacuna  = quanto falta de carregador por perto: 1 sem nenhum em RAIO_COBERTURA_M; cai com cada
 *             carregador mais perto (um na porta zera a lacuna)
 *   EV      = densidade de elétricos da região mais próxima (catálogo de regiões)
 * É um produto de propósito: muito fluxo com carregador na porta, ou lugar vazio, não é oportunidade.
 */

export interface Corredor {
  id: string;
  nome: string;
  /** veículos por dia, nos dois sentidos */
  fluxoDia: number;
  /** traçado aproximado da via: [lat, lng] */
  trajeto: [number, number][];
}

export interface CarregadorExistente {
  id: string;
  nome: string;
  lat: number;
  lng: number;
  /** ponto da rede Ponto W ou carregador de outra empresa */
  origem: 'rede' | 'terceiro';
}

export interface Candidato {
  id: string;
  /** descrição genérica do comércio ("Supermercado na Av. Rebouças") */
  nome: string;
  segmento: SegmentoComercio;
  corredorId: string;
  lat: number;
  lng: number;
  /** clientes por dia no comércio (estimativa usada na análise de viabilidade) */
  clientesDia: number;
}

export interface FatorOportunidade { rotulo: string; nota: number; texto: string }

export interface Oportunidade {
  candidato: Candidato;
  corredor: Corredor;
  regiao: Regiao;
  score: number;
  fatores: FatorOportunidade[];
  /** carregadores a até RAIO_COBERTURA_M */
  carregadoresPerto: number;
  /** o mais próximo (rede ou terceiro) e a distância em metros */
  maisProximo?: { carregador: CarregadorExistente; distanciaM: number };
  formatoSugerido: FormatoFranquia;
}

/** [lat, lng, peso 0–1] */
export type PontoDeCalor = [number, number, number];

export interface ResultadoProspeccao {
  calorFluxo: PontoDeCalor[];
  calorOportunidade: PontoDeCalor[];
  oportunidades: Oportunidade[];
  /** fração do fluxo amostrado que já tem carregador a até RAIO_COBERTURA_M */
  fluxoCoberto: number;
  /** trechos amostrados com lacuna alta e fluxo alto */
  areasQuentes: number;
}

export const RAIO_COBERTURA_M = 1500;
export const FLUXO_CHEIO = 150_000;
/** distância entre amostras ao longo da via (o calor é feito delas) */
const PASSO_M = 160;

/** distância em metros entre dois pontos (haversine) */
export function distanciaM(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** pontos a cada PASSO_M metros ao longo do traçado */
export function amostrarTrajeto(trajeto: [number, number][], passoM = PASSO_M): [number, number][] {
  const saida: [number, number][] = [];
  for (let i = 0; i < trajeto.length - 1; i++) {
    const a = trajeto[i];
    const b = trajeto[i + 1];
    const n = Math.max(1, Math.round(distanciaM(a, b) / passoM));
    for (let k = 0; k < n; k++) saida.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  if (trajeto.length) saida.push(trajeto[trajeto.length - 1]);
  return saida;
}

/**
 * Quanto falta de carregador perto deste lugar (0 a 1). Cada carregador a até RAIO_COBERTURA_M
 * cobre um pouco, mais quanto mais perto (linear); a soma é limitada a 1.
 */
export function lacunaEm(p: [number, number], carregadores: CarregadorExistente[]): number {
  let cobertura = 0;
  for (const c of carregadores) {
    const d = distanciaM(p, [c.lat, c.lng]);
    if (d < RAIO_COBERTURA_M) cobertura += 1 - d / RAIO_COBERTURA_M;
  }
  return Math.max(0, 1 - Math.min(1, cobertura));
}

export const notaFluxo = (fluxoDia: number) => Math.min(1, Math.max(0, fluxoDia / FLUXO_CHEIO));

/** o produto que vira o score (0 a 1): sem fluxo não há oportunidade; com carregador na porta, quase nenhuma */
const oportunidadeDe = (fluxo: number, lacuna: number, ev: number) => Math.sqrt(fluxo) * (0.15 + 0.85 * lacuna) * (0.55 + 0.45 * ev);

export function regiaoMaisProxima(p: [number, number], regioes: Regiao[]): Regiao {
  let melhor = regioes[0];
  let dMin = Infinity;
  for (const r of regioes) {
    const d = distanciaM(p, [r.lat, r.lng]);
    if (d < dMin) { dMin = d; melhor = r; }
  }
  return melhor;
}

const km = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);
const milCarros = (v: number) => `${Math.round(v / 1000)} mil carros por dia`;

/** Hub para quem tem fluxo de via expressa; Standard para o resto (a vistoria confirma a carga elétrica) */
const formatoPara = (fluxoDia: number, segmento: SegmentoComercio): FormatoFranquia =>
  fluxoDia >= 200_000 && (segmento === 'Posto' || segmento === 'Shopping' || segmento === 'Mercado') ? 'Hub' : 'Standard';

export function analisarProspeccao(entrada: {
  corredores: Corredor[];
  carregadores: CarregadorExistente[];
  candidatos: Candidato[];
  regioes: Regiao[];
}): ResultadoProspeccao {
  const { corredores, carregadores, candidatos, regioes } = entrada;

  // ---------------------------------------------------------------- mapa de calor (amostras das vias)
  const calorFluxo: PontoDeCalor[] = [];
  const calorOportunidade: PontoDeCalor[] = [];
  let fluxoTotal = 0;
  let fluxoComCarregador = 0;
  let areasQuentes = 0;
  // a densidade de EV muda pouco de um quarteirão para o outro: calcula uma vez por via
  for (const c of corredores) {
    const fluxo = notaFluxo(c.fluxoDia);
    const amostras = amostrarTrajeto(c.trajeto);
    const meio = c.trajeto[Math.floor(c.trajeto.length / 2)];
    const ev = regiaoMaisProxima(meio, regioes).densidadeEV;
    for (const p of amostras) {
      const lacuna = lacunaEm(p, carregadores);
      const op = oportunidadeDe(fluxo, lacuna, ev);
      calorFluxo.push([p[0], p[1], fluxo]);
      calorOportunidade.push([p[0], p[1], Math.min(1, op)]);
      fluxoTotal += c.fluxoDia;
      if (lacuna < 0.5) fluxoComCarregador += c.fluxoDia;
      if (op >= 0.55) areasQuentes++;
    }
  }

  // ---------------------------------------------------------------- oportunidades (um comércio por linha)
  const porId = new Map(corredores.map((c) => [c.id, c]));
  const oportunidades: Oportunidade[] = [];
  for (const cand of candidatos) {
    const corredor = porId.get(cand.corredorId);
    if (!corredor) continue;
    const p: [number, number] = [cand.lat, cand.lng];
    const regiao = regiaoMaisProxima(p, regioes);
    const fluxo = notaFluxo(corredor.fluxoDia);
    const lacuna = lacunaEm(p, carregadores);
    let maisProximo: Oportunidade['maisProximo'];
    let perto = 0;
    for (const c of carregadores) {
      const d = distanciaM(p, [c.lat, c.lng]);
      if (d < RAIO_COBERTURA_M) perto++;
      if (!maisProximo || d < maisProximo.distanciaM) maisProximo = { carregador: c, distanciaM: d };
    }
    const score = Math.round(Math.min(1, oportunidadeDe(fluxo, lacuna, regiao.densidadeEV)) * 100);
    const fatores: FatorOportunidade[] = [
      { rotulo: 'Fluxo de carros', nota: fluxo, texto: `${milCarros(corredor.fluxoDia)} na ${corredor.nome}` },
      {
        rotulo: 'Falta de carregador', nota: lacuna,
        texto: perto === 0
          ? `nenhum carregador a menos de ${km(RAIO_COBERTURA_M)}${maisProximo ? ` (o mais perto está a ${km(maisProximo.distanciaM)})` : ''}`
          : `${perto} ${perto === 1 ? 'carregador' : 'carregadores'} a menos de ${km(RAIO_COBERTURA_M)}; o mais perto a ${km(maisProximo!.distanciaM)}`,
      },
      { rotulo: 'Elétricos na região', nota: regiao.densidadeEV, texto: `densidade de EV ${regiao.densidadeEV.toFixed(2).replace('.', ',')} em ${regiao.zona}` },
    ];
    oportunidades.push({
      candidato: cand, corredor, regiao, score, fatores, carregadoresPerto: perto, maisProximo,
      formatoSugerido: formatoPara(corredor.fluxoDia, cand.segmento),
    });
  }
  oportunidades.sort((a, b) => b.score - a.score || b.corredor.fluxoDia - a.corredor.fluxoDia);

  return {
    calorFluxo, calorOportunidade, oportunidades,
    fluxoCoberto: fluxoTotal ? fluxoComCarregador / fluxoTotal : 0,
    areasQuentes,
  };
}
