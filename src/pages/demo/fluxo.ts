import {
  base, carregadoresDoPonto, checklistAtivacao, cobrancaDaSessao, demandaDoPonto, obterMotorista, obterPonto,
  semSinal, sessaoDaVaga, sessoesDoPonto, statusDoPonto, tarifaAtual,
} from '../../domain/db';
import { REGRAS } from '../../domain/catalogo';
import { brl, kw, kwh, num, pct, tarifaKWh } from '../../domain/formato';
import type { Carregador, Ponto, Sessao, SolicitacaoHomologacao } from '../../domain/types';

/**
 * O fluxograma do produto em 11 passos e a leitura, ao vivo, de em qual deles a demonstração está.
 * Tudo sai da base em memória (a mesma que o tempo real mantém): nada aqui grava.
 */

export type Ambiente = 'motorista' | 'totem' | 'franqueado' | 'goodwe';

export interface PassoFluxo { n: number; titulo: string; quem: string; texto: string }

export const PASSOS: PassoFluxo[] = [
  { n: 1, titulo: 'Pede a franquia', quem: 'Comerciante', texto: 'Preenche o pedido em Seja GoodWe e vê a pré-análise da IA.' },
  { n: 2, titulo: 'GoodWe aprova', quem: 'GoodWe', texto: 'Vê o score da IA, pede a vistoria e aprova. O ponto nasce em instalação.' },
  { n: 3, titulo: 'Configura o ponto', quem: 'Franqueado', texto: 'Define as vagas e a tarifa base em Meu ponto.' },
  { n: 4, titulo: 'Pareia o totem', quem: 'Franqueado + totem', texto: 'Digita o código de 6 dígitos que o totem mostra e ativa o ponto.' },
  { n: 5, titulo: 'Acha o ponto no mapa', quem: 'Motorista', texto: 'Vê as vagas livres e o preço do kWh agora.' },
  { n: 6, titulo: 'Conecta o carro', quem: 'Totem', texto: 'Com o cabo conectado, o totem mostra o QR e o código de 4 letras.' },
  { n: 7, titulo: 'Lê o QR e trava o preço', quem: 'Motorista', texto: 'Lê o QR (ou digita o código) e o preço do kWh fica travado.' },
  { n: 8, titulo: 'Libera a potência', quem: 'Agente da vaga', texto: 'O agente libera a potência dentro do limite da entrada elétrica (controle de demanda).' },
  { n: 9, titulo: 'Encerra e paga', quem: 'Motorista', texto: 'Encerra a recarga e paga o Pix; o valor é repartido.' },
  { n: 10, titulo: 'Vê extrato e fechamento', quem: 'Franqueado', texto: 'A recarga entra no extrato do ponto e no fechamento do mês.' },
  { n: 11, titulo: 'Vê royalties e a rede', quem: 'GoodWe', texto: 'Royalties, ranking e saúde da rede já com a recarga somada.' },
];

export type Fase =
  | 'pedido' | 'instalacao' | 'ocioso' | 'aberta' | 'autenticado' | 'carregando' | 'pausada' | 'encerrando' | 'pagar' | 'paga';

export interface SituacaoDemo {
  fase: Fase;
  /** passos do fluxograma que estão acontecendo agora */
  passos: number[];
  titulo: string;
  /** o que está acontecendo, em uma ou duas frases */
  resumo: string;
  /** números ao vivo para a central (vaga, motorista, kW, kWh, R$...) */
  numeros: { rotulo: string; valor: string }[];
  /** ponto no ar, mas com todas as vagas sem sinal do agente (o simulador parado, na demonstração) */
  semSinal?: boolean;
  ponto?: Ponto;
  vaga?: Carregador;
  sessao?: Sessao;
  pedido?: SolicitacaoHomologacao;
}

/** quanto tempo uma conta fechada ou um Pix confirmado ainda contam como "acabou de acontecer" (passos 9, 10 e 11) */
const JANELA_PAGA_MIN = 15;
/** quanto tempo um pedido novo ainda conta como "a GoodWe vai analisar" (passo 2) */
const JANELA_PEDIDO_H = 6;

const nomeVaga = (v?: Carregador) => (v ? v.apelido.replace(/^Vaga/, 'vaga') : 'vaga');
const quemCarrega = (s?: Sessao) =>
  s?.autorizacao === 'VISITANTE' ? 'Um visitante' : obterMotorista(s?.motoristaId)?.nome ?? 'O motorista';

