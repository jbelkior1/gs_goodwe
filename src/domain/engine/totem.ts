import { MODELOS_CARREGADOR, REGRAS, VEICULOS } from '../catalogo';
import type { Carregador, Cobranca, Ponto, Sessao, Veiculo } from '../types';
import type { FaseVolt } from './assistente';

/**
 * Lógica pura do totem: dado o que o banco sabe (ponto, vagas, sessões, cobranças) e a hora,
 * decide QUAL tela mostrar. Sem React e sem banco, para testar com tsx.
 *
 * Uma tela por estado (fluxograma do produto, passos 4 a 9):
 *   espera → (carro no cabo) reconhecendo → qr (ABERTA) → iniciando (AUTENTICADO) → carga ↔ pausada
 *   → encerrando → pagar (CONCLUIDO + Pix) → pago (FATURADO). Fora do caminho: expirado, manutencao,
 *   instalacao, suspenso, semSinal.
 */

export const TEMPO = {
  /** carro no cabo e nenhuma sessão criada: depois disso o totem admite que não iniciou */
  reconhecerFalhaMs: 30_000,
  /** a tela de pago e a de código expirado voltam para a espera depois disso */
  pagoVisivelMs: 60_000,
  expiradoVisivelMs: 60_000,
  /** a escolha manual de vaga some sozinha */
  escolhaManualMs: 45_000,
  /** sem toque há esse tempo: o totem zera conversa, escolha e erros */
  inatividadeMs: 45_000,
} as const;

export type NomeTela =
  | 'espera' | 'reconhecendo' | 'qr' | 'iniciando' | 'carga' | 'pausada' | 'encerrando' | 'pagar' | 'pago'
  | 'expirado' | 'manutencao' | 'instalacao' | 'suspenso' | 'semSinal';

export type SituacaoNoTotem =
  | 'aberta' | 'reconhecendo' | 'reconhecendoFalhou' | 'iniciando' | 'carga' | 'pausada' | 'encerrando'
  | 'fechando' | 'pagar' | 'pago' | 'expirada' | 'livre' | 'ocupada' | 'manutencao' | 'foraDoAr' | 'semSinal';

/** palavra que aparece no cartão da vaga (o estado nunca é só cor) */
export const ROTULO_VAGA: Record<SituacaoNoTotem, string> = {
  aberta: 'Aguardando leitura do QR',
  reconhecendo: 'Carro detectado',
  reconhecendoFalhou: 'Não iniciou',
  iniciando: 'Iniciando',
  carga: 'Carregando',
  pausada: 'Pausada',
  encerrando: 'Encerrando',
  fechando: 'Fechando a conta',
  pagar: 'A pagar',
  pago: 'Pago',
  expirada: 'Código expirado',
  livre: 'Livre',
  ocupada: 'Em uso',
  manutencao: 'Manutenção',
  foraDoAr: 'Fora do ar',
  semSinal: 'Sem sinal',
};

/** quanto menor, mais a vaga merece a tela: ABERTA > a pagar > pago recente > em carga > livre */
const NIVEL: Record<SituacaoNoTotem, number> = {
  aberta: 1, reconhecendo: 2, pagar: 3, fechando: 3, pago: 4, expirada: 5, reconhecendoFalhou: 5,
  iniciando: 6, carga: 6, pausada: 6, encerrando: 6, livre: 7, ocupada: 8, semSinal: 9, foraDoAr: 9, manutencao: 9,
};

export interface VagaDados {
  vaga: Carregador;
  /** sessaoDaVaga(vaga.id): a em andamento ou a que acabou de terminar com o mesmo carro no cabo */
  sessao?: Sessao;
  cobranca?: Cobranca;
  /** semSinal(vaga) de db.ts */
  semSinal: boolean;
  /** o totem viu esta sessão expirar por tempo (e não por cabo removido) neste instante */
  expirada?: { sessaoId: string; em: number };
}

