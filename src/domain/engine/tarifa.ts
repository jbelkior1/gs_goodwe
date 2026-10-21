import type { Ponto, Regiao } from '../types';
import { REGRAS, TARIFA } from '../catalogo';
import { brl, delta, tarifaKWh } from '../formato';
import { geracaoSolarKW } from './solar';
import { cargaComercioNaHora } from './demanda';
import { fimDeSemana, horaLocal } from '../tempo';

/**
 * PILAR 3 — TARIFAÇÃO E PAGAMENTO (tarifa dinâmica v2, ADR-0013)
 *
 * A REN ANEEL 1.000/2021 permite preço livremente negociado na recarga
 * comercial. Isso torna legal (e necessário) precificar de forma dinâmica.
 * O preço é sempre mostrado ANTES de iniciar e travado na sessão.
 *
 *   preço = base × faixa de horário × (1 + escassez) − desconto do sol
 *   e depois limitado entre o piso e o teto do ponto.
 *
 * O custo de energia da região NÃO entra no preço: ele define só o piso (nunca vender
 * abaixo do custo + taxas + margem mínima) e o preço base sugerido.
 */

export type FaixaTarifa = 'VALE' | 'NORMAL' | 'PICO';

export interface ComposicaoTarifa {
  precoBaseKWh: number;
  fatorHorario: number;
  /** 1 + adicional de escassez (as últimas vagas ficam mais caras) */
  fatorOcupacao: number;
  /** legado: a energia da região não entra mais no preço; fica 1 */
  fatorEnergia: number;
  precoFinalKWh: number;
  /** custo efetivo da energia: o da região, menos o que o sol do ponto poupa */
  custoEnergiaKWh: number;
  /** margem líquida por kWh: preço × (1 − taxas) − custo efetivo */
  margemKWh: number;
  margemPct: number;
  explicacao: string[];
  /** faixa publicada da hora (vale/normal/pico) */
  faixa?: FaixaTarifa;
  /** próxima mudança de preço no dia, para o totem e o app avisarem antes */
  proxima?: { hora: number; precoKWh: number; faixa: FaixaTarifa };
  /** limites aplicados (nunca vende abaixo do custo; teto protege o motorista) */
  pisoKWh?: number;
  tetoKWh?: number;
  /** ponto que ainda não opera: preço só de prévia */
  previa?: boolean;
  /** adicional de escassez aplicado (0 a 0,08) */
  adicionalEscassez?: number;
  /** desconto do sol aplicado, em fração do preço (0 a 0,08) */
  descontoSolar?: number;
  /** o preço base cadastrado era inválido e o motor usou o sugerido da região */
  baseSubstituida?: boolean;
}

/** Quem pede o preço informa o contexto que o motor não enxerga sozinho. */
export interface ContextoTarifa {
  /** sábado ou domingo (sem pico). Padrão: dia útil */
  fimDeSemana?: boolean;
  /** vagas que operam agora (fora OFFLINE e MANUTENCAO). Sem esta informação não há escassez */
  vagasOperantes?: number;
  /** ponto que ainda não está ATIVO: o preço é só uma prévia */
  previa?: boolean;
}

// ---------------------------------------------------------------- arredondamento
/** Arredonda ao centavo, meio para cima (1,805 vira 1,81). O toPrecision tira o ruído do ponto flutuante. */
export function cent(v: number): number {
  const s = v < 0 ? -1 : 1;
  return (s * Math.round(Number((Math.abs(v) * 100).toPrecision(12)))) / 100;
}

/** Para cima, ao centavo (usado no piso: nunca fica abaixo do necessário). */
export function centAcima(v: number): number {
  return Math.ceil(Number((v * 100).toPrecision(12))) / 100;
}

/** Para baixo, ao centavo (usado no teto: nunca passa do limite). */
export function centAbaixo(v: number): number {
  return Math.floor(Number((v * 100).toPrecision(12))) / 100;
}

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** royalty + fundo + gateway: o que sai de cada real cobrado antes de chegar ao comércio */
export const TAXAS_PCT = Number((REGRAS.royaltyPct + REGRAS.fundoPct + REGRAS.gatewayPct).toFixed(6));

