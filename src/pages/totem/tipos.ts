import type { ReactNode } from 'react';
import type { Cobranca, Ponto, Sessao, Veiculo } from '../../domain/types';
import type { ComposicaoTarifa } from '../../domain/engine/tarifa';
import type { VagaVista } from '../../domain/engine/totem';

/** o que cada tela entrega ao layout: o estado grande, os números e a ação (cada um vai para o seu canto da grade) */
export interface Partes {
  estado: ReactNode;
  numeros?: ReactNode;
  acao?: ReactNode;
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
  /** fração da demanda do ponto coberta por sol e bateria; null quando o ponto não tem solar */
  solar: number | null;
  /** minicurva de potência (só com 3 pontos ou mais) */
  serie: number[] | null;
  ocupado: boolean;
  pedir: (p: Pedido) => void;
  simularPagamento: () => void;
  simularCarro: (vagaId: string) => void;
  retirarCabo: (vagaId: string) => void;
}
