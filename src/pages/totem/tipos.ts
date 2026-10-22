import type { ReactNode } from 'react';
import type { Cobranca, Ponto, Sessao, Veiculo } from '../../domain/types';
import type { ComposicaoTarifa } from '../../domain/engine/tarifa';
import type { VagaVista } from '../../domain/engine/totem';

/**
 * Faixa dos 4 passos da recarga (Conectar · Confirmar · Carregar · Pagar). `n` é o passo atual; os de
 * antes aparecem como feitos. `tom` dá a cor do atual (vermelho = falta o motorista agir, ok = energia
 * correndo ou pago, aviso = parado ou vencido) e `rotulo` troca a palavra do atual ("Pausada").
 */
export interface Etapa {
  n: 1 | 2 | 3 | 4;
  tom?: 'vermelho' | 'ok' | 'aviso';
  rotulo?: string;
  /** palavra do passo 2 já feito quando a recarga é de visitante ("Sem app" em vez de "Confirmado") */
  visitante?: boolean;
  /** o passo atual também já terminou (pago): todos aparecem como feitos */
  concluida?: boolean;
}

/**
 * O que cada tela entrega ao layout, cada parte no seu canto da grade: os passos, o estado grande,
 * os números, a ação (instrução ou botão) e os controles da demonstração.
 */
export interface Partes {
  etapa?: Etapa;
  estado: ReactNode;
  numeros?: ReactNode;
  acao?: ReactNode;
  demo?: ReactNode;
}

/** ações que pedem confirmação antes de gravar */
export type Pedido = 'visitante' | 'encerrar';

/** tudo que as telas precisam para desenhar: já calculado, sem consultar o banco por conta própria */
export interface DadosTela {
  orientacao: 'vertical' | 'horizontal';
  ponto: Ponto;
  agora: number;
  demo: boolean;
  foco?: VagaVista;
  vagas: VagaVista[];
  vagasLivres: number;
  sessao?: Sessao;
  cobranca?: Cobranca;
  veiculo?: Veiculo;
  /** preço do kWh agora (espera) */
  tarifa: ComposicaoTarifa;
  /** preço travado da sessão (QR e carga); sem sessão, o de agora */
  precoKWh: number;
  /** minicurva de potência (só com 3 pontos ou mais) */
  serie: number[] | null;
  ocupado: boolean;
  pedir: (p: Pedido) => void;
  simularPagamento: () => void;
  simularCarro: (vagaId: string) => void;
  retirarCabo: (vagaId: string) => void;
}