// ---------------------------------------------------------------- faixa de horário
/**
 * Multiplicador da hora (0 a 23, hora de Brasília).
 *  - dia útil: vale 22h a 8h (×0,90), normal (×1,00), pico 17h a 19h (×1,12);
 *  - fim de semana: sem pico;
 *  - as horas de borda (8h, 16h, 20h e 22h) são rampas no meio do caminho, para o preço
 *    nunca saltar mais de 10% de uma hora para a seguinte.
 */
export function faixaDaHora(hora: number, fds = false): { mult: number; faixa: FaixaTarifa; rampa: boolean } {
  const h = ((Math.trunc(hora) % 24) + 24) % 24;
  const { multVale, multNormal, multPico, picoIni, picoFim, valeIni, valeFim } = TARIFA;
  if (h >= valeIni || h <= valeFim) {
    if (h === valeIni || h === valeFim) return { mult: (multVale + multNormal) / 2, faixa: 'VALE', rampa: true };
    return { mult: multVale, faixa: 'VALE', rampa: false };
  }
  if (!fds) {
    if (h >= picoIni && h <= picoFim) return { mult: multPico, faixa: 'PICO', rampa: false };
    if (h === picoIni - 1 || h === picoFim + 1) return { mult: (multNormal + multPico) / 2, faixa: 'NORMAL', rampa: true };
  }
  return { mult: multNormal, faixa: 'NORMAL', rampa: false };
}

/** Fator por faixa horária: mais caro no pico, desconto no vale. Empurra demanda para fora do horário crítico. */
export function fatorHorario(hora: number, fds = false): number {
  return faixaDaHora(hora, fds).mult;
}

// ---------------------------------------------------------------- escassez
export interface OcupacaoPonto {
  /** 0 a 1: (vagas ocupadas por outros + 1 da própria sessão) / vagas operantes */
  ocupacao: number;
  vagasOperantes: number;
  /** vagas ocupadas, já contando a da própria sessão */
  vagasOcupadas: number;
}

export interface VagaMedida {
  id: string;
  estado: string;
  carro?: unknown;
}

/**
 * Ocupação do ponto para a escassez. Só contam vagas que operam (fora OFFLINE e MANUTENCAO).
 * Vaga ocupada = tem carro no cabo ou sessão em andamento (ABERTA, em carga ou concluída a pagar).
 * Quem está cotando entra na conta: `vagaPropriaId` é a vaga da sessão cotada (não conta duas vezes)
 * e, sem ela, entra como se o próprio motorista ocupasse mais uma vaga.
 */
export function medirOcupacao(
  vagas: VagaMedida[],
  temSessao: (vagaId: string) => boolean,
  vagaPropriaId?: string,
): OcupacaoPonto {
  const operantes = vagas.filter((v) => v.estado !== 'OFFLINE' && v.estado !== 'MANUTENCAO');
  const deOutros = operantes.filter(
    (v) => v.id !== vagaPropriaId && (!!v.carro || v.estado === 'OCUPADO' || temSessao(v.id)),
  ).length;
  const n = operantes.length;
  const ocupadas = Math.min(n, deOutros + 1);
  return { ocupacao: n ? Math.min(1, (deOutros + 1) / n) : 0, vagasOperantes: n, vagasOcupadas: ocupadas };
}

/** Adicional de escassez (0 a 0,08): zero até metade ocupado e em ponto com menos de 2 vagas operantes. */
export function adicionalEscassez(ocupacao: number, vagasOperantes: number): number {
  if (vagasOperantes < TARIFA.escassezMinVagas) return 0;
  const t = limitar((ocupacao - TARIFA.escassezAPartirDe) / (1 - TARIFA.escassezAPartirDe), 0, 1);
  return TARIFA.escassezMax * t;
}

/** Quanto mais cheio o ponto, mais valiosa a vaga: 1 + adicional de escassez. */
export function fatorOcupacao(ocupacao: number, vagasOperantes = 0): number {
  return 1 + adicionalEscassez(ocupacao, vagasOperantes);
}

// ---------------------------------------------------------------- sol
/**
 * Quanto do carregamento o excedente do sol cobre (0 a 1), pela média de uma janela de horas
 * centrada na atual (TARIFA.solarJanelaHoras). A média impede o desconto de aparecer e sumir de
 * uma hora para outra, que somaria ao degrau do horário. Excedente = geração solar − carga do comércio.
 */
