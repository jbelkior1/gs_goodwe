import { PRNG, NOMES } from './prng';
import {
  FORMATOS,
  MODELOS_CARREGADOR,
  REGIOES,
  VEICULOS,
} from './catalogo';
import { calcularTarifa, cent, repartir, sugerirPrecoBase } from './engine/tarifa';
import { diaSemanaLocal, fimDeSemana, horaLocal } from './tempo';
import { analisarViabilidade } from './engine/ia';
import type {
  Carregador,
  Cobranca,
  FormatoFranquia,
  Franqueado,
  Motorista,
  Ponto,
  Sessao,
  SegmentoComercio,
  SolicitacaoHomologacao,
  AmostraTelemetria,
} from './types';

/**
 * BASE DE DEMONSTRAÇÃO do Ponto W.
 *
 * Uma rede de 10 unidades em São Paulo (marcas de varejo, cada uma com o seu franqueado) e 90
 * dias de histórico de recarga até agora, com dados coerentes entre si: a energia bate com a
 * potência e o tempo, o preço vem do mesmo motor de tarifa do app, o SoC final bate com a energia
 * entregue e a capacidade do carro, e as cobranças são repartidas pelo motor (royalty, fundo,
 * gateway). O volume de cada hora segue o perfil do tipo de comércio (mercado no fim da tarde,
 * academia de manhã cedo e à noite, café de manhã...).
 *
 * É determinística em tudo, menos na janela de tempo: a semente é fixa e o histórico termina na
 * hora cheia mais recente, então o painel não muda a cada F5.
 *
 * O `scripts/seed-supabase.ts` grava esta mesma base no banco. Sem banco, o app usa esta base
 * direto (modo local). Quando a integração real existir (Modbus + SEMS+), esta camada some sem
 * que a interface precise mudar.
 */

export interface BaseDados {
  franqueados: Franqueado[];
  pontos: Ponto[];
  carregadores: Carregador[];
  motoristas: Motorista[];
  sessoes: Sessao[];
  telemetria: AmostraTelemetria[];
  cobrancas: Cobranca[];
  homologacoes: SolicitacaoHomologacao[];
  geradoEm: string;
}

const DIAS_HISTORICO = 90;
const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;

/** o ponto da apresentação, que a conta de franqueado de demonstração opera (a 11ª unidade: FIAP Aclimação) */
export const PONTO_FRANQUEADO_DEMO = 'p-011';

// ---------------------------------------------------------------- perfis de uso
type PerfilUso = 'estrada' | 'mercado' | 'hiper' | 'shopping' | 'farmacia' | 'academia' | 'cafe' | 'restaurante';

interface PerfilHorario {
  /** peso de cada hora do dia (0 a 23, hora de Brasília): a forma da curva, não o volume */
  hora: readonly number[];
  /** multiplicador de cada dia da semana (0 = domingo) */
  semana: readonly number[];
  /** duração média de uma recarga, em horas */
  duracaoH: number;
}

