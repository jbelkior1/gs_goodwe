import type { Ponto, Sessao } from '../types';
import { REGRAS } from '../catalogo';
import { brl, num, plural, tarifaKWh } from '../formato';
import { faixaDaHora } from './tarifa';

/**
 * "Volt" — assistente do totem e do app.
 *
 * Roda inteiro no navegador, em cima do que o sistema sabe naquele momento: nada de chave de API
 * para a demo funcionar. A pergunta é reconhecida por palavras do jeito que o motorista fala
 * ("tá caro?", "falta muito?") e a resposta usa o número real da recarga — mas só quando existe
 * uma recarga. Sem sessão, o Volt nunca cita número de recarga: explica o passo a passo.
 *
 * Regra de ouro: só prometer o que o sistema faz (pagamento é só Pix; atendimento é a loja).
 */

/** em que ponto do fluxo o motorista está: define saudação, perguntas e o que o Volt pode dizer */
export type FaseVolt =
  | 'espera' | 'qr' | 'iniciando' | 'carga' | 'pausada' | 'encerrando' | 'pagar' | 'pago' | 'indisponivel';

export interface SessaoVolt extends Pick<Sessao, 'socAtual' | 'energiaKWh' | 'potenciaAtualKW' | 'tarifaAplicadaKWh' | 'custoAcumulado'> {
  /** iniciada no totem sem app: quem encerra e paga é o próprio totem */
  visitante?: boolean;
  limiteValor?: number | null;
  motivoPausa?: string | null;
}

export interface ContextoVolt {
  ponto: Ponto;
  fase: FaseVolt;
  /** só existe quando há recarga (AUTENTICADO em diante); sem ela o Volt não cita número de recarga */
  sessao?: SessaoVolt;
  /** minutos estimados até 100% (só com sessão carregando) */
  minutosRestantes?: number;
  /** preço do kWh agora (espera) ou o preço mostrado no QR */
  precoAgoraKWh?: number;
  /** valor da conta (fases pagar e pago) */
  valorConta?: number;
  vagasLivres: number;
  totalVagas: number;
  /** potência nominal das vagas do ponto (kW) */
  potenciaVagaKW?: number;
  /** onde o Volt está falando: no totem ou no app do motorista */
  onde?: 'totem' | 'app';
}

export interface RespostaVolt {
  texto: string;
  /** sugestões de próxima pergunta, mostradas como chips no app */
  sugestoes?: string[];
  /** qual intenção respondeu (ajuda a testar) */
  intencao?: string;
}

/** tira acento e caixa para o casamento de palavra não depender de digitação. */
const normalizar = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const minutosTexto = (min: number): string => {
  const m = Math.max(1, Math.round(min));
  if (m < 60) return plural(m, 'minuto', 'minutos');
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
};

/** janelas contínuas do dia (com virada de meia-noite) em que o critério vale: [início, fim) */
function janelas(pred: (h: number) => boolean): [number, number][] {
  const inicio = Array.from({ length: 24 }, (_, h) => h).find((h) => !pred(h));
  if (inicio === undefined) return [[0, 24]];
  const saida: [number, number][] = [];
  let ini: number | null = null;
  for (let i = 0; i <= 24; i++) {
    const h = (inicio + i) % 24;
    const vale = i < 24 && pred(h);
    if (vale && ini === null) ini = h;
    if (!vale && ini !== null) { saida.push([ini, h]); ini = null; }
  }
  return saida.sort((a, b) => a[0] - b[0]);
}
const textoJanelas = (js: [number, number][]) => js.map(([a, b]) => `das ${a}h às ${b}h`).join(' e ');

const EM_RECARGA: FaseVolt[] = ['iniciando', 'carga', 'pausada', 'encerrando'];
/** há uma recarga de verdade para falar: só então número de recarga pode aparecer */
const temRecarga = (c: ContextoVolt): c is ContextoVolt & { sessao: SessaoVolt } =>
  !!c.sessao && [...EM_RECARGA, 'pagar', 'pago'].includes(c.fase);

const noApp = (c: ContextoVolt) => c.onde === 'app';

/** o que dizer quando a pergunta pede número de recarga e ainda não há recarga */
const SEM_RECARGA =
  'Ainda não há recarga em andamento. Conecte o cabo na vaga, leia o QR que aparece no totem (ou digite o ' +
  'código no app Ponto W) e eu acompanho a recarga daqui.';