export function coberturaSolar(ponto: Ponto, hora: number): number {
  if (!ponto.temSolar || !(ponto.potenciaFVkWp > 0)) return 0;
  const meia = Math.floor(TARIFA.solarJanelaHoras / 2);
  let soma = 0;
  for (let d = -meia; d <= meia; d++) {
    const h = (((Math.trunc(hora) + d) % 24) + 24) % 24;
    const excedente = geracaoSolarKW(ponto, h) - cargaComercioNaHora(ponto, h);
    soma += limitar(excedente / TARIFA.solarPotenciaRefKW, 0, 1);
  }
  return soma / (2 * meia + 1);
}

// ---------------------------------------------------------------- preço base, piso e teto
/** Piso de custo: o menor preço que ainda paga energia, taxas e a margem mínima. */
export function pisoDeCusto(custoEnergiaKWh: number): number {
  return centAcima((custoEnergiaKWh + TARIFA.margemMinKWh) / (1 - TAXAS_PCT));
}

/** Menor preço base aceito para a região (sem o benefício do sol, que não é garantido). */
export const pisoMinimoBase = (regiao: Regiao): number => pisoDeCusto(regiao.custoEnergiaKWh);

/** Preço base sugerido para a região: cobre energia, taxas e a margem alvo, em degraus de R$ 0,05. */
export function sugerirPrecoBase(regiao: Regiao): number {
  const bruto = (regiao.custoEnergiaKWh + TARIFA.baseMargemAlvoKWh) / (1 - TAXAS_PCT);
  return cent(Math.round(bruto / TARIFA.baseDegrauKWh) * TARIFA.baseDegrauKWh);
}

export interface ValidacaoPreco {
  valido: boolean;
  erro?: string;
  aviso?: string;
  minimo: number;
  sugerido: number;
}

/** Valida o preço base digitado pelo franqueado: maior que zero, acima do piso de custo, aviso se abaixo do sugerido. */
export function validarPrecoBase(valor: number, regiao: Regiao): ValidacaoPreco {
  const minimo = pisoMinimoBase(regiao);
  const sugerido = sugerirPrecoBase(regiao);
  if (typeof valor !== 'number' || !Number.isFinite(valor) || cent(valor) <= 0) {
    return { valido: false, erro: 'Informe um preço base maior que zero.', minimo, sugerido };
  }
  valor = cent(valor);
  if (valor < minimo) {
    return {
      valido: false,
      erro: `O preço base não pode ficar abaixo de ${tarifaKWh(minimo)} em ${regiao.cidade}: não cobriria a energia, as taxas e a margem mínima de ${brl(TARIFA.margemMinKWh)} por kWh.`,
      minimo, sugerido,
    };
  }
  if (valor < sugerido) {
    return {
      valido: true,
      aviso: `Abaixo do sugerido para ${regiao.cidade} (${tarifaKWh(sugerido)}). Funciona, mas a margem fica apertada.`,
      minimo, sugerido,
    };
  }
  return { valido: true, minimo, sugerido };
}

/** Fórmula antiga do fator de energia (v1). Só a migração usa, para manter o nível de preço dos pontos existentes. */
export function fatorEnergiaV1(custoRegiao: number, custoReferencia = 0.85): number {
  return Number((1 + (custoRegiao / custoReferencia - 1) * 0.6).toFixed(3));
}

// ---------------------------------------------------------------- repartição de um preço
export interface PrecoDecomposto {
  energia: number;
  /** royalty + fundo de marketing */
  goodwe: number;
  gateway: number;
  /** o que sobra para o comércio por kWh */
  comercio: number;
}

/** Decompõe um preço por kWh em energia, GoodWe (royalty + fundo), gateway e o que fica com o comércio. */
export function decomporPreco(preco: number, custoEnergiaKWh: number): PrecoDecomposto {
  const energia = cent(custoEnergiaKWh);
  const goodwe = cent(preco * (REGRAS.royaltyPct + REGRAS.fundoPct));
  const gateway = cent(preco * REGRAS.gatewayPct);
  return { energia, goodwe, gateway, comercio: cent(preco - energia - goodwe - gateway) };
}