const PERFIS: Record<PerfilUso, PerfilHorario> = {
  // restaurante e posto de estrada: o dia todo, com mais gente na sexta, no sábado e no domingo
  estrada: {
    hora: [0.08, 0.08, 0.08, 0.08, 0.08, 0.1, 0.2, 0.45, 0.65, 0.75, 0.8, 0.9, 1, 0.95, 0.85, 0.85, 0.9, 0.95, 0.9, 0.8, 0.6, 0.4, 0.25, 0.12],
    semana: [1.2, 0.9, 0.85, 0.9, 1, 1.25, 1.3],
    duracaoH: 0.95,
  },
  // mercado: fim da tarde e fim de semana
  mercado: {
    hora: [0, 0, 0, 0, 0, 0, 0.05, 0.12, 0.25, 0.4, 0.55, 0.6, 0.65, 0.55, 0.55, 0.65, 0.85, 1, 1, 0.9, 0.6, 0.25, 0.05, 0],
    semana: [1, 0.95, 0.9, 0.95, 1, 1.1, 1.3],
    duracaoH: 1.1,
  },
  // hipermercado: compra grande, fica mais; sábado é o dia forte
  hiper: {
    hora: [0, 0, 0, 0, 0, 0, 0, 0.05, 0.2, 0.4, 0.65, 0.8, 0.8, 0.7, 0.7, 0.8, 0.95, 1, 0.95, 0.8, 0.5, 0.2, 0.04, 0],
    semana: [1.25, 0.85, 0.85, 0.9, 0.95, 1.1, 1.4],
    duracaoH: 1.4,
  },
  // shopping: tarde e noite, fim de semana
  shopping: {
    hora: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.2, 0.4, 0.6, 0.65, 0.7, 0.8, 0.9, 1, 1, 0.95, 0.85, 0.6, 0.2, 0],
    semana: [1.3, 0.8, 0.8, 0.85, 0.9, 1.05, 1.4],
    duracaoH: 1.8,
  },
  // farmácia: horário comercial, parada curta
  farmacia: {
    hora: [0, 0, 0, 0, 0, 0, 0, 0.15, 0.4, 0.65, 0.8, 0.85, 0.9, 0.75, 0.7, 0.75, 0.8, 0.9, 1, 0.8, 0.4, 0.2, 0.05, 0],
    semana: [0.55, 1, 1, 1, 1, 1, 0.8],
    duracaoH: 0.65,
  },
  // academia: manhã cedo e fim do dia
  academia: {
    hora: [0, 0, 0, 0, 0, 0.25, 0.9, 1, 0.7, 0.45, 0.3, 0.2, 0.3, 0.25, 0.15, 0.2, 0.35, 0.7, 1, 1, 0.8, 0.4, 0.1, 0],
    semana: [0.5, 1.1, 1.05, 1.05, 1, 0.9, 0.7],
    duracaoH: 1.3,
  },
  // café: manhã, parada curta, quase nada no fim de semana (ponto de escritório)
  cafe: {
    hora: [0, 0, 0, 0, 0, 0, 0.3, 0.8, 1, 0.9, 0.6, 0.45, 0.5, 0.45, 0.4, 0.5, 0.45, 0.35, 0.2, 0.1, 0.05, 0, 0, 0],
    semana: [0.3, 1.1, 1.15, 1.15, 1.1, 1, 0.45],
    duracaoH: 0.7,
  },
  // restaurante: almoço e jantar, mais forte no fim de semana
  restaurante: {
    hora: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.25, 0.8, 1, 0.6, 0.15, 0.1, 0.2, 0.45, 0.85, 1, 0.9, 0.45, 0.1],
    semana: [1.3, 0.75, 0.8, 0.85, 0.95, 1.2, 1.4],
    duracaoH: 1.4,
  },
};

const SOMA_HORAS = Object.fromEntries(
  Object.entries(PERFIS).map(([k, p]) => [k, p.hora.reduce((t, v) => t + v, 0)]),
) as Record<PerfilUso, number>;

// ---------------------------------------------------------------- as 10 unidades
interface UnidadeDemo {
  nome: string;
  /** responsável pela unidade (o franqueado) e a empresa que opera o ponto */
  responsavel: string;
  razaoSocial: string;
  regiaoId: string;
  /** avenida e bairro, sem número de loja */
  endereco: string;
  lat: number;
  lng: number;
  segmento: SegmentoComercio;
  formato: FormatoFranquia;
  perfil: PerfilUso;
  /** diferença, em R$/kWh, sobre o preço base sugerido da região */
  ajustePreco: number;
  /** carga do próprio comércio no pico (kW) e folga da entrada elétrica sobre (vagas + comércio) */
  cargaBaseKW: number;
  folga: number;
  solar?: { kWp: number; bateriaKWh?: number };
  /** recargas por vaga por dia, na média do período */
  uso: number;
  inauguradoHaDias: number;
}