/** conta fechada (a pagar) ou paga há pouco: ainda faz parte do que a demonstração está mostrando */
function fechadaRecente(s: Sessao, agora: number): boolean {
  if (s.estado !== 'FATURADO' && s.estado !== 'CONCLUIDO') return false;
  const quando = cobrancaDaSessao(s.id)?.pagaEm ?? s.fim ?? s.inicio;
  return agora - new Date(quando).getTime() <= JANELA_PAGA_MIN * 60_000;
}

/** pedido de franquia que acabou de entrar e ainda espera a GoodWe */
function pedidoNovo(agora: number): SolicitacaoHomologacao | undefined {
  return base.homologacoes
    .filter((h) => (h.status === 'ANALISE' || h.status === 'VISTORIA')
      && agora - new Date(h.criadoEm).getTime() <= JANELA_PEDIDO_H * 3_600_000)
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))[0];
}

/** A recarga que a demonstração deve mostrar no ponto: a viva mais recente ou, sem ela, o Pix recém-pago. */
function recargaEmFoco(pontoId: string, agora: number): { sessao: Sessao; vaga?: Carregador } | undefined {
  const candidatos: Sessao[] = [];
  const vistos = new Set<string>();
  const entrar = (s: Sessao) => { if (!vistos.has(s.id)) { vistos.add(s.id); candidatos.push(s); } };
  for (const v of carregadoresDoPonto(pontoId)) {
    const s = sessaoDaVaga(v.id);
    if (!s) continue;
    // código vencido: ninguém leu o QR a tempo, a sessão não está mais "acontecendo"
    if (s.estado === 'ABERTA' && agora > new Date(s.inicio).getTime() + REGRAS.codigoValidadeMin * 60_000) continue;
    if ((s.estado === 'FATURADO' || s.estado === 'CONCLUIDO') && !fechadaRecente(s, agora)) continue;
    entrar(s);
  }
  // o carro pode já ter saído do cabo: conta fechada ou paga há pouco ainda conta
  for (const s of sessoesDoPonto(pontoId)) if (fechadaRecente(s, agora)) entrar(s);
  // o que ainda está andando vem antes do que já fechou
  const andando = (s: Sessao) => Number(s.estado !== 'FATURADO' && s.estado !== 'CONCLUIDO');
  candidatos.sort((a, b) => andando(b) - andando(a) || b.inicio.localeCompare(a.inicio));
  const sessao = candidatos[0];
  return sessao ? { sessao, vaga: base.carregadores.find((c) => c.id === sessao.carregadorId) } : undefined;
}