// ---------------------------------------------------------------- motor
const sinalBrl = (v: number) => `${v < 0 ? '−' : '+'}${brl(Math.abs(v))}`;
/** +12% · −6% · uma casa decimal quando a variação é menor que 1% (para não aparecer 0%) */
const pctLinha = (f: number) => delta(f, Math.abs(f) < 0.01 ? 1 : 0);

function compor(
  ponto: Ponto,
  regiao: Regiao,
  hora: number,
  ocupacao: number,
  ctx: ContextoTarifa,
  comProxima: boolean,
): ComposicaoTarifa {
  const h = ((Math.trunc(hora) % 24) + 24) % 24;
  const baseCadastrada = cent(Number(ponto.precoBaseKWh));
  const baseValida = Number.isFinite(baseCadastrada) && baseCadastrada > 0;
  // preço base zerado ou inválido nunca vira preço zero: vale o sugerido da região
  const base = baseValida ? baseCadastrada : sugerirPrecoBase(regiao);

  const { mult, faixa, rampa } = faixaDaHora(h, !!ctx.fimDeSemana);
  const esc = adicionalEscassez(ocupacao, ctx.vagasOperantes ?? 0);

  const economiaKWh = Math.max(0, regiao.custoEnergiaKWh - TARIFA.solarCreditoKWh) * coberturaSolar(ponto, h);
  const custoEf = regiao.custoEnergiaKWh - economiaKWh;

  const p1 = base * mult;
  const p2 = p1 * (1 + esc);
  const descontoRS = Math.min(TARIFA.solarDescontoMax * p2, TARIFA.solarRepasse * economiaKWh);
  const p3 = p2 - descontoRS;

  const piso = Math.max(pisoDeCusto(custoEf), centAcima(base * TARIFA.pisoPctBase));
  const teto = Math.max(piso, centAbaixo(base * TARIFA.tetoPctBase));
  const bruto = cent(p3);
  // qualquer dado quebrado (NaN) cai no piso: o preço nunca vira zero nem lixo
  const preco = Number.isFinite(bruto) ? limitar(bruto, piso, teto) : piso;

  // linhas em valores acumulados e arredondados: base + linhas = preço final, sem sobrar centavo
  const r1 = cent(p1);
  const r2 = cent(p2);
  const linhas: string[] = [
    baseValida ? `Preço base ${tarifaKWh(base)}` : `Preço base inválido: usando ${tarifaKWh(base)}, o sugerido para ${regiao.cidade}`,
  ];
  if (cent(r1 - base) !== 0) {
    const nome = faixa === 'PICO' ? 'Horário de pico'
      : faixa === 'VALE' ? (!rampa ? 'Horário de vale' : h === TARIFA.valeFim ? 'Saída do vale' : 'Entrada no vale')
      : 'Transição do horário de pico';
    linhas.push(`${nome} (${pctLinha(mult - 1)}) ${sinalBrl(cent(r1 - base))}`);
  }
  if (cent(r2 - r1) !== 0) linhas.push(`Últimas vagas (${pctLinha(esc)}) ${sinalBrl(cent(r2 - r1))}`);
  if (cent(bruto - r2) !== 0) linhas.push(`Energia do sol do ponto (${pctLinha(-descontoRS / p2)}) ${sinalBrl(cent(bruto - r2))}`);
  if (preco > bruto) linhas.push(`Preço mínimo do ponto aplicado ${sinalBrl(cent(preco - bruto))}`);
  else if (preco < bruto) linhas.push(`Preço máximo do ponto aplicado ${sinalBrl(cent(preco - bruto))}`);

  const dec = decomporPreco(preco, custoEf);

  let proxima: ComposicaoTarifa['proxima'];
  if (comProxima) {
    for (let hh = h + 1; hh <= 23; hh++) {
      const c = compor(ponto, regiao, hh, ocupacao, ctx, false);
      if (Math.abs(c.precoFinalKWh - preco) >= 0.01) {
        proxima = { hora: hh, precoKWh: c.precoFinalKWh, faixa: c.faixa ?? 'NORMAL' };
        break;
      }
    }
  }

  return {
    precoBaseKWh: base,
    fatorHorario: mult,
    fatorOcupacao: 1 + esc,
    fatorEnergia: 1,
    precoFinalKWh: preco,
    custoEnergiaKWh: dec.energia,
    margemKWh: dec.comercio,
    margemPct: preco ? dec.comercio / preco : 0,
    explicacao: linhas,
    faixa,
    proxima,
    pisoKWh: piso,
    tetoKWh: teto,
    previa: !!ctx.previa,
    adicionalEscassez: esc,
    descontoSolar: p2 ? descontoRS / p2 : 0,
    baseSubstituida: !baseValida,
  };
}

