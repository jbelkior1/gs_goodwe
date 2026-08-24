/**
 * Ponto W — modelo de dados
 * Base "falsa" (mock) que espelha o que a plataforma real receberia do
 * EV Charger GoodWe (linha HCA G2) via Modbus + da nossa camada de sessão.
 */

// ---------------------------------------------------------------- geografia
export type UF = 'SP' | 'RJ' | 'MG' | 'PR' | 'SC' | 'RS' | 'BA' | 'PE' | 'DF' | 'GO';

export interface Regiao {
  id: string;
  uf: UF;
  cidade: string;
  zona: string;
  /** tarifa de energia paga pelo comércio à distribuidora (R$/kWh, com impostos) */
  custoEnergiaKWh: number;
  /** índice 0–1 de densidade de veículos elétricos na região */
  densidadeEV: number;
}

// ---------------------------------------------------------------- hardware
export type TipoCarregador = 'GW7K-HCA-20' | 'GW11K-HCA-20' | 'GW22K-HCA-20';

export interface ModeloCarregador {
  id: TipoCarregador;
  potenciaKW: number;
  fases: 1 | 3;
  tensaoV: number;
  correnteMaxA: number;
  conector: 'Tipo 2 (IEC 62196-2)';
  protocolos: string[];
  /** OCPP não é suportado na linha HCA — fica registrado no catálogo */
  suportaOCPP: boolean;
}

export type EstadoCarregador =
  | 'DISPONIVEL'
  | 'OCUPADO'
  | 'PAUSADO'
  | 'OFFLINE'
  | 'MANUTENCAO';

export interface Carregador {
  id: string;
  pontoId: string;
  apelido: string;
  modelo: TipoCarregador;
  estado: EstadoCarregador;
  /** potência que o motor de demanda está permitindo agora (kW) */
  potenciaPermitidaKW: number;
  firmware: string;
  ultimoHeartbeat: string;
}

// ---------------------------------------------------------------- rede
export type FormatoFranquia = 'Light' | 'Standard' | 'Hub';
export type SegmentoComercio =
  | 'Café / Restaurante'
  | 'Mercado'
  | 'Farmácia'
  | 'Shopping'
  | 'Posto'
  | 'Clínica'
  | 'Loja de rua';

export interface Franqueado {
  id: string;
  nome: string;
  razaoSocial: string;
  cnpj: string;
  desde: string;
}

export interface Ponto {
  id: string;
  nome: string;
  franqueadoId: string;
  regiaoId: string;
  endereco: string;
  formato: FormatoFranquia;
  segmento: SegmentoComercio;
  /** limite elétrico da entrada do comércio — base do controle de demanda */
  limiteCorrenteA: number;
  limitePotenciaKW: number;
  /** carga do próprio comércio (geladeiras, luzes...), varia ao longo do dia */
  cargaBaseKW: number;
  precoBaseKWh: number;
  ativo: boolean;
  /** ecossistema GoodWe instalado no ponto (inversor + FV, opcionalmente bateria) */
  temSolar: boolean;
  potenciaFVkWp: number;
  temBateria: boolean;
  capacidadeBateriaKWh: number;
  inauguradoEm: string;
  lat: number;
  lng: number;
}

// ---------------------------------------------------------------- usuários
export interface Veiculo {
  id: string;
  montadora: string;
  modelo: string;
  capacidadeKWh: number;
  /** limite do carregador de bordo (o carro decide quanto puxa) */
  potenciaMaxACkW: number;
}

export interface Motorista {
  id: string;
  nome: string;
  email: string;
  rfidUid: string;
  veiculoId: string;
  desde: string;
}

// ---------------------------------------------------------------- sessão
export type EstadoSessao =
  | 'AUTENTICADO'
  | 'CARREGANDO'
  | 'PAUSADO'
  | 'CONCLUIDO'
  | 'FATURADO';

export type MeioAutorizacao = 'RFID' | 'APP' | 'QR';

export interface Sessao {
  id: string;
  pontoId: string;
  carregadorId: string;
  motoristaId: string;
  veiculoId: string;
  inicio: string;
  fim?: string;
  socInicial: number;
  socAtual: number;
  energiaKWh: number;
  potenciaAtualKW: number;
  estado: EstadoSessao;
  autorizacao: MeioAutorizacao;
  /** preço travado no início da sessão (transparência exigida pela REN 1.000/2021) */
  tarifaAplicadaKWh: number;
  custoAcumulado: number;
  /** motivo da última redução/pausa imposta pelo controle de demanda */
  motivoPausa?: string;
}

export interface AmostraTelemetria {
  ts: string;
  sessaoId: string;
  tensaoV: number;
  correnteA: number;
  potenciaKW: number;
  soc: number;
  energiaAcumKWh: number;
}

// ---------------------------------------------------------------- dinheiro
export type StatusCobranca = 'PENDENTE' | 'PAGO' | 'FALHOU';

export interface Cobranca {
  id: string;
  sessaoId: string;
  pontoId: string;
  valor: number;
  metodo: 'PIX';
  status: StatusCobranca;
  txid: string;
  criadaEm: string;
  pagaEm?: string;
  // repartição
  custoEnergia: number;
  royaltyGoodWe: number;
  fundoMarketing: number;
  gateway: number;
  liquidoLojista: number;
}

// ---------------------------------------------------------------- homologação
export type StatusHomologacao =
  | 'ANALISE'
  | 'VISTORIA'
  | 'APROVADO'
  | 'REPROVADO'
  | 'PENDENTE_DOC';

export interface SolicitacaoHomologacao {
  id: string;
  comercio: string;
  cnpj: string;
  regiaoId: string;
  segmento: SegmentoComercio;
  formatoDesejado: FormatoFranquia;
  /** carga elétrica disponível declarada pelo comerciante (kW) */
  cargaDisponivelKW: number;
  fluxoDiarioPessoas: number;
  status: StatusHomologacao;
  criadoEm: string;
  /** 0–100, calculado pela IA — potencial do ponto */
  scoreViabilidade: number;
  horasUsoPrevistas: number;
  parecer: string;
}

// ---------------------------------------------------------------- IA
export interface PrevisaoHora {
  hora: number;
  ocupacaoPrevista: number;
  energiaPrevistaKWh: number;
}

export interface Recomendacao {
  id: string;
  pontoId?: string;
  severidade: 'info' | 'atencao' | 'critico';
  titulo: string;
  detalhe: string;
  /** qual decisão do sistema essa recomendação muda */
  decisao: string;
}

export interface Anomalia {
  id: string;
  pontoId: string;
  carregadorId?: string;
  tipo: string;
  detectadaEm: string;
  detalhe: string;
}

// ---------------------------------------------------------------- agregados
export interface KPIsPonto {
  pontoId: string;
  energiaMesKWh: number;
  sessoesMes: number;
  faturamentoMes: number;
  custoEnergiaMes: number;
  royaltiesMes: number;
  liquidoMes: number;
  horasUsoDia: number;
  ocupacaoPct: number;
  ticketMedio: number;
}
