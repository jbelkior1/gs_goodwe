/**
 * Regras do pedido de franquia (tela /seja-goodwe), sem React: máscara e validação do CNPJ e a linha do
 * tempo do pedido. Fica separado para poder ser testado com tsx.
 */
import { dataHora } from '../domain/formato';
import type { SolicitacaoHomologacao } from '../domain/types';

// ------------------------------------------------------------------ CNPJ
export const soDigitos = (s: string): string => s.replace(/\D/g, '');

/** 12.345.678/0001-95, formatado enquanto a pessoa digita (aceita colar com ou sem pontuação). */
export function mascaraCNPJ(s: string): string {
  const d = soDigitos(s).slice(0, 14);
  const partes = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 8), d.slice(8, 12), d.slice(12, 14)];
  let r = partes[0];
  if (partes[1]) r += `.${partes[1]}`;
  if (partes[2]) r += `.${partes[2]}`;
  if (partes[3]) r += `/${partes[3]}`;
  if (partes[4]) r += `-${partes[4]}`;
  return r;
}

/** 14 dígitos, não repetidos, com os dois dígitos verificadores corretos. */
export function cnpjValido(s: string): boolean {
  const d = soDigitos(s);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const digito = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = [...base].reduce((t, c, i) => t + Number(c) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = digito(d.slice(0, 12));
  return d1 === Number(d[12]) && digito(d.slice(0, 13)) === Number(d[13]);
}

// ------------------------------------------------------------------ etapas do fluxo
/** As 7 etapas da franquia, na ordem do fluxograma do produto. `quem` diz de quem é a vez. */
export const ETAPAS_FRANQUIA = [
  { chave: 'pedido', titulo: 'Pedido', quem: 'Você', texto: 'Você preenche o formulário e a IA calcula o potencial do seu ponto.' },
  { chave: 'analise', titulo: 'Análise da GoodWe', quem: 'GoodWe', texto: 'A equipe revisa o pedido, o score e a capacidade elétrica.' },
  { chave: 'vistoria', titulo: 'Vistoria', quem: 'GoodWe', texto: 'Visita técnica ao local para conferir a entrada de energia e o espaço das vagas.' },
  { chave: 'aprovacao', titulo: 'Aprovação (COF)', quem: 'GoodWe', texto: 'A GoodWe aprova e formaliza a concessão. O seu ponto é criado.' },
  { chave: 'configurar', titulo: 'Configurar o ponto', quem: 'Você', texto: 'Você define as vagas e a tarifa do kWh.' },
  { chave: 'totem', titulo: 'Parear o totem', quem: 'Você', texto: 'O totem mostra um código de 6 dígitos; você digita no painel para ligar os dois.' },
  { chave: 'ativar', titulo: 'Ativar', quem: 'Você', texto: 'Ao ativar, o ponto aparece no mapa do motorista e começa a vender recarga.' },
] as const;

export type EstadoEtapa = 'feita' | 'atual' | 'pendente' | 'bloqueada';
export interface EtapaDoPedido { chave: string; titulo: string; texto: string; estado: EstadoEtapa }

type PedidoMinimo = Pick<SolicitacaoHomologacao, 'status' | 'criadoEm' | 'scoreViabilidade' | 'parecer'>;

/**
 * Linha do tempo do pedido a partir do status da GoodWe (e do status do ponto, depois de aprovado).
 * O pareamento do totem e a ativação acontecem no painel do franqueado; enquanto o ponto não está
 * ativo, a etapa "Configurar o ponto" é a da vez.
 */
export function linhaDoTempo(h: PedidoMinimo, pontoStatus?: 'INSTALACAO' | 'ATIVO' | 'SUSPENSO'): EtapaDoPedido[] {
  const base = (chave: string) => ETAPAS_FRANQUIA.find((e) => e.chave === chave)!;
  const item = (chave: string, estado: EstadoEtapa, texto?: string): EtapaDoPedido => {
    const e = base(chave);
    return { chave, titulo: e.titulo, texto: texto ?? e.texto, estado };
  };
  const score = `Score ${Math.round(h.scoreViabilidade)} de 100.`;
  const enviado = item('pedido', 'feita', `Enviado em ${dataHora(h.criadoEm)}.`);

  if (h.status === 'REPROVADO') {
    return [
      enviado,
      item('analise', 'feita', score),
      { chave: 'decisao', titulo: 'Pedido reprovado', texto: h.parecer || 'A GoodWe não aprovou este ponto agora. Você pode ajustar os dados e enviar um novo pedido.', estado: 'bloqueada' },
    ];
  }

  if (h.status === 'ANALISE' || h.status === 'PENDENTE_DOC') {
    const faltaDoc = h.status === 'PENDENTE_DOC';
    return [
      enviado,
      item('analise', 'atual', faltaDoc ? `${score} A GoodWe pediu documentos: responda ao contato da equipe.` : `${score} A equipe da GoodWe está revisando o seu pedido.`),
      item('vistoria', 'pendente'),
      item('aprovacao', 'pendente'),
      item('configurar', 'pendente'),
      item('totem', 'pendente'),
      item('ativar', 'pendente'),
    ];
  }

  if (h.status === 'VISTORIA') {
    return [
      enviado,
      item('analise', 'feita', score),
      item('vistoria', 'atual', 'A GoodWe vai agendar a visita técnica ao seu local.'),
      item('aprovacao', 'pendente'),
      item('configurar', 'pendente'),
      item('totem', 'pendente'),
      item('ativar', 'pendente'),
    ];
  }

  // APROVADO: o ponto existe; o que falta é com o franqueado
  const ativo = pontoStatus === 'ATIVO';
  return [
    enviado,
    item('analise', 'feita', score),
    item('vistoria', 'feita'),
    item('aprovacao', 'feita', 'Franquia concedida. O seu ponto já foi criado.'),
    item('configurar', ativo ? 'feita' : 'atual'),
    item('totem', ativo ? 'feita' : 'pendente'),
    item('ativar', ativo ? 'feita' : 'pendente', ativo ? 'Ponto ativo e aparecendo no mapa do motorista.' : undefined),
  ];
}