/**
 * Preço do kWh de um ponto numa hora.
 * `ocupacao` (0 a 1) vem de `medirOcupacao`; `ctx.vagasOperantes` liga a escassez.
 */
export function calcularTarifa(
  ponto: Ponto,
  regiao: Regiao,
  hora: number,
  ocupacao: number,
  ctx: ContextoTarifa = {},
): ComposicaoTarifa {
  return compor(ponto, regiao, hora, ocupacao, ctx, true);
}

/**
 * Preço do kWh de um ponto num instante: mede a ocupação das vagas e chama o motor com a hora e o dia
 * de Brasília. É a conta única do app (`tarifaAtual`) e do simulador, para o totem e o celular
 * mostrarem sempre o mesmo preço. `vagaPropriaId` é a vaga da sessão cotada.
 */
export function cotarPonto(
  ponto: Ponto,
  regiao: Regiao,
  vagas: VagaMedida[],
  temSessao: (vagaId: string) => boolean,
  quando: Date,
  vagaPropriaId?: string,
  previa = false,
): ComposicaoTarifa {
  const oc = medirOcupacao(vagas, temSessao, vagaPropriaId);
  return calcularTarifa(ponto, regiao, horaLocal(quando), oc.ocupacao, {
    fimDeSemana: fimDeSemana(quando), vagasOperantes: oc.vagasOperantes, previa,
  });
}

/** As 24 horas do dia pelo motor, com a mesma ocupação e contexto (para o gráfico e as checagens). */
export function curvaDoDia(ponto: Ponto, regiao: Regiao, ocupacao: number, ctx: ContextoTarifa = {}): ComposicaoTarifa[] {
  return Array.from({ length: 24 }, (_, h) => compor(ponto, regiao, h, ocupacao, ctx, false));
}

// ---------------------------------------------------------------- repartição do pagamento
export interface RepassePagamento {
  valorBruto: number;
  custoEnergia: number;
  royaltyGoodWe: number;
  fundoMarketing: number;
  gateway: number;
  liquidoLojista: number;
}

/**
 * Reparte o valor de uma recarga.
 * Royalties e fundo incidem SÓ sobre a recarga — nunca sobre as vendas da
 * loja do comerciante. Essa fronteira é o que torna a franquia atrativa.
 */
export function repartir(valorBruto: number, energiaKWh: number, custoEnergiaKWh: number): RepassePagamento {
  const custoEnergia = cent(energiaKWh * custoEnergiaKWh);
  const royaltyGoodWe = cent(valorBruto * REGRAS.royaltyPct);
  const fundoMarketing = cent(valorBruto * REGRAS.fundoPct);
  const gateway = cent(valorBruto * REGRAS.gatewayPct);
  const liquidoLojista = cent(valorBruto - custoEnergia - royaltyGoodWe - fundoMarketing - gateway);
  return { valorBruto, custoEnergia, royaltyGoodWe, fundoMarketing, gateway, liquidoLojista };
}

/** Gera um txid no formato de Pix dinâmico (mock). */
export function gerarTxid(sessaoId: string): string {
  const base = sessaoId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `PONTOW${base.slice(-10).padStart(10, '0')}`;
}

/**
 * Payload copia-e-cola do Pix (MOCK, formato EMV simplificado).
 * A chave e ficticia e o codigo nao e valido para pagamento real —
 * serve so para a demonstracao da tela.
 */
export function gerarPixCopiaECola(txid: string, valor: number): string {
  // o EMV exige o valor com ponto e duas casas (campo técnico, não é texto de tela)
  const v = cent(valor).toFixed(2);
  return `00020126580014BR.GOV.BCB.PIX0130pix@pontow.demo5204000053039865802BR5913PONTO W LTDA6009SAO PAULO62070503${txid}5405${v}6304ABCD`;
}