export interface VagaVista {
  id: string;
  apelido: string;
  situacao: SituacaoNoTotem;
  rotulo: string;
  nivel: number;
  dados: VagaDados;
  sessao?: Sessao;
  cobranca?: Cobranca;
  /** carro no cabo */
  comCarro: boolean;
  /** potência nominal da vaga (kW) */
  potenciaKW: number;
}

export interface EscolhaManual {
  vagaId: string;
  em: number;
  /** vagas que já estavam em ABERTA/CONCLUIDO quando a pessoa escolheu: uma nova invalida a escolha */
  prioritarias: string[];
}

export interface EntradaTotem {
  ponto?: Ponto;
  vagas: VagaDados[];
  agora: number;
  escolha?: EscolhaManual | null;
  /** sem internet (navegador offline ou tempo real caído) */
  semInternet?: boolean;
}

export interface Aviso { id: 'semInternet' | 'semSinal'; texto: string }

export interface ResultadoTotem {
  tela: NomeTela;
  fase: FaseVolt;
  /** vaga que a tela mostra (some nas telas do ponto inteiro) */
  foco?: VagaVista;
  /** todas as vagas, ordenadas por apelido */
  vagas: VagaVista[];
  vagasLivres: number;
  avisos: Aviso[];
  /** a tela depende de contagem em segundos (QR, reconhecendo, pago, expirado) */
  contagem: boolean;
  /** a escolha manual da pessoa ainda vale */
  escolhaAtiva: boolean;
}

// ---------------------------------------------------------------- utilidades
const ms = (iso?: string | null): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};

export const statusOperacional = (p: Ponto): 'INSTALACAO' | 'ATIVO' | 'SUSPENSO' => p.status ?? (p.ativo ? 'ATIVO' : 'INSTALACAO');

export const potenciaDaVaga = (v: Carregador): number => MODELOS_CARREGADOR[v.modelo]?.potenciaKW ?? 7;

export const veiculoDaVaga = (sessao?: Sessao, vaga?: Carregador): Veiculo | undefined =>
  VEICULOS.find((v) => v.id === (sessao?.veiculoId ?? vaga?.carro?.veiculoId));

/** vaga sem carro e sem problema: o que o motorista chama de "livre" */
export const vagaLivre = (v: Carregador): boolean => v.estado === 'DISPONIVEL' && !v.carro;

const comparaApelido = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });

// ---------------------------------------------------------------- situação de cada vaga
export function situacaoNoTotem(d: VagaDados, agora: number): SituacaoNoTotem {
  const { vaga, sessao, cobranca } = d;
  if (sessao) {
    switch (sessao.estado) {
      case 'ABERTA': return 'aberta';
      case 'AUTENTICADO': return 'iniciando';
      case 'CARREGANDO': return 'carga';
      case 'PAUSADO': return 'pausada';
      case 'ENCERRANDO': return 'encerrando';
      case 'CONCLUIDO':
        if (!cobranca) return 'fechando';
        return cobranca.status === 'PAGO' ? 'pago' : 'pagar';
      case 'FATURADO': {
        const quando = ms(cobranca?.pagaEm) ?? ms(sessao.fim);
        return quando == null || agora - quando <= TEMPO.pagoVisivelMs ? 'pago' : 'ocupada';
      }
      default: break;
    }
  }
  // sem sessão: o código acabou de expirar (e o carro que está no cabo, se houver, é o mesmo daquela sessão)
  if (d.expirada && agora - d.expirada.em <= TEMPO.expiradoVisivelMs
    && (!vaga.carro || vaga.carro.sessaoId === d.expirada.sessaoId)) return 'expirada';
  if (vaga.estado === 'OFFLINE') return 'foraDoAr';
  if (vaga.estado === 'MANUTENCAO') return 'manutencao';
  if (d.semSinal) return 'semSinal';
  if (vaga.carro) {
    const desde = ms(vaga.carro.conectadoEm) ?? agora;
    return agora - desde > TEMPO.reconhecerFalhaMs ? 'reconhecendoFalhou' : 'reconhecendo';
  }
  return 'livre';
}