/** Em qual passo do fluxograma está o ponto da demonstração, agora. */
export function situacaoDaDemo(pontoId: string, agora = Date.now()): SituacaoDemo {
  const ponto = obterPonto(pontoId);
  if (!ponto) {
    return { fase: 'ocioso', passos: [], titulo: 'Nenhum ponto escolhido', resumo: 'Escolha um ponto para acompanhar o fluxo.', numeros: [] };
  }

  const foco = recargaEmFoco(pontoId, agora);
  if (foco) {
    const { sessao, vaga } = foco;
    const quem = quemCarrega(sessao);
    const nome = nomeVaga(vaga);
    const cobranca = cobrancaDaSessao(sessao.id);
    const valor = cobranca?.valor ?? sessao.custoAcumulado;
    const aoVivo = () => {
      const d = demandaDoPonto(pontoId);
      return [
        { rotulo: 'Vaga', valor: vaga?.apelido ?? '—' },
        { rotulo: 'Quem', valor: quem },
        { rotulo: 'Potência', valor: kw(sessao.potenciaAtualKW) },
        { rotulo: 'Energia', valor: kwh(sessao.energiaKWh) },
        { rotulo: 'Valor', valor: brl(sessao.custoAcumulado) },
        { rotulo: 'Preço travado', valor: tarifaKWh(sessao.tarifaAplicadaKWh) },
        { rotulo: 'Bateria', valor: `${num(sessao.socAtual)}%` },
        { rotulo: 'Entrada elétrica', valor: `${pct(d.utilizacaoEntrada)} de ${kw(d.limitePontoKW)}` },
      ];
    };

    switch (sessao.estado) {
      case 'ABERTA': {
        const resta = Math.max(0, Math.ceil((new Date(sessao.inicio).getTime() + REGRAS.codigoValidadeMin * 60_000 - agora) / 60_000));
        return {
          fase: 'aberta', passos: [6, 7], ponto, vaga, sessao,
          titulo: 'Carro conectado, aguardando o QR',
          resumo: `Um carro conectou na ${nome}. O totem mostra o QR e o código ${sessao.codigoVinculo ?? ''}; o motorista ainda não leu (vale por mais ${num(resta)} min).`,
          numeros: [
            { rotulo: 'Vaga', valor: vaga?.apelido ?? '—' },
            { rotulo: 'Código', valor: sessao.codigoVinculo ?? '—' },
            { rotulo: 'Vale por', valor: `${num(resta)} min` },
            { rotulo: 'Preço cotado', valor: tarifaKWh(sessao.tarifaAplicadaKWh > 0 ? sessao.tarifaAplicadaKWh : tarifaAtual(pontoId, sessao.carregadorId).precoFinalKWh) },
          ],
        };
      }
      case 'AUTENTICADO':
        return {
          fase: 'autenticado', passos: [8], ponto, vaga, sessao,
          titulo: 'Preço travado, liberando a potência',
          resumo: `${quem} travou o preço de ${tarifaKWh(sessao.tarifaAplicadaKWh)}. O agente da ${nome} está liberando a potência.`,
          numeros: aoVivo(),
        };
      case 'CARREGANDO':
        return {
          fase: 'carregando', passos: [8], ponto, vaga, sessao,
          titulo: 'Recarga em andamento',
          resumo: `${quem} está carregando na ${nome}. O controle de demanda reparte a potência da entrada elétrica entre as vagas e protege o disjuntor do comércio.`,
          numeros: aoVivo(),
        };
      case 'PAUSADO':
        return {
          fase: 'pausada', passos: [8], ponto, vaga, sessao,
          titulo: 'Recarga pausada pelo controle de demanda',
          resumo: `A recarga da ${nome} está pausada${sessao.motivoPausa ? `: ${sessao.motivoPausa}` : ''}. Volta sozinha quando houver folga na entrada elétrica.`,
          numeros: aoVivo(),
        };
      case 'ENCERRANDO':
        return {
          fase: 'encerrando', passos: [9], ponto, vaga, sessao,
          titulo: 'Encerrando a recarga',
          resumo: `A ${nome} está parando a potência e fechando a conta.`,
          numeros: [
            { rotulo: 'Vaga', valor: vaga?.apelido ?? '—' },
            { rotulo: 'Energia', valor: kwh(sessao.energiaKWh) },
            { rotulo: 'Valor', valor: brl(sessao.custoAcumulado) },
          ],
        };
      case 'CONCLUIDO':
        return {
          fase: 'pagar', passos: [9], ponto, vaga, sessao,
          titulo: 'Conta fechada, aguardando o Pix',
          resumo: `A recarga da ${nome} terminou em ${brl(valor)}. ${sessao.autorizacao === 'VISITANTE' ? 'O visitante paga o Pix no próprio totem.' : 'O motorista paga o Pix no celular.'}`,
          numeros: [
            { rotulo: 'Vaga', valor: vaga?.apelido ?? '—' },
            { rotulo: 'Energia', valor: kwh(sessao.energiaKWh) },
            { rotulo: 'A pagar', valor: brl(valor) },
          ],
        };
      case 'FATURADO': {
        const numeros = [
          { rotulo: 'Vaga', valor: vaga?.apelido ?? '—' },
          { rotulo: 'Energia', valor: kwh(sessao.energiaKWh) },
          { rotulo: 'Pago', valor: brl(valor) },
        ];
        if (cobranca) {
          numeros.push(
            { rotulo: 'Royalties + marketing', valor: brl(cobranca.royaltyGoodWe + cobranca.fundoMarketing) },
            { rotulo: 'Fica com o comércio', valor: brl(cobranca.liquidoLojista) },
          );
        }
        return {
          fase: 'paga', passos: [10, 11], ponto, vaga, sessao,
          titulo: 'Pix confirmado',
          resumo: `O Pix de ${brl(valor)} foi confirmado. O valor já está no extrato do ponto (franqueado) e nos royalties da rede (GoodWe).`,
          numeros,
        };
      }
      default:
        break;
    }
  }

  const vagas = carregadoresDoPonto(pontoId);
  if (statusDoPonto(ponto) === 'INSTALACAO') {
    const dados = checklistAtivacao(pontoId)[0]?.feito !== false;
    return {
      fase: 'instalacao', passos: dados ? [3, 4] : [3], ponto,
      titulo: 'Ponto em instalação',
      resumo: `${ponto.nome} foi aprovado e está em instalação. O franqueado define as vagas e a tarifa e pareia o totem com o código de 6 dígitos; ao ativar, o ponto entra no mapa.`,
      numeros: [
        { rotulo: 'Formato', valor: ponto.formato },
        { rotulo: 'Vagas', valor: num(vagas.length) },
        { rotulo: 'Preço base', valor: tarifaKWh(ponto.precoBaseKWh) },
      ],
    };
  }

  const pedido = pedidoNovo(agora);
  if (pedido) {
    return {
      fase: 'pedido', passos: [2], ponto, pedido,
      titulo: 'Pedido de franquia na fila da GoodWe',
      resumo: `${pedido.comercio} pediu uma franquia ${pedido.formatoDesejado} (score da IA ${num(pedido.scoreViabilidade)}). ${pedido.status === 'VISTORIA' ? 'O pedido está em vistoria: falta a GoodWe aprovar.' : 'Em Homologação, a GoodWe pede a vistoria e aprova.'}`,
      numeros: [
        { rotulo: 'Comércio', valor: pedido.comercio },
        { rotulo: 'Score da IA', valor: num(pedido.scoreViabilidade) },
        { rotulo: 'Situação', valor: pedido.status === 'VISTORIA' ? 'Em vistoria' : 'Em análise' },
      ],
    };
  }

  const ativo = ponto.ativo && (ponto.status ?? 'ATIVO') === 'ATIVO';
  const livres = vagas.filter((c) => c.estado === 'DISPONIVEL' && !semSinal(c)).length;
  const todasMudas = vagas.length > 0 && vagas.every((c) => c.estado === 'OFFLINE' || semSinal(c));
  if (ativo && todasMudas) {
    return {
      fase: 'ocioso', passos: [5], ponto, semSinal: true,
      titulo: 'Vagas sem sinal',
      resumo: `As vagas de ${ponto.nome} estão sem sinal do agente: ligue o simulador (npm run simulador) e espere uns 20 segundos para o carro poder conectar.`,
      numeros: [{ rotulo: 'Vagas livres', valor: `0 de ${num(vagas.length)}` }],
    };
  }
  const preco = ativo ? tarifaKWh(tarifaAtual(pontoId).precoFinalKWh) : '';
  return {
    fase: 'ocioso', passos: ativo ? [5] : [], ponto,
    titulo: ativo ? 'Ponto no ar, esperando um carro' : 'Ponto fora de operação',
    resumo: ativo
      ? `${ponto.nome} está no ar: ${num(livres)} de ${num(vagas.length)} vagas livres a ${preco}. Conecte um carro no totem (Simular carro conectado) para começar a recarga.`
      : `${ponto.nome} está suspenso e não aceita recargas.`,
    numeros: ativo ? [
      { rotulo: 'Vagas livres', valor: `${num(livres)} de ${num(vagas.length)}` },
      { rotulo: 'Preço agora', valor: preco },
    ] : [],
  };
}

