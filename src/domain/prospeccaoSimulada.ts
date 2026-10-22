import type { Candidato, CarregadorExistente, Corredor } from './engine/prospeccao';
import type { SegmentoComercio } from './types';

/**
 * DADOS SIMULADOS da prospecção (MVP). Nada aqui é medição: o traçado das vias é aproximado, o fluxo
 * de veículos é uma estimativa de ordem de grandeza para a demonstração, os "carregadores de terceiros"
 * e os comércios candidatos são genéricos (sem marca e sem endereço exato). A tela diz isso na abertura.
 * Na versão de verdade, cada lista vem de uma fonte: vias e fluxo (contagens da CET/GeoSampa ou API de
 * tráfego), carregadores (OpenChargeMap), candidatos (CNPJ da Receita ou OpenStreetMap).
 */

export const CORREDORES_SIMULADOS: Corredor[] = [
  {
    id: 'marg-tiete', nome: 'Marginal Tietê', fluxoDia: 330_000,
    trajeto: [[-23.5210, -46.7330], [-23.5150, -46.7000], [-23.5110, -46.6650], [-23.5160, -46.6300], [-23.5180, -46.6050], [-23.5250, -46.5800], [-23.5150, -46.5450]],
  },
  {
    id: 'marg-pinheiros', nome: 'Marginal Pinheiros', fluxoDia: 320_000,
    trajeto: [[-23.5280, -46.7420], [-23.5470, -46.7330], [-23.5610, -46.7160], [-23.5720, -46.7040], [-23.5880, -46.6965], [-23.6040, -46.6950], [-23.6200, -46.7020], [-23.6420, -46.7200]],
  },
  {
    id: 'bandeirantes', nome: 'Av. dos Bandeirantes', fluxoDia: 210_000,
    trajeto: [[-23.6060, -46.6900], [-23.6100, -46.6760], [-23.6150, -46.6620], [-23.6180, -46.6480], [-23.6230, -46.6330]],
  },
  {
    id: '23-maio', nome: 'Av. 23 de Maio', fluxoDia: 170_000,
    trajeto: [[-23.5530, -46.6370], [-23.5640, -46.6420], [-23.5760, -46.6470], [-23.5880, -46.6540], [-23.6030, -46.6600], [-23.6170, -46.6620]],
  },
  {
    id: 'radial-leste', nome: 'Radial Leste', fluxoDia: 160_000,
    trajeto: [[-23.5480, -46.6260], [-23.5440, -46.6000], [-23.5420, -46.5750], [-23.5400, -46.5450], [-23.5400, -46.5150]],
  },
  {
    id: 'anhanguera', nome: 'Rod. Anhanguera', fluxoDia: 140_000,
    trajeto: [[-23.4600, -46.7400], [-23.4300, -46.7550], [-23.4000, -46.7720], [-23.3800, -46.7850]],
  },
  {
    id: 'salim', nome: 'Av. Salim Farah Maluf', fluxoDia: 120_000,
    trajeto: [[-23.5280, -46.5820], [-23.5400, -46.5760], [-23.5550, -46.5700], [-23.5700, -46.5650]],
  },
  {
    id: 'washington-luis', nome: 'Av. Washington Luís', fluxoDia: 110_000,
    trajeto: [[-23.6220, -46.6630], [-23.6350, -46.6600], [-23.6500, -46.6620], [-23.6640, -46.6650]],
  },
  {
    id: 'reboucas', nome: 'Av. Rebouças', fluxoDia: 95_000,
    trajeto: [[-23.5582, -46.6705], [-23.5640, -46.6780], [-23.5700, -46.6870], [-23.5760, -46.6950]],
  },
  {
    id: 'paulista', nome: 'Av. Paulista', fluxoDia: 90_000,
    trajeto: [[-23.5553, -46.6624], [-23.5613, -46.6560], [-23.5660, -46.6500], [-23.5712, -46.6446]],
  },
  {
    id: 'santo-amaro', nome: 'Av. Santo Amaro', fluxoDia: 85_000,
    trajeto: [[-23.5870, -46.6770], [-23.6010, -46.6790], [-23.6200, -46.6850], [-23.6400, -46.6950]],
  },
  {
    id: 'faria-lima', nome: 'Av. Faria Lima', fluxoDia: 80_000,
    trajeto: [[-23.5660, -46.6940], [-23.5760, -46.6880], [-23.5860, -46.6830], [-23.5960, -46.6855]],
  },
  {
    id: 'sumare', nome: 'Av. Sumaré', fluxoDia: 75_000,
    trajeto: [[-23.5300, -46.6750], [-23.5380, -46.6780], [-23.5470, -46.6800], [-23.5530, -46.6830]],
  },
  {
    id: 'ibirapuera', nome: 'Av. Ibirapuera', fluxoDia: 70_000,
    trajeto: [[-23.5880, -46.6580], [-23.6000, -46.6640], [-23.6120, -46.6680], [-23.6230, -46.6700]],
  },
  {
    id: 'cruzeiro-sul', nome: 'Av. Cruzeiro do Sul', fluxoDia: 60_000,
    trajeto: [[-23.5200, -46.6270], [-23.5070, -46.6260], [-23.4950, -46.6240]],
  },
  {
    id: 'angelica', nome: 'Av. Angélica', fluxoDia: 55_000,
    trajeto: [[-23.5370, -46.6560], [-23.5450, -46.6580], [-23.5530, -46.6600]],
  },
  {
    id: 'berrini', nome: 'Av. Berrini', fluxoDia: 55_000,
    trajeto: [[-23.5960, -46.6865], [-23.6050, -46.6900], [-23.6150, -46.6950]],
  },
  {
    id: 'giovanni', nome: 'Av. Giovanni Gronchi', fluxoDia: 50_000,
    trajeto: [[-23.5950, -46.7120], [-23.6050, -46.7200], [-23.6150, -46.7300]],
  },
];