export function vistaDaVaga(d: VagaDados, agora: number): VagaVista {
  const situacao = situacaoNoTotem(d, agora);
  return {
    id: d.vaga.id, apelido: d.vaga.apelido, situacao, rotulo: ROTULO_VAGA[situacao], nivel: NIVEL[situacao],
    dados: d, sessao: d.sessao, cobranca: d.cobranca, comCarro: !!d.vaga.carro, potenciaKW: potenciaDaVaga(d.vaga),
  };
}

/** vagas em ABERTA ou CONCLUIDO: a escolha manual da pessoa não pode esconder essas */
const prioritaria = (s: SituacaoNoTotem) => s === 'aberta' || s === 'pagar' || s === 'fechando';
export const prioritariasAgora = (vagas: VagaVista[]): string[] => vagas.filter((v) => prioritaria(v.situacao)).map((v) => v.id);

/** a escolha vale por 45 s, enquanto a vaga existir e nenhuma outra tiver entrado em ABERTA/CONCLUIDO */
export function escolhaValida(e: EscolhaManual | null | undefined, vagas: VagaVista[], agora: number): boolean {
  if (!e || agora - e.em > TEMPO.escolhaManualMs) return false;
  if (!vagas.some((v) => v.id === e.vagaId)) return false;
  return prioritariasAgora(vagas).every((id) => e.prioritarias.includes(id));
}

const TELA_DA_SITUACAO: Record<SituacaoNoTotem, NomeTela> = {
  aberta: 'qr', reconhecendo: 'reconhecendo', reconhecendoFalhou: 'reconhecendo', iniciando: 'iniciando', carga: 'carga',
  pausada: 'pausada', encerrando: 'encerrando', fechando: 'encerrando', pagar: 'pagar', pago: 'pago', expirada: 'expirado',
  livre: 'espera', ocupada: 'espera', manutencao: 'manutencao', foraDoAr: 'manutencao', semSinal: 'semSinal',
};

const FASE_DA_TELA: Record<NomeTela, FaseVolt> = {
  espera: 'espera', reconhecendo: 'espera', expirado: 'espera', qr: 'qr', iniciando: 'iniciando', carga: 'carga',
  pausada: 'pausada', encerrando: 'encerrando', pagar: 'pagar', pago: 'pago', manutencao: 'indisponivel',
  instalacao: 'indisponivel', suspenso: 'indisponivel', semSinal: 'indisponivel',
};
export const faseDaTela = (t: NomeTela): FaseVolt => FASE_DA_TELA[t];

const COM_CONTAGEM: NomeTela[] = ['qr', 'reconhecendo', 'pago', 'expirado'];
const COM_CONTA_VIVA: NomeTela[] = ['qr', 'iniciando', 'carga', 'pausada', 'encerrando', 'pagar', 'pago'];

// ---------------------------------------------------------------- a decisão
export function telaDoTotem(e: EntradaTotem): ResultadoTotem {
  const { ponto, agora } = e;
  const vagas = [...e.vagas]
    .sort((a, b) => comparaApelido(a.vaga.apelido, b.vaga.apelido))
    .map((d) => vistaDaVaga(d, agora));
  const avisos: Aviso[] = [];
  if (e.semInternet) avisos.push({ id: 'semInternet', texto: 'Sem conexão — tentando reconectar...' });

  // foco: escolha manual (se ainda vale) ou a vaga de maior prioridade a cada render
  const escolhaAtiva = escolhaValida(e.escolha, vagas, agora);
  const escolhida = escolhaAtiva ? vagas.find((v) => v.id === e.escolha!.vagaId) : undefined;
  const foco = escolhida ?? vagas.reduce<VagaVista | undefined>((m, v) => (!m || v.nivel < m.nivel ? v : m), undefined);

  const vagasLivres = vagas.filter((v) => v.situacao === 'livre').length;
  const status = ponto ? statusOperacional(ponto) : 'ATIVO';
  // ponto que não opera só manda na tela quando ninguém está no meio de uma recarga ou de uma conta
  const contaViva = vagas.some((v) => v.nivel <= 6);

  let tela: NomeTela = foco ? TELA_DA_SITUACAO[foco.situacao] : 'espera';
  if (status !== 'ATIVO' && !contaViva) tela = status === 'SUSPENSO' ? 'suspenso' : 'instalacao';

  if (foco?.dados.semSinal && COM_CONTA_VIVA.includes(tela)) {
    avisos.push({
      id: 'semSinal',
      texto: tela === 'qr'
        ? 'Sem comunicação com a vaga — se o QR não funcionar, chame um atendente da loja'
        : 'Sem comunicação com a vaga — os números podem estar atrasados',
    });
  }

  const pontoInteiro = tela === 'instalacao' || tela === 'suspenso';
  return {
    tela, fase: faseDaTela(tela), foco: pontoInteiro ? undefined : foco, vagas, vagasLivres, avisos,
    contagem: COM_CONTAGEM.includes(tela), escolhaAtiva,
  };
}

