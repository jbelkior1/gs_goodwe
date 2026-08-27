import type { Ponto, Sessao } from '../types';

/**
 * "Volt" — assistente do totem.
 *
 * Roda inteiro no navegador, em cima dos dados da própria sessão: nada de
 * chave de API para a demo funcionar. A intenção é reconhecida por palavras
 * do jeito que o motorista fala ("tá caro?", "falta muito?") e a resposta é
 * calculada com o número real da recarga em andamento — nunca texto fixo.
 */

export interface ContextoVolt {
  ponto: Ponto;
  sessao: Pick<Sessao, 'socAtual' | 'energiaKWh' | 'potenciaAtualKW' | 'tarifaAplicadaKWh' | 'custoAcumulado'>;
  /** minutos estimados até o alvo de carga */
  minutosRestantes: number;
  /** fração da energia do ponto que veio de sol + bateria (0–1) */
  autossuficiencia: number;
  vagasLivres: number;
  totalVagas: number;
}

export interface RespostaVolt {
  texto: string;
  /** sugestões de próxima pergunta, mostradas como chips */
  sugestoes?: string[];
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const nf = (v: number, casas = 1) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** tira acento e caixa para o casamento de palavra não depender de digitação. */
const normalizar = (t: string) =>
  t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

interface Intencao {
  id: string;
  termos: string[];
  responder: (c: ContextoVolt) => RespostaVolt;
}

const INTENCOES: Intencao[] = [
  {
    id: 'tempo',
    termos: ['quanto falta', 'falta muito', 'tempo', 'demora', 'quando termina', 'acaba', 'pronto', 'minuto'],
    responder: (c) => ({
      texto:
        `Faltam cerca de ${Math.max(1, Math.round(c.minutosRestantes))} minutos para chegar em 80%. ` +
        `A bateria está em ${Math.round(c.sessao.socAtual)}% e o carregador está entregando ` +
        `${nf(c.sessao.potenciaAtualKW)} kW agora.`,
      sugestoes: ['Por que a potência cai no fim?', 'Quanto vou pagar?'],
    }),
  },
  {
    id: 'preco',
    termos: ['preco', 'preço', 'caro', 'custa', 'tarifa', 'valor', 'kwh', 'quanto vou pagar', 'quanto ja gastei', 'gastei'],
    responder: (c) => ({
      texto:
        `O preço foi travado em ${brl(c.sessao.tarifaAplicadaKWh)} por kWh quando você iniciou — ` +
        `ele não muda no meio da recarga. Até agora são ${nf(c.sessao.energiaKWh, 2)} kWh, ` +
        `${brl(c.sessao.custoAcumulado)}.`,
      sugestoes: ['Como eu pago?', 'Quanto falta?'],
    }),
  },
  {
    id: 'pagamento',
    termos: ['pagar', 'pagamento', 'pix', 'cartao', 'cartão', 'apple pay', 'google pay', 'paypal', 'nota', 'recibo', 'cupom'],
    responder: () => ({
      texto:
        'Quando você encerrar, o totem abre a tela de pagamento com PIX, Apple Pay, Google Pay ou PayPal. ' +
        'O conector destrava sozinho assim que o pagamento é confirmado e o recibo vai para o seu e-mail.',
      sugestoes: ['E se o pagamento falhar?', 'Quanto vou pagar?'],
    }),
  },
  {
    id: 'falha_pagamento',
    termos: ['falhar', 'falhou', 'nao passou', 'não passou', 'recusado', 'erro no pagamento'],
    responder: () => ({
      texto:
        'Sem susto: a sessão fica reservada por 5 minutos e você pode escolher outro método na mesma tela. ' +
        'Se ainda assim não passar, o atendimento da rede assume pelo botão de suporte e libera o conector.',
      sugestoes: ['Como eu pago?'],
    }),
  },
  {
    id: 'potencia',
    termos: ['lento', 'devagar', 'caiu', 'potencia', 'potência', 'kw', 'reduziu', 'por que cai', 'demorando'],
    responder: (c) => ({
      texto:
        `Agora estamos em ${nf(c.sessao.potenciaAtualKW)} kW. Acima de 80% de bateria é o próprio carro que ` +
        'pede menos corrente para proteger as células (curva CC/CV) — e, em horário de pico, o controle de ' +
        'demanda do ponto pode dividir potência entre os carregadores para não derrubar a entrada elétrica.',
      sugestoes: ['Quanto falta?', 'Isso é seguro?'],
    }),
  },
  {
    id: 'seguranca',
    termos: ['seguro', 'seguranca', 'segurança', 'risco', 'chuva', 'choque', 'estraga', 'danifica'],
    responder: () => ({
      texto:
        'É seguro. O carregador só energiza depois do "aperto de mão" com o carro, monitora fuga de corrente e ' +
        'temperatura o tempo todo e corta em milissegundos se algo sair do esperado. Pode chover que o conector é vedado.',
      sugestoes: ['Posso sair do carro?'],
    }),
  },
  {
    id: 'sair',
    termos: ['sair do carro', 'posso sair', 'esperar', 'banheiro', 'compra', 'loja', 'cafe', 'café'],
    responder: () => ({
      texto:
        'Pode sair tranquilo. O conector fica travado no carro durante a recarga e a sessão continua sozinha. ' +
        'Aproveite o comércio aqui do ponto — o totem avisa na tela quando terminar.',
      sugestoes: ['Quanto falta?'],
    }),
  },
  {
    id: 'conector',
    termos: ['conector', 'plugue', 'plug', 'ccs', 'type 2', 'tipo 2', 'cabo', 'encaixa'],
    responder: (c) => ({
      texto:
        `Este ponto é ${c.ponto.formato} e atende os conectores padrão do mercado brasileiro (Type 2 em AC e CCS2 em DC). ` +
        'Encaixe até o clique: o totem reconhece o carro e mostra o preço antes de começar.',
      sugestoes: ['Isso é seguro?', 'Quanto custa o kWh?'],
    }),
  },
  {
    id: 'solar',
    termos: ['solar', 'sol', 'painel', 'bateria do ponto', 'sustentavel', 'sustentável', 'co2', 'limpa', 'verde'],
    responder: (c) => ({
      texto:
        `Neste ponto, ${Math.round(c.autossuficiencia * 100)}% da energia entregue hoje veio de sol e bateria GoodWe. ` +
        'O resto vem da rede. É por isso que a recarga aqui sai mais barata em pleno meio-dia.',
      sugestoes: ['Qual o melhor horário para carregar?'],
    }),
  },
  {
    id: 'horario',
    termos: ['melhor horario', 'melhor horário', 'mais barato', 'economizar', 'desconto', 'que horas'],
    responder: () => ({
      texto:
        'Entre 10h e 15h costuma ser o melhor negócio: tem sol gerando no ponto e menos disputa por potência. ' +
        'Das 18h às 21h é o pico — preço mais alto e fila maior.',
      sugestoes: ['Tem vaga agora?'],
    }),
  },
  {
    id: 'vagas',
    termos: ['vaga', 'livre', 'fila', 'ocupado', 'disponivel', 'disponível', 'outro ponto'],
    responder: (c) => ({
      texto:
        `Agora são ${c.vagasLivres} de ${c.totalVagas} vagas livres aqui no ${c.ponto.nome}. ` +
        'No app do motorista dá para ver os pontos vizinhos com vaga e preço em tempo real.',
      sugestoes: ['Qual o melhor horário para carregar?'],
    }),
  },
  {
    id: 'suporte',
    termos: ['ajuda', 'socorro', 'suporte', 'problema', 'atendimento', 'humano', 'telefone', 'travou'],
    responder: (c) => ({
      texto:
        `Chamo o atendimento da rede agora. Informe o ponto ${c.ponto.nome} — o time abre a ocorrência, ` +
        'destrava o conector remotamente e acompanha até resolver. O suporte é 24 h.',
      sugestoes: ['Isso é seguro?'],
    }),
  },
  {
    id: 'saudacao',
    termos: ['oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'e ai', 'e aí', 'tudo bem'],
    responder: (c) => ({
      texto:
        `Oi! Sou o Volt, assistente do ${c.ponto.nome}. Acompanho sua recarga em tempo real — ` +
        'pode perguntar sobre preço, tempo, pagamento ou qualquer dúvida do carro elétrico.',
      sugestoes: ['Quanto falta?', 'Quanto vou pagar?', 'Como eu pago?'],
    }),
  },
  {
    id: 'agradecimento',
    termos: ['obrigado', 'obrigada', 'valeu', 'show', 'legal', 'perfeito'],
    responder: () => ({
      texto: 'Por nada! Fico aqui de olho na sua recarga. Boa viagem quando terminar.',
      sugestoes: ['Quanto falta?'],
    }),
  },
];

/** Abertura do chat, já com o número da sessão em andamento. */
export function saudacaoVolt(c: ContextoVolt): RespostaVolt {
  return {
    texto:
      `Oi! Sua recarga está em ${Math.round(c.sessao.socAtual)}% — faltam ` +
      `${Math.max(1, Math.round(c.minutosRestantes))} min. Em que posso ajudar?`,
    sugestoes: ['Quanto falta?', 'Quanto vou pagar?', 'Como eu pago?', 'Isso é seguro?'],
  };
}

export function responderVolt(pergunta: string, c: ContextoVolt): RespostaVolt {
  const texto = normalizar(pergunta);

  // pontua cada intenção pelo termo mais específico que casou
  let melhor: { intencao: Intencao; peso: number } | null = null;
  for (const intencao of INTENCOES) {
    for (const termo of intencao.termos) {
      const alvo = normalizar(termo);
      if (texto.includes(alvo) && (!melhor || alvo.length > melhor.peso)) {
        melhor = { intencao, peso: alvo.length };
      }
    }
  }

  if (melhor) return melhor.intencao.responder(c);

  return {
    texto:
      'Essa eu ainda não sei responder sozinho — mas posso chamar o atendimento da rede. ' +
      'Enquanto isso, dá para perguntar sobre preço, tempo restante, pagamento, segurança ou energia solar.',
    sugestoes: ['Quanto falta?', 'Quanto vou pagar?', 'Chamar suporte'],
  };
}