/** carregadores de outras empresas (genéricos): é a concorrência que já cobre parte do fluxo */
export const CARREGADORES_TERCEIROS_SIMULADOS: CarregadorExistente[] = [
  { id: 't-paulista', nome: 'Carregador de terceiros · shopping na Paulista', lat: -23.5600, lng: -46.6570, origem: 'terceiro' },
  { id: 't-jardins', nome: 'Carregador de terceiros · hotel nos Jardins', lat: -23.5640, lng: -46.6650, origem: 'terceiro' },
  { id: 't-faria-lima', nome: 'Carregador de terceiros · estacionamento na Faria Lima', lat: -23.5800, lng: -46.6860, origem: 'terceiro' },
  { id: 't-berrini', nome: 'Carregador de terceiros · shopping na Berrini', lat: -23.6080, lng: -46.6930, origem: 'terceiro' },
  { id: 't-ibirapuera', nome: 'Carregador de terceiros · shopping em Moema', lat: -23.6100, lng: -46.6670, origem: 'terceiro' },
  { id: 't-santo-amaro', nome: 'Carregador de terceiros · concessionária na Santo Amaro', lat: -23.6300, lng: -46.6900, origem: 'terceiro' },
  { id: 't-morumbi', nome: 'Carregador de terceiros · shopping no Morumbi', lat: -23.6230, lng: -46.6990, origem: 'terceiro' },
  { id: 't-tatuape', nome: 'Carregador de terceiros · shopping no Tatuapé', lat: -23.5430, lng: -46.5770, origem: 'terceiro' },
  { id: 't-tiete', nome: 'Carregador de terceiros · posto na Marginal Tietê', lat: -23.5160, lng: -46.6300, origem: 'terceiro' },
  { id: 't-vila-mariana', nome: 'Carregador de terceiros · supermercado na Vila Mariana', lat: -23.5890, lng: -46.6380, origem: 'terceiro' },
];

/** clientes por dia de um comércio típico de cada segmento (entra na análise de viabilidade) */
const CLIENTES: Record<SegmentoComercio, number> = {
  Shopping: 1400, Mercado: 900, Posto: 700, Farmácia: 650, 'Café / Restaurante': 500, 'Loja de rua': 400, Clínica: 300,
};

const c = (id: string, nome: string, segmento: SegmentoComercio, corredorId: string, lat: number, lng: number): Candidato =>
  ({ id, nome, segmento, corredorId, lat, lng, clientesDia: CLIENTES[segmento] });