const UNIDADES: UnidadeDemo[] = [
  {
    nome: 'Graal Anhanguera', responsavel: NOMES[29], razaoSocial: 'Graal Anhanguera Alimentos LTDA',
    regiaoId: 'r-sp-anhanguera', endereco: 'Rod. Anhanguera, Perus — São Paulo/SP', lat: -23.3968, lng: -46.7742,
    segmento: 'Posto', formato: 'Hub', perfil: 'estrada', ajustePreco: 0.15,
    cargaBaseKW: 36, folga: 1.08, solar: { kWp: 62, bateriaKWh: 30 }, uso: 3.0, inauguradoHaDias: 410,
  },
  {
    nome: 'Pão de Açúcar Moema', responsavel: NOMES[28], razaoSocial: 'Pão de Açúcar Moema Varejo LTDA',
    regiaoId: 'r-sp-moema', endereco: 'Av. Ibirapuera, Moema — São Paulo/SP', lat: -23.6058, lng: -46.6652,
    segmento: 'Mercado', formato: 'Standard', perfil: 'mercado', ajustePreco: 0.05,
    cargaBaseKW: 20, folga: 0.95, solar: { kWp: 36, bateriaKWh: 20 }, uso: 2.9, inauguradoHaDias: 330,
  },
  {
    nome: 'Pão de Açúcar Higienópolis', responsavel: NOMES[27], razaoSocial: 'Pão de Açúcar Higienópolis Varejo LTDA',
    regiaoId: 'r-sp-higienopolis', endereco: 'Av. Angélica, Higienópolis — São Paulo/SP', lat: -23.5452, lng: -46.6575,
    segmento: 'Mercado', formato: 'Standard', perfil: 'mercado', ajustePreco: 0.05,
    cargaBaseKW: 24, folga: 1.1, uso: 2.7, inauguradoHaDias: 250,
  },
  {
    nome: 'Carrefour Marginal Pinheiros', responsavel: NOMES[26], razaoSocial: 'Carrefour Pinheiros Hipermercados LTDA',
    regiaoId: 'r-sp-pinheiros', endereco: 'Av. das Nações Unidas (Marginal Pinheiros), Pinheiros — São Paulo/SP', lat: -23.5818, lng: -46.6928,
    segmento: 'Mercado', formato: 'Hub', perfil: 'hiper', ajustePreco: -0.05,
    cargaBaseKW: 58, folga: 1.1, solar: { kWp: 96, bateriaKWh: 40 }, uso: 2.8, inauguradoHaDias: 380,
  },
  {
    nome: 'Carrefour Tatuapé', responsavel: NOMES[25], razaoSocial: 'Carrefour Tatuapé Hipermercados LTDA',
    regiaoId: 'r-sp-tatuape', endereco: 'Av. Salim Farah Maluf, Tatuapé — São Paulo/SP', lat: -23.5446, lng: -46.5719,
    segmento: 'Mercado', formato: 'Hub', perfil: 'hiper', ajustePreco: -0.1,
    cargaBaseKW: 52, folga: 1.05, uso: 2.5, inauguradoHaDias: 210,
  },
  {
    nome: 'Shopping Eldorado', responsavel: NOMES[24], razaoSocial: 'Eldorado Administração de Shopping LTDA',
    regiaoId: 'r-sp-pinheiros', endereco: 'Av. Rebouças, Pinheiros — São Paulo/SP', lat: -23.5726, lng: -46.696,
    segmento: 'Shopping', formato: 'Hub', perfil: 'shopping', ajustePreco: 0.05,
    cargaBaseKW: 70, folga: 1.15, uso: 2.3, inauguradoHaDias: 300,
  },
  {
    nome: 'Drogasil Paulista', responsavel: NOMES[23], razaoSocial: 'Drogasil Paulista Drogarias LTDA',
    regiaoId: 'r-sp-paulista', endereco: 'Av. Paulista, Bela Vista — São Paulo/SP', lat: -23.5632, lng: -46.6537,
    segmento: 'Farmácia', formato: 'Light', perfil: 'farmacia', ajustePreco: 0,
    cargaBaseKW: 7.5, folga: 1.2, uso: 5.2, inauguradoHaDias: 150,
  },
  {
    nome: 'Smart Fit Vila Mariana', responsavel: NOMES[22], razaoSocial: 'Smart Fit Vila Mariana Academias LTDA',
    regiaoId: 'r-sp-vila-mariana', endereco: 'R. Domingos de Morais, Vila Mariana — São Paulo/SP', lat: -23.5902, lng: -46.6395,
    segmento: 'Loja de rua', formato: 'Standard', perfil: 'academia', ajustePreco: -0.05,
    cargaBaseKW: 22, folga: 1.1, uso: 2.6, inauguradoHaDias: 190,
  },
  {
    nome: 'Outback Morumbi', responsavel: NOMES[21], razaoSocial: 'Outback Morumbi Restaurantes LTDA',
    regiaoId: 'r-sp-morumbi', endereco: 'Av. Giovanni Gronchi, Morumbi — São Paulo/SP', lat: -23.6018, lng: -46.7165,
    segmento: 'Café / Restaurante', formato: 'Standard', perfil: 'restaurante', ajustePreco: 0.1,
    cargaBaseKW: 18, folga: 1.1, solar: { kWp: 30 }, uso: 2.5, inauguradoHaDias: 270,
  },
  {
    nome: 'Starbucks Faria Lima', responsavel: NOMES[20], razaoSocial: 'Starbucks Faria Lima Cafés LTDA',
    regiaoId: 'r-sp-itaim', endereco: 'Av. Brigadeiro Faria Lima, Itaim Bibi — São Paulo/SP', lat: -23.5868, lng: -46.6822,
    segmento: 'Café / Restaurante', formato: 'Light', perfil: 'cafe', ajustePreco: 0.1,
    cargaBaseKW: 9, folga: 1.25, uso: 5.6, inauguradoHaDias: 130,
  },
  // o ponto da apresentação: no preço sugerido da região, com sol e bateria GoodWe; aulas de manhã e à noite
  {
    nome: 'FIAP Aclimação', responsavel: NOMES[19], razaoSocial: 'FIAP Aclimação Ensino LTDA',
    regiaoId: 'r-sp-vila-mariana', endereco: 'Av. Lins de Vasconcelos, Aclimação — São Paulo/SP', lat: -23.5736, lng: -46.6232,
    segmento: 'Loja de rua', formato: 'Standard', perfil: 'academia', ajustePreco: 0,
    cargaBaseKW: 30, folga: 1.1, solar: { kWp: 40, bateriaKWh: 20 }, uso: 2.8, inauguradoHaDias: 120,
  },
];