interface Intencao {
  id: string;
  termos: string[];
  responder: (c: ContextoVolt) => string;
}

const INTENCOES: Intencao[] = [
  {
    id: 'comecar',
    termos: ['como comeco', 'como carrego', 'como funciona', 'como usar', 'como uso', 'comecar', 'iniciar', 'passo a passo', 'carregar meu carro'],
    responder: (c) => {
      if (c.fase === 'espera') {
        return 'É em 4 passos: 1) conecte o cabo na vaga; 2) o totem mostra o QR e o código da recarga; ' +
          '3) leia o QR com a câmera do celular (ou digite o código no app Ponto W); 4) no fim, pague com Pix.';
      }
      if (c.fase === 'qr') {
        return 'Leia o QR da tela com a câmera do celular, ou digite o código no app Ponto W. Ao confirmar, ' +
          'o preço trava e a energia é liberada.';
      }
      if (c.fase === 'indisponivel') return 'Esta vaga não está disponível agora, então ainda não dá para começar aqui.';
      return 'Sua recarga já começou. Posso explicar o tempo, o preço ou como pagar no fim.';
    },
  },
  {
    id: 'qr',
    termos: ['qr', 'qr code', 'o que faco', 'ler o qr', 'digitar o codigo', 'camera', 'codigo'],
    responder: (c) =>
      c.fase === 'qr'
        ? 'Aponte a câmera do celular para o QR da tela: ele abre o app Ponto W já com o código. ' +
          'Também dá para digitar o código (4 letras) no app. Depois é só confirmar o preço.'
        : c.fase === 'espera'
          ? 'O QR e o código aparecem aqui no totem assim que você conecta o cabo na vaga. Cada recarga tem um código novo.'
          : 'O código só serve para começar a recarga. Ela já está em andamento, então não precisa mais dele.',
  },
  {
    id: 'expira',
    termos: ['expira', 'expirou', 'validade', 'vale por quanto tempo', 'quanto tempo vale', 'tempo vale', 'por quanto tempo', 'venceu'],
    responder: () =>
      `O código e o preço valem por ${plural(REGRAS.codigoValidadeMin, 'minuto', 'minutos')} depois que o cabo é conectado. ` +
      'Se passar disso, desconecte o cabo e conecte de novo para gerar um código novo.',
  },
  {
    id: 'sem_app',
    termos: ['sem app', 'nao tenho o app', 'nao tenho app', 'preciso do app', 'sem celular', 'visitante', 'sem cadastro', 'sem conta'],
    responder: (c) =>
      c.fase === 'qr'
        ? 'Sem app, toque em "Sem app? Carregue e pague aqui com Pix" na tela do QR. O preço trava na hora e você ' +
          'encerra e paga com Pix aqui mesmo, no totem.'
        : 'Dá para carregar sem o app: depois de conectar o cabo, o totem mostra o botão "Sem app? Carregue e pague aqui ' +
          'com Pix". Com o app Ponto W você acompanha e encerra pelo celular.',
  },
  {
    id: 'tempo',
    termos: ['quanto falta', 'falta muito', 'tempo', 'demora', 'quando termina', 'acaba', 'pronto', 'minuto', 'minutos'],
    responder: (c) => {
      if (c.fase === 'pagar' || c.fase === 'pago') return 'A recarga já terminou.';
      if (!temRecarga(c)) return SEM_RECARGA;
      const bateria = `A bateria está em cerca de ${num(c.sessao.socAtual)}% (estimativa)`;
      if (c.fase === 'pausada') return `${bateria}, mas a recarga está pausada agora, então não consigo estimar o tempo.`;
      if (c.minutosRestantes == null) return `${bateria}. Em instantes eu calculo o tempo até 100%.`;
      return `Faltam cerca de ${minutosTexto(c.minutosRestantes)} para chegar a 100%. ${bateria} e o carregador entrega ` +
        `${num(c.sessao.potenciaAtualKW, 1)} kW agora.`;
    },
  },
  {
    id: 'preco',
    termos: ['preco', 'caro', 'custa', 'tarifa', 'kwh', 'valor do kwh', 'quanto custa', 'pode mudar', 'preco muda', 'travado', 'trava'],
    responder: (c) => {
      if (temRecarga(c)) {
        return `O preço travou em ${tarifaKWh(c.sessao.tarifaAplicadaKWh)} quando a recarga começou e não muda até o fim. ` +
          'O valor total depende só da energia entregue.';
      }
      const preco = c.precoAgoraKWh != null ? `Agora o preço está ${tarifaKWh(c.precoAgoraKWh)}. ` : '';
      if (c.fase === 'qr') {
        return `${preco}Esse preço vale pelo tempo do código. Ao confirmar a recarga ele trava e não muda mais até o fim.`;
      }
      return `${preco}O preço varia com o horário e com a lotação do ponto, e trava quando você confirma a recarga.`;
    },
  },
  {
    id: 'gasto',
    termos: ['quanto vou pagar', 'quanto ja gastei', 'gastei', 'quanto deu', 'quanto fica', 'quanto estou pagando', 'total'],
    responder: (c) => {
      if (c.fase === 'pagar' || c.fase === 'pago') {
        return c.valorConta != null ? `O total da recarga é ${brl(c.valorConta)}.` : 'O total da recarga aparece na tela.';
      }
      if (!temRecarga(c)) {
        return 'Você paga só a energia que o carro receber, pelo preço do kWh que trava ao confirmar a recarga. ' +
          (c.precoAgoraKWh != null ? `Agora o preço está ${tarifaKWh(c.precoAgoraKWh)}.` : '');
      }
      const limite = c.sessao.limiteValor ? ` O limite que você definiu é ${brl(c.sessao.limiteValor)}.` : '';
      return `Até agora são ${num(c.sessao.energiaKWh, 2)} kWh, ${brl(c.sessao.custoAcumulado)}, ` +
        `a ${tarifaKWh(c.sessao.tarifaAplicadaKWh)}.${limite}`;
    },
  },
  {
    id: 'falha_pagamento',
    termos: ['falhar', 'falhou', 'falha', 'nao passou', 'recusado', 'erro no pagamento', 'pagamento falhar', 'pagamento falhou', 'deu erro'],
    responder: () =>
      'Sem susto: a conta continua aberta na tela. Leia o QR do Pix de novo, ou chame um atendente da loja para ajudar.',
  },
  {
    // antes de 'pagamento': quem pergunta de cartão precisa ouvir que é só Pix, mesmo na tela do QR
    id: 'cartao',
    termos: ['cartao', 'aceita cartao', 'credito', 'debito', 'apple pay', 'google pay', 'paypal', 'dinheiro'],
    responder: () =>
      'Por enquanto o pagamento é só por Pix: o totem mostra o QR com o valor exato e você paga pelo app do seu banco. ' +
      'Cartão e carteiras digitais ainda não estão disponíveis.',
  },
  {
    id: 'pagamento',
    termos: ['pagar', 'pagamento', 'pago', 'como eu pago', 'pix', 'cupom'],
    responder: (c) => {
      if (c.fase === 'pagar') {
        return 'O QR do Pix está na tela, com o valor exato. Abra o app do seu banco, leia o QR e confirme. ' +
          'Quando o pagamento for confirmado, o totem avisa que você pode desconectar.';
      }
      if (c.fase === 'pago') return 'O pagamento já foi confirmado. Obrigado!';
      return 'O pagamento é só por Pix. Quando a recarga termina, o totem mostra o QR do Pix com o valor exato: ' +
        'abra o app do seu banco e leia. Cartão e carteiras digitais ainda não estão disponíveis.';
    },
  },
  {
    id: 'pausa',
    termos: ['pausou', 'pausada', 'pausa', 'parou', 'por que pausou', 'esta pausada'],
    responder: (c) => {
      const motivo = c.sessao?.motivoPausa ? ` Motivo: ${c.sessao.motivoPausa}.` : '';
      if (c.fase === 'pausada') {
        return `Pausei porque o controle de demanda do ponto precisou proteger a entrada elétrica.${motivo} ` +
          'Você não paga enquanto a recarga está pausada, e ela volta sozinha quando houver potência livre.';
      }
      return 'Se a entrada elétrica do ponto ficar no limite, o controle de demanda pausa ou reduz a recarga por um tempo. ' +
        'Você não paga enquanto está pausada, e ela volta sozinha.';
    },
  },
  {
    id: 'encerrar',
    termos: ['encerrar', 'encerro', 'como encerro', 'parar', 'terminar', 'finalizar', 'cancelar'],
    responder: (c) => {
      if (c.fase === 'pagar' || c.fase === 'pago' || c.fase === 'encerrando') return 'A recarga já foi encerrada.';
      if (!temRecarga(c)) return SEM_RECARGA;
      if (!c.sessao.visitante) {
        return 'Encerre pelo app Ponto W, na tela da recarga. Quando a conta fechar, o Pix aparece no app e aqui no totem.';
      }
      return c.fase === 'iniciando'
        ? 'A recarga está começando. O botão "Encerrar recarga" aparece aqui no totem assim que a energia for liberada.'
        : 'Toque em "Encerrar recarga" aqui no totem. Eu fecho a conta e mostro o QR do Pix.';
    },
  },
  {
    id: 'potencia',
    termos: ['lento', 'devagar', 'potencia', 'kw', 'reduziu', 'por que cai', 'varia', 'demorando'],
    responder: (c) => {
      const agora = temRecarga(c) && EM_RECARGA.includes(c.fase)
        ? `Agora são ${num(c.sessao.potenciaAtualKW, 1)} kW. ` : '';
      return `${agora}A potência depende do que o seu carro aceita e do controle de demanda do ponto, que divide a ` +
        'energia da entrada elétrica entre os carros e o comércio para não sobrecarregar.';
    },
  },
  {
    id: 'seguranca',
    termos: ['seguro', 'seguranca', 'risco', 'chuva', 'choque', 'estraga', 'danifica'],
    responder: () =>
      'O carregador só libera a energia depois de se comunicar com o carro. ' +
      'Se notar algo estranho no cabo ou na vaga, não use e chame um atendente da loja.',
  },
  {
    id: 'sair',
    termos: ['sair do carro', 'posso sair', 'esperar', 'banheiro', 'compra', 'loja', 'cafe', 'me afastar', 'posso me afastar', 'afastar', 'deixar o carro'],
    responder: (c) => {
      if (temRecarga(c) && c.sessao.visitante) {
        return 'Pode se afastar: a recarga continua sozinha. Volte aqui no totem para encerrar e pagar com Pix.';
      }
      if (noApp(c) || temRecarga(c)) {
        return 'Pode se afastar: a recarga continua sozinha e você acompanha pelo app Ponto W. Aproveite o comércio do ponto.';
      }
      return 'Pode se afastar depois que a recarga começar: ela continua sozinha. Aproveite o comércio do ponto.';
    },
  },
  {
    id: 'desconectar',
    termos: ['desconectar', 'ja posso desconectar', 'tirar o cabo', 'retirar o cabo', 'soltar o cabo'],
    responder: (c) =>
      c.fase === 'pago' ? 'Sim: o pagamento foi confirmado, pode desconectar o cabo.'
        : c.fase === 'pagar' ? 'Primeiro pague o Pix. Quando for confirmado, o totem avisa que pode desconectar.'
          : temRecarga(c) ? 'Encerre a recarga antes de tirar o cabo, para a conta fechar certinha.'
            : 'O cabo só precisa ser retirado quando a recarga terminar e o pagamento for confirmado.',
  },
  {
    id: 'resumo',
    termos: ['resumo', 'recibo', 'comprovante', 'nota fiscal'],
    responder: (c) =>
      c.fase === 'pago'
        ? 'Aqui na tela está o resumo da recarga: energia entregue, valor, duração e preço do kWh.'
        : 'Quando o pagamento é confirmado, o totem mostra o resumo da recarga: energia entregue, valor, duração e preço do kWh.',
  },
  {
    id: 'conector',
    termos: ['conector', 'plugue', 'plug', 'ccs', 'type 2', 'tipo 2', 'cabo', 'encaixa'],
    responder: (c) => {
      const potencia = c.potenciaVagaKW ? ` com até ${num(c.potenciaVagaKW)} kW` : '';
      return `As vagas deste ponto usam conector Tipo 2, o padrão dos carros elétricos no Brasil${potencia}. ` +
        'Encaixe até o clique: o totem reconhece o carro e mostra o QR.';
    },
  },
  {
    // os pontos não têm geração própria: quem pergunta de onde vem a energia ouve só isso
    id: 'energia',
    termos: ['de onde vem a energia', 'solar', 'painel', 'sustentavel', 'energia limpa'],
    responder: () => 'A energia vem da rede da distribuidora, a mesma que abastece a loja.',
  },
  {
    id: 'horario',
    termos: ['melhor horario', 'mais barato', 'economizar', 'desconto', 'que horas', 'horario'],
    responder: () => {
      const pico = janelas((h) => faixaDaHora(h).faixa === 'PICO');
      const vale = janelas((h) => faixaDaHora(h).faixa === 'VALE');
      const picoTxt = pico.length ? `sobe no pico dos dias úteis (${textoJanelas(pico)})` : 'varia com a demanda';
      const valeTxt = vale.length ? ` e fica menor à noite e de manhã cedo (${textoJanelas(vale)})` : '';
      return `O preço do kWh muda ao longo do dia: ${picoTxt}${valeTxt}. Quando o ponto está cheio, o preço também sobe um pouco.`;
    },
  },
  {
    id: 'vagas',
    termos: ['vaga', 'livre', 'fila', 'ocupado', 'disponivel', 'tem vaga'],
    responder: (c) => {
      const livres = c.vagasLivres === 1 ? '1 vaga livre' : `${c.vagasLivres} vagas livres`;
      return `Agora ${c.vagasLivres === 0 ? 'não há vaga livre' : `há ${livres}`} neste ponto (${c.totalVagas} no total). ` +
        'No app do motorista dá para ver outros pontos da rede com vaga e preço agora.';
    },
  },
  {
    id: 'outro_ponto',
    termos: ['outro ponto', 'outros pontos', 'perto', 'por perto', 'proximo', 'mapa'],
    responder: () =>
      'No app do motorista, a tela "Onde carregar" mostra os pontos da rede com vagas livres e o preço do kWh agora.',
  },
  {
    id: 'quando_volta',
    termos: ['quando volta', 'quando vai voltar', 'manutencao', 'fora do ar', 'volta quando'],
    responder: () =>
      'Não sei dizer quando volta: quem cuida disso é a equipe do ponto. Chame um atendente da loja e, se for urgente, ' +
      'veja no app do motorista outro ponto com vaga livre.',
  },
  {
    id: 'suporte',
    termos: ['ajuda', 'socorro', 'suporte', 'problema', 'atendimento', 'atendente', 'humano', 'telefone', 'travou'],
    responder: (c) =>
      `Chame um atendente da loja (${c.ponto.nome}) e diga o número da vaga. Ele consegue ajudar com o carregador e com o pagamento.`,
  },
  {
    id: 'saudacao',
    termos: ['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'e ai', 'tudo bem'],
    responder: (c) =>
      `Oi! Sou o Volt, assistente do ${c.ponto.nome}. Posso explicar como carregar, o preço, o pagamento e a segurança.`,
  },
  {
    id: 'agradecimento',
    termos: ['obrigado', 'obrigada', 'valeu', 'show', 'legal', 'perfeito'],
    responder: () => 'Por nada! Boa recarga e boa viagem.',
  },
];

// ---------------------------------------------------------------- perguntas e saudação por fase
const PERGUNTAS: Record<FaseVolt, string[]> = {
  espera: ['Como começo a carregar?', 'Quanto custa o kWh?', 'Como eu pago?', 'Tem vaga livre?', 'Preciso do app?'],
  qr: ['O que faço com este QR?', 'Não tenho o app. E agora?', 'O preço pode mudar?', 'Por quanto tempo vale o código?'],
  iniciando: ['Quanto custa o kWh?', 'Posso me afastar?', 'Como encerro?'],
  carga: ['Quanto falta?', 'Quanto vou pagar?', 'Posso me afastar?', 'Como encerro?', 'Por que a potência varia?'],
  pausada: ['Por que pausou?', 'Pago enquanto está pausada?', 'Quanto falta?'],
  encerrando: ['Quando eu pago?', 'Como eu pago?'],
  pagar: ['Como eu pago?', 'E se o pagamento falhar?', 'Aceita cartão?', 'Já posso desconectar?'],
  pago: ['Já posso desconectar?', 'Onde vejo o resumo?'],
  indisponivel: ['Quando volta?', 'Tem outro ponto por perto?', 'Chamar atendente'],
};

/** perguntas que o totem oferece em cada fase (sem campo de texto: só toque) */
export const perguntasDaFase = (fase: FaseVolt): string[] => PERGUNTAS[fase];

/** Abertura da conversa, calculada para a fase atual; só cita número de recarga quando há recarga. */
export function saudacaoVolt(c: ContextoVolt): RespostaVolt {
  const sugestoes = PERGUNTAS[c.fase];
  const preco = c.precoAgoraKWh != null ? ` O preço está ${tarifaKWh(c.precoAgoraKWh)} agora.` : '';
  let texto: string;
  switch (c.fase) {
    case 'espera': {
      const livres = c.totalVagas === 0 ? ''
        : c.vagasLivres === 0 ? ` Nenhuma das ${c.totalVagas} vagas está livre agora.`
          : ` Há ${c.vagasLivres} de ${c.totalVagas} vagas livres.`;
      texto = 'Oi! Sou o Volt. Para carregar: conecte o cabo na vaga, o totem mostra o QR e o código, e você lê o QR ' +
        `com o celular.${preco}${livres}`;
      break;
    }
    case 'qr':
      texto = 'Oi! O carro já está conectado. Leia o QR com a câmera do celular ou digite o código no app Ponto W.' +
        `${preco} Sem app, dá para carregar e pagar aqui com Pix.`;
      break;
    case 'iniciando':
      texto = 'Tudo certo! Estou liberando a energia. Em instantes a recarga começa.';
      break;
    case 'carga':
      if (temRecarga(c)) {
        const falta = c.minutosRestantes != null ? ` Faltam cerca de ${minutosTexto(c.minutosRestantes)} para 100%.` : '';
        texto = `Sua recarga está em cerca de ${num(c.sessao.socAtual)}% (estimativa) e já entregou ` +
          `${num(c.sessao.energiaKWh, 1)} kWh.${falta}`;
      } else texto = 'Oi! Sou o Volt. Posso explicar como carregar, o preço e o pagamento.';
      break;
    case 'pausada':
      texto = 'Sua recarga está pausada pelo controle de demanda do ponto. Você não paga enquanto ela está pausada.';
      break;
    case 'encerrando':
      texto = 'Estou fechando a conta. Em instantes aparece o Pix.';
      break;
    case 'pagar':
      texto = c.valorConta != null
        ? `Falta só o pagamento: ${brl(c.valorConta)} por Pix. Abra o app do banco e leia o QR da tela.`
        : 'Falta só o pagamento por Pix. Abra o app do banco e leia o QR da tela.';
      break;
    case 'pago':
      texto = 'Pagamento confirmado. Pode desconectar o cabo. Obrigado por carregar no Ponto W!';
      break;
    default:
      texto = 'Oi! Esta vaga não está disponível agora. Chame um atendente da loja ou veja outro ponto no app do motorista.';
  }
  return { texto, sugestoes, intencao: 'saudacao_fase' };
}

export function responderVolt(pergunta: string, c: ContextoVolt): RespostaVolt {
  const texto = normalizar(pergunta);

  // pontua cada intenção pela soma dos termos que casaram (frase longa pesa mais que palavra solta)
  let melhor: { intencao: Intencao; peso: number } | null = null;
  for (const intencao of INTENCOES) {
    let peso = 0;
    for (const termo of intencao.termos) {
      const alvo = normalizar(termo).replace(/[^a-z0-9 ]/g, '');
      // palavra inteira: "oi" não casa com "dois" nem com "noite"
      if (new RegExp(`(^|[^a-z0-9])${alvo}($|[^a-z0-9])`).test(texto)) peso += alvo.length;
    }
    if (peso > 0 && (!melhor || peso > melhor.peso)) melhor = { intencao, peso };
  }

  if (melhor) return { texto: melhor.intencao.responder(c), sugestoes: PERGUNTAS[c.fase], intencao: melhor.intencao.id };

  return {
    texto:
      'Essa eu não sei responder sozinho. Chame um atendente da loja. Enquanto isso, posso explicar como carregar, ' +
      'o preço, o pagamento e a segurança.',
    sugestoes: PERGUNTAS[c.fase],
    intencao: 'desconhecida',
  };
}