// ---------------------------------------------------------------- números das telas
/** milissegundos que faltam para o código e o preço do QR expirarem (nunca negativo) */
export function restanteDoCodigoMs(sessao: Pick<Sessao, 'inicio'>, agora: number): number {
  const inicio = ms(sessao.inicio) ?? agora;
  return Math.max(0, inicio + REGRAS.codigoValidadeMin * 60_000 - agora);
}

/**
 * A sessão ABERTA virou EXPIRADA por tempo (e não porque o cabo saiu)? O banco não guarda quando
 * expirou; cabo removido antes da validade não conta. Folga de 20 s para o ciclo do simulador.
 */
export function foiExpiradaPorTempo(sessao: Pick<Sessao, 'inicio'>, agora: number): boolean {
  const inicio = ms(sessao.inicio) ?? agora;
  return agora - inicio >= REGRAS.codigoValidadeMin * 60_000 - 20_000;
}

/** 9:42 */
export function mmss(totalMs: number): string {
  const s = Math.max(0, Math.ceil(totalMs / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** o simulador entrega ao carro 92% do que sai do carregador (perda de conversão) */
const RENDIMENTO = 0.92;

/**
 * Minutos até 100%, pela potência de agora e pela capacidade do carro. Null quando não dá para
 * estimar (potência zerada, carro desconhecido).
 */
export function minutosAte100(socAtual: number, capacidadeKWh: number | undefined, potenciaKW: number): number | null {
  if (!capacidadeKWh || potenciaKW < 0.1) return null;
  const faltaKWh = capacidadeKWh * (Math.max(0, 100 - socAtual) / 100);
  return Math.max(1, Math.round((faltaKWh / (potenciaKW * RENDIMENTO)) * 60));
}

/** 38 min · 1 h 12 min · 2 h */
export function duracaoTexto(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  if (m < 1) return 'menos de 1 min';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

/** duração da recarga em minutos (início até fim ou agora) */
export function minutosDaSessao(sessao: Pick<Sessao, 'inicio' | 'fim'>, agora: number): number {
  const ini = ms(sessao.inicio) ?? agora;
  const fim = ms(sessao.fim) ?? agora;
  return Math.max(0, (fim - ini) / 60_000);
}

export interface ResumoConta { energiaKWh: number; valor: number; minutos: number; precoKWh: number }

/** recibo da tela de pago: valor cobrado (ou o acumulado), energia, duração e preço travado */
export function resumoDaConta(sessao: Sessao, cobranca: Cobranca | undefined, agora: number): ResumoConta {
  return {
    energiaKWh: sessao.energiaKWh,
    valor: cobranca?.valor ?? sessao.custoAcumulado,
    minutos: minutosDaSessao(sessao, agora),
    precoKWh: sessao.tarifaAplicadaKWh,
  };
}

/**
 * Mini curva da recarga: só devolve a série quando há pelo menos 3 pontos de telemetria (menos que
 * isso é uma linha sem sentido). O ponto de agora entra no fim.
 */
export function serieDePotencia(telemetria: { potenciaKW: number }[], agoraKW: number, ativa: boolean): number[] | null {
  if (telemetria.length < 3) return null;
  const serie = telemetria.slice(-60).map((t) => t.potenciaKW);
  if (ativa) serie.push(agoraKW);
  return serie;
}