// ---------------------------------------------------------------- o que dizer em cada aparelho
export interface Fala { passo: number; texto: string }

/**
 * A frase do guia: o passo do fluxograma e o que fazer agora naquele aparelho.
 * `semPonto`: totem que ainda não foi pareado (mostra o código de 6 dígitos).
 */
export function falaDoGuia(amb: Ambiente, s: SituacaoDemo, semPonto = false): Fala {
  if (semPonto && amb === 'totem') {
    return { passo: 4, texto: 'Pareie este totem: o franqueado digita o código de 6 dígitos em Meu ponto' };
  }
  const nome = nomeVaga(s.vaga);
  const nomePonto = s.ponto?.nome ?? 'o ponto';
  const quando = (opcoes: Record<Ambiente, Fala>): Fala => opcoes[amb];

  switch (s.fase) {
    case 'pedido':
      return quando({
        goodwe: { passo: 2, texto: `Há um pedido novo (${s.pedido?.comercio}): em Homologação, confira o score da IA, peça a vistoria e aprove` },
        franqueado: { passo: 2, texto: `A GoodWe está analisando o pedido de franquia de ${s.pedido?.comercio}` },
        motorista: { passo: 2, texto: 'Um comerciante pediu franquia: a GoodWe está analisando o pedido' },
        totem: { passo: 2, texto: 'Aguardando a GoodWe aprovar o pedido: o ponto ainda não existe' },
      });
    case 'instalacao':
      return quando({
        franqueado: { passo: s.passos[0], texto: 'Configure o ponto (vagas e tarifa) e pareie o totem com o código de 6 dígitos' },
        totem: { passo: 4, texto: 'Ponto em instalação: o franqueado digita o código de 6 dígitos e ativa o ponto' },
        goodwe: { passo: 3, texto: `${nomePonto} foi aprovado: o franqueado está configurando e vai ativar o ponto` },
        motorista: { passo: 3, texto: 'Este ponto ainda está em instalação e não aparece no mapa' },
      });
    case 'ocioso':
      if (s.semSinal) {
        return quando({
          motorista: { passo: 5, texto: 'As vagas deste ponto estão sem sinal agora: escolha outro ponto ou aguarde' },
          totem: { passo: 5, texto: 'Vagas sem sinal: ligue o simulador (npm run simulador) e espere uns 20 segundos' },
          franqueado: { passo: 5, texto: 'As vagas estão sem sinal do agente: ligue o simulador (npm run simulador)' },
          goodwe: { passo: 5, texto: `As vagas de ${nomePonto} estão sem sinal do agente` },
        });
      }
      return quando({
        motorista: { passo: 5, texto: 'Ache o ponto no mapa e toque nele: vagas livres e preço do kWh agora' },
        totem: { passo: 5, texto: 'Ponto no ar: conecte um carro (Simular carro conectado) para gerar o QR' },
        franqueado: { passo: 5, texto: 'O ponto está no ar e já aparece no mapa do motorista: acompanhe as vagas aqui' },
        goodwe: { passo: 5, texto: `${nomePonto} está no ar e visível no mapa do motorista` },
      });
    case 'aberta':
      return quando({
        totem: { passo: 6, texto: 'O carro conectou: o totem mostra o QR e o código' },
        motorista: { passo: 7, texto: 'Leia o QR do totem ou digite o código' },
        franqueado: { passo: 6, texto: `A ${nome} recebeu um carro: o totem mostra o QR e espera o motorista` },
        goodwe: { passo: 6, texto: `Um carro conectou em ${nomePonto}: o motorista vai ler o QR e travar o preço` },
      });
    case 'autenticado':
      return quando({
        motorista: { passo: 8, texto: `Preço travado: o agente está liberando a potência da ${nome}` },
        totem: { passo: 8, texto: 'Motorista identificado: o agente está liberando a potência' },
        franqueado: { passo: 8, texto: `O agente está liberando a potência da ${nome}: veja o Controle de demanda` },
        goodwe: { passo: 8, texto: `O agente está liberando a potência em ${nomePonto}` },
      });
    case 'carregando':
      return quando({
        motorista: { passo: 8, texto: 'Carregando: acompanhe kW, kWh e R$ ao vivo e toque em Encerrar recarga quando quiser' },
        totem: { passo: 8, texto: 'Recarga em andamento: o totem mostra potência, bateria e valor ao vivo' },
        franqueado: { passo: 8, texto: `A ${nome} está carregando: veja kW e R$ ao vivo` },
        goodwe: { passo: 8, texto: `Há uma recarga ao vivo em ${nomePonto}: o controle de demanda mantém a potência no limite` },
      });
    case 'pausada':
      return quando({
        motorista: { passo: 8, texto: 'Recarga pausada pelo controle de demanda: ela volta quando houver folga' },
        totem: { passo: 8, texto: 'Recarga pausada pelo controle de demanda: ela volta quando houver folga' },
        franqueado: { passo: 8, texto: `A ${nome} foi pausada pelo controle de demanda: veja o motivo em Controle de demanda` },
        goodwe: { passo: 8, texto: `O controle de demanda pausou uma recarga em ${nomePonto}` },
      });
    case 'encerrando':
      return quando({
        motorista: { passo: 9, texto: 'Encerrando a recarga e fechando a conta' },
        totem: { passo: 9, texto: 'Encerrando a recarga e fechando a conta' },
        franqueado: { passo: 9, texto: `A ${nome} está encerrando a recarga e fechando a conta` },
        goodwe: { passo: 9, texto: `Uma recarga em ${nomePonto} está sendo encerrada` },
      });
    case 'pagar':
      return quando({
        motorista: { passo: 9, texto: 'Recarga encerrada: pague o Pix e veja a repartição do valor' },
        totem: { passo: 9, texto: 'Conta fechada: o Pix aparece para o motorista pagar' },
        franqueado: { passo: 9, texto: 'A recarga terminou e aguarda o Pix: o extrato atualiza quando for pago' },
        goodwe: { passo: 9, texto: 'A recarga terminou e aguarda o Pix: os royalties entram quando for pago' },
      });
    case 'paga':
      return quando({
        motorista: { passo: 9, texto: 'Pix confirmado: recarga paga. O franqueado e a GoodWe já enxergam o valor' },
        totem: { passo: 9, texto: 'Pagamento confirmado: retire o cabo para liberar a vaga' },
        franqueado: { passo: 10, texto: 'A recarga foi paga: veja o extrato e o fechamento em Tarifas e financeiro' },
        goodwe: { passo: 11, texto: 'A recarga já entrou no faturamento da rede' },
      });
  }
}