/** comércios genéricos à beira das vias (tipo de negócio + via + bairro, sem marca nem número) */
export const CANDIDATOS_SIMULADOS: Candidato[] = [
  c('c-tiete-limao', 'Posto na Marginal Tietê (Limão)', 'Posto', 'marg-tiete', -23.5120, -46.6700),
  c('c-tiete-vguilherme', 'Atacadista na Marginal Tietê (Vila Guilherme)', 'Mercado', 'marg-tiete', -23.5172, -46.6050),
  c('c-tiete-penha', 'Posto na Marginal Tietê (Penha)', 'Posto', 'marg-tiete', -23.5200, -46.5560),
  c('c-pinheiros-leopoldina', 'Supermercado na Marginal Pinheiros (Vila Leopoldina)', 'Mercado', 'marg-pinheiros', -23.5330, -46.7390),
  c('c-pinheiros-jaguare', 'Posto na Marginal Pinheiros (Jaguaré)', 'Posto', 'marg-pinheiros', -23.5480, -46.7320),
  c('c-pinheiros-socorro', 'Shopping na Marginal Pinheiros (Santo Amaro)', 'Shopping', 'marg-pinheiros', -23.6400, -46.7180),
  c('c-bandeirantes-brooklin', 'Posto na Av. dos Bandeirantes (Brooklin)', 'Posto', 'bandeirantes', -23.6110, -46.6730),
  c('c-bandeirantes-planalto', 'Restaurante na Av. dos Bandeirantes (Planalto Paulista)', 'Café / Restaurante', 'bandeirantes', -23.6200, -46.6420),
  c('c-23maio-paraiso', 'Posto na Av. 23 de Maio (Paraíso)', 'Posto', '23-maio', -23.5700, -46.6440),
  c('c-23maio-ibirapuera', 'Café na Av. 23 de Maio (Ibirapuera)', 'Café / Restaurante', '23-maio', -23.6050, -46.6612),
  c('c-radial-belem', 'Supermercado na Radial Leste (Belém)', 'Mercado', 'radial-leste', -23.5440, -46.6000),
  c('c-radial-carrao', 'Shopping na Radial Leste (Carrão)', 'Shopping', 'radial-leste', -23.5410, -46.5600),
  c('c-radial-vmatilde', 'Farmácia na Radial Leste (Vila Matilde)', 'Farmácia', 'radial-leste', -23.5400, -46.5250),
  c('c-anhanguera-jaragua', 'Posto na Rod. Anhanguera (Jaraguá)', 'Posto', 'anhanguera', -23.4450, -46.7470),
  c('c-salim-analia', 'Shopping na Av. Salim Farah Maluf (Anália Franco)', 'Shopping', 'salim', -23.5560, -46.5700),
  c('c-salim-agua-rasa', 'Posto na Av. Salim Farah Maluf (Água Rasa)', 'Posto', 'salim', -23.5680, -46.5655),
  c('c-wluis-congonhas', 'Shopping na Av. Washington Luís (Congonhas)', 'Shopping', 'washington-luis', -23.6300, -46.6610),
  c('c-wluis-jabaquara', 'Posto na Av. Washington Luís (Jabaquara)', 'Posto', 'washington-luis', -23.6550, -46.6630),
  c('c-reboucas-jardins', 'Farmácia na Av. Rebouças (Jardins)', 'Farmácia', 'reboucas', -23.5620, -46.6750),
  c('c-paulista-consolacao', 'Café na Av. Paulista (Consolação)', 'Café / Restaurante', 'paulista', -23.5560, -46.6615),
  c('c-santo-amaro-brooklin', 'Supermercado na Av. Santo Amaro (Brooklin)', 'Mercado', 'santo-amaro', -23.6180, -46.6850),
  c('c-faria-lima-pinheiros', 'Café na Av. Faria Lima (Pinheiros)', 'Café / Restaurante', 'faria-lima', -23.5690, -46.6925),
  c('c-sumare-perdizes', 'Supermercado na Av. Sumaré (Perdizes)', 'Mercado', 'sumare', -23.5400, -46.6785),
  c('c-sumare-barra-funda', 'Clínica na Av. Sumaré (Pompeia)', 'Clínica', 'sumare', -23.5310, -46.6755),
  c('c-ibirapuera-indianopolis', 'Clínica na Av. Ibirapuera (Indianópolis)', 'Clínica', 'ibirapuera', -23.6180, -46.6690),
  c('c-cruzeiro-santana', 'Supermercado na Av. Cruzeiro do Sul (Santana)', 'Mercado', 'cruzeiro-sul', -23.5000, -46.6250),
  c('c-cruzeiro-carandiru', 'Farmácia na Av. Cruzeiro do Sul (Carandiru)', 'Farmácia', 'cruzeiro-sul', -23.5120, -46.6265),
  c('c-angelica-santa-cecilia', 'Café na Av. Angélica (Santa Cecília)', 'Café / Restaurante', 'angelica', -23.5400, -46.6565),
  c('c-berrini-brooklin', 'Restaurante na Av. Berrini (Brooklin)', 'Café / Restaurante', 'berrini', -23.6100, -46.6925),
  c('c-giovanni-vandrade', 'Supermercado na Av. Giovanni Gronchi (Vila Andrade)', 'Mercado', 'giovanni', -23.6120, -46.7270),
];