// ---------------------------------------------------------------- utilidades
function cnpj(r: PRNG): string {
  const n = (d: number) => Array.from({ length: d }, () => r.int(0, 9)).join('');
  return `${n(2)}.${n(3)}.${n(3)}/0001-${n(2)}`;
}

const iso = (d: Date | number): string => new Date(d).toISOString();

/** chegadas por hora: contagem de Poisson (algoritmo de Knuth, boa para médias baixas) */
function poisson(r: PRNG, lambda: number): number {
  if (lambda <= 0) return 0;
  const limite = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= r.next();
  } while (p > limite);
  return k - 1;
}

interface Chegada {
  ponto: Ponto;
  inicio: number;
}

export function gerarBase(seed = 20260819): BaseDados {
  const r = new PRNG(seed);
  const agora = new Date();
  const agoraMs = agora.getTime();
  // datas de cadastro e a janela do histórico partem da hora cheia, para a base não mudar a cada F5
  const ancora = Math.floor(agoraMs / HORA_MS) * HORA_MS;

  // ------------------------------------------------------------ franqueados, pontos, carregadores
  const franqueados: Franqueado[] = [];
  const pontos: Ponto[] = [];
  const carregadores: Carregador[] = [];
  const unidadeDoPonto = new Map<string, UnidadeDemo>();

  UNIDADES.forEach((u, i) => {
    const regiao = REGIOES.find((x) => x.id === u.regiaoId)!;
    const cfg = FORMATOS[u.formato];
    const potenciaModelo = MODELOS_CARREGADOR[cfg.modelo].potenciaKW;
    const inauguradoEm = ancora - u.inauguradoHaDias * DIA_MS;

    const franqueado: Franqueado = {
      id: `f-${String(i + 1).padStart(3, '0')}`,
      nome: u.responsavel,
      razaoSocial: u.razaoSocial,
      cnpj: cnpj(r),
      desde: iso(inauguradoEm - r.int(20, 60) * DIA_MS),
    };
    franqueados.push(franqueado);

    // entrada elétrica: cobre as vagas e a carga do comércio, com a folga própria da unidade
    const limitePotenciaKW = Number(((cfg.carregadores * potenciaModelo + u.cargaBaseKW) * u.folga).toFixed(1));

    const ponto: Ponto = {
      id: `p-${String(i + 1).padStart(3, '0')}`,
      nome: u.nome,
      franqueadoId: franqueado.id,
      regiaoId: regiao.id,
      endereco: u.endereco,
      formato: u.formato,
      segmento: u.segmento,
      limiteCorrenteA: Math.round((limitePotenciaKW * 1000) / 220),
      limitePotenciaKW,
      cargaBaseKW: u.cargaBaseKW,
      precoBaseKWh: cent(sugerirPrecoBase(regiao) + u.ajustePreco),
      ativo: true,
      status: 'ATIVO',
      temSolar: !!u.solar,
      potenciaFVkWp: u.solar?.kWp ?? 0,
      temBateria: !!u.solar?.bateriaKWh,
      capacidadeBateriaKWh: u.solar?.bateriaKWh ?? 0,
      inauguradoEm: iso(inauguradoEm),
      lat: u.lat,
      lng: u.lng,
      demo: true,
    };
    pontos.push(ponto);
    unidadeDoPonto.set(ponto.id, u);

    for (let c = 0; c < cfg.carregadores; c++) {
      carregadores.push({
        id: `${ponto.id}-c${c + 1}`,
        pontoId: ponto.id,
        apelido: `Vaga ${c + 1}`,
        modelo: cfg.modelo,
        estado: 'DISPONIVEL',
        potenciaPermitidaKW: potenciaModelo,
        firmware: `HCA-G2 v${r.int(2, 4)}.${r.int(0, 9)}.${r.int(0, 9)}`,
        ultimoHeartbeat: iso(agoraMs - r.int(0, 4) * 60000),
      });
    }
  });

  // ------------------------------------------------------------ motoristas de demonstração
  const motoristas: Motorista[] = NOMES.slice(0, 14).map((nome, i) => ({
    id: `m-${String(i + 1).padStart(3, '0')}`,
    nome,
    email: `${nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(' ')[0]}.${i}@email.com`,
    rfidUid: Array.from({ length: 8 }, () => '0123456789ABCDEF'[r.int(0, 15)]).join(''),
    veiculoId: r.pick(VEICULOS).id,
    desde: iso(ancora - r.int(30, 400) * DIA_MS),
  }));

  // ------------------------------------------------------------ histórico, hora a hora até agora
  // Em cada hora, cada ponto recebe um número de chegadas (Poisson) proporcional ao seu volume, ao
  // perfil de horário do comércio, ao dia da semana e ao crescimento da rede. A recarga entra numa
  // vaga que esteja livre naquele instante; sem vaga livre, o carro vai embora (demanda perdida).
  // Recarga que ainda não terminou vira sessão ao vivo (CARREGANDO), sem cobrança.
  const sessoes: Sessao[] = [];
  const cobrancas: Cobranca[] = [];
  const telemetria: AmostraTelemetria[] = [];
  let seqSessao = 0;

  const vagasDoPonto = new Map(pontos.map((p) => [p.id, carregadores.filter((c) => c.pontoId === p.id)]));
  const livreAte = new Map(carregadores.map((c) => [c.id, 0]));
  const regiaoDoPonto = new Map(pontos.map((p) => [p.id, REGIOES.find((x) => x.id === p.regiaoId)!]));

  const inicioJanela = ancora - DIAS_HISTORICO * DIA_MS;

  for (let t0 = inicioJanela; t0 < agoraMs; t0 += HORA_MS) {
    const hora = horaLocal(t0);
    const dia = diaSemanaLocal(t0);
    // a frota cresce ao longo do tempo (mercado em expansão)
    const crescimento = 0.72 + ((t0 - inicioJanela) / (DIAS_HISTORICO * DIA_MS)) * 0.38;
    const noBloco = Math.min(HORA_MS, agoraMs - t0);

    const chegadas: Chegada[] = [];
    for (const ponto of pontos) {
      const u = unidadeDoPonto.get(ponto.id)!;
      const perfil = PERFIS[u.perfil];
      const vagas = FORMATOS[ponto.formato].carregadores;
      const porDia = vagas * u.uso * perfil.semana[dia] * crescimento;
      const lambda = porDia * (perfil.hora[hora] / SOMA_HORAS[u.perfil]) * (noBloco / HORA_MS);
      const n = poisson(r, lambda);
      for (let k = 0; k < n; k++) chegadas.push({ ponto, inicio: t0 + Math.floor(r.float(0, noBloco)) });
    }
    chegadas.sort((a, b) => a.inicio - b.inicio);

    for (const { ponto, inicio } of chegadas) {
      const u = unidadeDoPonto.get(ponto.id)!;
      const perfil = PERFIS[u.perfil];
      const cfg = FORMATOS[ponto.formato];
      const regiao = regiaoDoPonto.get(ponto.id)!;
      const doPonto = vagasDoPonto.get(ponto.id)!;

      const livres = doPonto.filter((c) => livreAte.get(c.id)! <= inicio);
      if (!livres.length) continue;
      const carregador = r.pick(livres);
      const modelo = MODELOS_CARREGADOR[carregador.modelo];
      const ocupadasPorOutros = doPonto.length - livres.length;

      const motorista = r.pick(motoristas);
      const veiculo = VEICULOS.find((v) => v.id === motorista.veiculoId)!;

      const socInicial = Math.round(r.normal(38, 16, 8, 82));
      const potenciaEfetiva = Math.min(modelo.potenciaKW, veiculo.potenciaMaxACkW) * r.float(0.88, 0.97);
      const duracaoH = Number(r.normal(perfil.duracaoH, 0.4, 0.3, 3.6).toFixed(2));
      const fimMs = inicio + Math.round(duracaoH * HORA_MS);

      // recarga que ainda não terminou: sessão ao vivo, com a energia entregue até agora
      const aoVivo = fimMs > agoraMs - 60_000;
      const decorridoH = aoVivo ? (agoraMs - inicio) / HORA_MS : duracaoH;
      if (aoVivo && decorridoH < 2 / 60) continue;

      // preço da época pelo mesmo motor do app: hora e dia de Brasília; ocupação = carros no ponto + este
      const tarifa = calcularTarifa(ponto, regiao, horaLocal(inicio), Math.min(1, (ocupadasPorOutros + 1) / cfg.carregadores), {
        fimDeSemana: fimDeSemana(inicio), vagasOperantes: cfg.carregadores,
      }).precoFinalKWh;

      const capacidadeRestante = veiculo.capacidadeKWh * ((100 - socInicial) / 100);
      const energiaKWh = Number(Math.min(potenciaEfetiva * decorridoH, capacidadeRestante * 0.97).toFixed(2));
      const socAtual = Math.min(aoVivo ? 99 : 100, Math.round(socInicial + (energiaKWh / veiculo.capacidadeKWh) * 100));

      seqSessao++;
      livreAte.set(carregador.id, fimMs);
      const custo = cent(energiaKWh * tarifa);

      const sessao: Sessao = {
        id: `s-${String(seqSessao).padStart(6, '0')}`,
        pontoId: ponto.id,
        carregadorId: carregador.id,
        motoristaId: motorista.id,
        veiculoId: veiculo.id,
        inicio: iso(inicio),
        ...(aoVivo ? {} : { fim: iso(fimMs) }),
        socInicial,
        socAtual,
        energiaKWh,
        potenciaAtualKW: aoVivo ? Number(potenciaEfetiva.toFixed(2)) : 0,
        estado: aoVivo ? 'CARREGANDO' : 'FATURADO',
        autorizacao: aoVivo
          ? (r.chance(0.6) ? 'RFID' : 'APP')
          : (r.chance(0.55) ? 'RFID' : r.chance(0.7) ? 'APP' : 'QR'),
        tarifaAplicadaKWh: tarifa,
        custoAcumulado: custo,
      };
      sessoes.push(sessao);

      if (aoVivo) {
        carregador.estado = 'OCUPADO';

        // telemetria dos últimos minutos (1 amostra por minuto)
        const minutosDecorridos = Math.round(decorridoH * 60);
        const amostras = Math.min(minutosDecorridos, 60);
        for (let m = amostras; m >= 0; m--) {
          const ts = agoraMs - m * 60000;
          const decorrido = Math.max(0, (ts - inicio) / HORA_MS);
          const energiaAcum = Number((potenciaEfetiva * decorrido).toFixed(3));
          const socNoMomento = Math.min(99, socInicial + (energiaAcum / veiculo.capacidadeKWh) * 100);
          // acima de 80% a corrente cai (curva CC/CV)
          const fatorCV = socNoMomento > 80 ? Math.max(0.12, 1 - ((socNoMomento - 80) / 20) * 0.88) : 1;
          const pot = potenciaEfetiva * fatorCV * r.float(0.97, 1.03);
          const tensao = modelo.fases === 1 ? r.float(218, 224) : r.float(376, 384);
          telemetria.push({
            ts: iso(ts),
            sessaoId: sessao.id,
            tensaoV: Number(tensao.toFixed(1)),
            correnteA: Number(((pot * 1000) / tensao / (modelo.fases === 1 ? 1 : 1.732)).toFixed(1)),
            potenciaKW: Number(pot.toFixed(2)),
            soc: Number(socNoMomento.toFixed(1)),
            energiaAcumKWh: energiaAcum,
          });
        }
        continue;
      }

      const rep = repartir(custo, energiaKWh, regiao.custoEnergiaKWh);
      const falhou = r.chance(0.02);
      cobrancas.push({
        id: `cb-${String(seqSessao).padStart(6, '0')}`,
        sessaoId: sessao.id,
        pontoId: ponto.id,
        valor: custo,
        metodo: 'PIX',
        status: falhou ? 'FALHOU' : 'PAGO',
        txid: `PONTOW${String(seqSessao).padStart(10, '0')}`,
        criadaEm: iso(fimMs),
        pagaEm: falhou ? undefined : iso(fimMs + r.int(4, 90) * 1000),
        custoEnergia: rep.custoEnergia,
        royaltyGoodWe: rep.royaltyGoodWe,
        fundoMarketing: rep.fundoMarketing,
        gateway: rep.gateway,
        liquidoLojista: rep.liquidoLojista,
      });
    }
  }

  // ------------------------------------------------------------ homologações (pedidos de franquia em São Paulo)
  const pedidos: Array<{
    comercio: string; regiaoId: string; segmento: SegmentoComercio; formato: FormatoFranquia;
    carga: number; fluxo: number; status: SolicitacaoHomologacao['status']; haDias: number;
  }> = [
    { comercio: 'Empório Santa Cecília', regiaoId: 'r-sp-higienopolis', segmento: 'Café / Restaurante', formato: 'Light', carga: 22, fluxo: 640, status: 'ANALISE', haDias: 2 },
    { comercio: 'Drogaria Santana Norte', regiaoId: 'r-sp-santana', segmento: 'Farmácia', formato: 'Light', carga: 18, fluxo: 900, status: 'VISTORIA', haDias: 6 },
    { comercio: 'Clínica Vila Mariana Saúde', regiaoId: 'r-sp-vila-mariana', segmento: 'Clínica', formato: 'Standard', carga: 34, fluxo: 380, status: 'PENDENTE_DOC', haDias: 11 },
    { comercio: 'Padaria Real Itaim', regiaoId: 'r-sp-itaim', segmento: 'Café / Restaurante', formato: 'Standard', carga: 14, fluxo: 700, status: 'REPROVADO', haDias: 19 },
    { comercio: 'Auto Posto Cajamar Norte', regiaoId: 'r-sp-anhanguera', segmento: 'Posto', formato: 'Hub', carga: 64, fluxo: 1200, status: 'ANALISE', haDias: 1 },
  ];

  const homologacoes: SolicitacaoHomologacao[] = pedidos.map((p, i) => {
    const regiao = REGIOES.find((x) => x.id === p.regiaoId)!;
    const analise = analisarViabilidade(
      { fluxoDiarioPessoas: p.fluxo, cargaDisponivelKW: p.carga, formatoDesejado: p.formato, segmento: p.segmento },
      regiao,
    );
    return {
      id: `h-${String(i + 1).padStart(3, '0')}`,
      comercio: p.comercio,
      cnpj: cnpj(r),
      regiaoId: regiao.id,
      segmento: p.segmento,
      formatoDesejado: p.formato,
      cargaDisponivelKW: p.carga,
      fluxoDiarioPessoas: p.fluxo,
      status: p.status,
      criadoEm: iso(ancora - p.haDias * DIA_MS),
      scoreViabilidade: analise.score,
      horasUsoPrevistas: analise.horasUsoPrevistas,
      parecer: analise.parecer,
    };
  });

  return {
    franqueados,
    pontos,
    carregadores,
    motoristas,
    sessoes,
    telemetria,
    cobrancas,
    homologacoes,
    geradoEm: iso(agora),
  };
}
