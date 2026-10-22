/**
 * Valida o que o totem mostra em cada caminho de fim de recarga (npm run validar:totem).
 * Só a lógica pura de domain/engine/totem.ts: sem banco, sem tela. Cada caso monta as sessões, a
 * cobrança e o carro (ou a falta dele) e confere a tela escolhida. Sai com código 1 se algum falhar.
 */
import {
  sessaoNoTotem, sessaoAtualDaVaga, telaDoTotem, TEMPO, type NomeTela, type VagaDados,
} from '../src/domain/engine/totem';
import type { Carregador, Cobranca, Ponto, Sessao } from '../src/domain/types';

const AGORA = Date.parse('2026-10-22T15:00:00Z');
const ha = (ms: number) => new Date(AGORA - ms).toISOString();
const MIN = 60_000;

const ponto = { id: 'p-1', nome: 'Teste', status: 'ATIVO', ativo: true } as unknown as Ponto;

const vaga = (id: string, carro: Carregador['carro'] = null): Carregador => ({
  id, pontoId: 'p-1', apelido: id === 'v1' ? 'Vaga 1' : 'Vaga 2', modelo: 'GW7K-HCA-20',
  estado: carro ? 'OCUPADO' : 'DISPONIVEL', carro, ultimoHeartbeat: ha(5_000),
} as unknown as Carregador);

const carro = (sessaoId?: string, conectadoHa = 20 * MIN): NonNullable<Carregador['carro']> =>
  ({ veiculoId: 'v-dolphin', socReal: 40, conectadoEm: ha(conectadoHa), ...(sessaoId ? { sessaoId } : {}) }) as NonNullable<Carregador['carro']>;

const sessao = (id: string, estado: Sessao['estado'], iniciouHa: number, terminouHa?: number, extra: Partial<Sessao> = {}): Sessao => ({
  id, pontoId: 'p-1', carregadorId: 'v1', estado, inicio: ha(iniciouHa), fim: terminouHa != null ? ha(terminouHa) : undefined,
  socInicial: 30, socAtual: 40, energiaKWh: 0.5, potenciaAtualKW: 0, tarifaAplicadaKWh: 1.9, custoAcumulado: 0.95,
  autorizacao: 'VISITANTE', ...extra,
} as unknown as Sessao);

const cobranca = (sessaoId: string, status: 'PENDENTE' | 'PAGO', pagaHa?: number): Cobranca => ({
  id: `cb-${sessaoId}`, sessaoId, pontoId: 'p-1', valor: 0.95, metodo: 'PIX', status,
  ...(pagaHa != null ? { pagaEm: ha(pagaHa) } : {}),
} as unknown as Cobranca);

/** o que o totem faz de verdade: escolhe a sessão de cada vaga e decide a tela */
function telaDe(vagas: { vaga: Carregador; sessoes: Sessao[] }[], cobrancas: Cobranca[]): { tela: NomeTela; foco?: string } {
  const cobrancaDe = (id: string) => cobrancas.find((c) => c.sessaoId === id);
  const dados: VagaDados[] = vagas.map(({ vaga: v, sessoes }) => {
    const s = sessaoNoTotem(sessoes, v.carro, cobrancaDe, AGORA);
    return { vaga: v, sessao: s, cobranca: s ? cobrancaDe(s.id) : undefined, semSinal: false };
  });
  const r = telaDoTotem({ ponto, vagas: dados, agora: AGORA });
  return { tela: r.tela, foco: r.foco?.id };
}

interface Caso { nome: string; espera: NomeTela; foco?: string; obter: () => { tela: NomeTela; foco?: string } }

const casos: Caso[] = [
  // ---------------------------------------------------- o problema relatado: cabo sai no meio da carga
  {
    nome: 'cabo sai carregando (visitante): conta pendente, sem carro → Pix no totem',
    espera: 'pagar', foco: 'v1',
    obter: () => telaDe([{ vaga: vaga('v1'), sessoes: [sessao('s1', 'CONCLUIDO', 12 * MIN, 5_000)] }], [cobranca('s1', 'PENDENTE')]),
  },
  {
    nome: 'cabo sai carregando (app): mesmo Pix no totem, além do celular',
    espera: 'pagar', foco: 'v1',
    obter: () => telaDe([{ vaga: vaga('v1'), sessoes: [sessao('s1', 'CONCLUIDO', 12 * MIN, 5_000, { autorizacao: 'QR' })] }], [cobranca('s1', 'PENDENTE')]),
  },
  {
    nome: 'cabo sai e a conta ainda está fechando (sem cobrança) → "fechando a conta"',
    espera: 'encerrando', foco: 'v1',
    obter: () => telaDe([{ vaga: vaga('v1'), sessoes: [sessao('s1', 'CONCLUIDO', 12 * MIN, 1_000)] }], []),
  },
  {
    nome: 'cabo saiu há 14 min e ninguém pagou → Pix continua no totem',
    espera: 'pagar',
    obter: () => telaDe([{ vaga: vaga('v1'), sessoes: [sessao('s1', 'CONCLUIDO', 30 * MIN, 14 * MIN)] }], [cobranca('s1', 'PENDENTE')]),
  },
  {
    nome: `cabo saiu há mais de ${TEMPO.contaSemCaboMs / MIN} min sem pagar → volta para a espera (a conta segue no financeiro)`,
    espera: 'espera',
    obter: () => telaDe([{ vaga: vaga('v1'), sessoes: [sessao('s1', 'CONCLUIDO', 40 * MIN, 16 * MIN)] }], [cobranca('s1', 'PENDENTE')]),
  },
  {
    nome: 'pagou o Pix depois de tirar o cabo (há 10 s) → "Pagamento recebido"',
    espera: 'pago',
    obter: () => telaDe([{ vaga: vaga('v1'), sessoes: [sessao('s1', 'FATURADO', 12 * MIN, 3 * MIN)] }], [cobranca('s1', 'PAGO', 10_000)]),
  },
  {
    nome: 'pagou há 2 min com o cabo fora → espera',
    espera: 'espera',
    obter: () => telaDe([{ vaga: vaga('v1'), sessoes: [sessao('s1', 'FATURADO', 12 * MIN, 5 * MIN)] }], [cobranca('s1', 'PAGO', 2 * MIN)]),
  },
  {
    nome: 'recarga de valor zero, cabo fora (FATURADO sem Pix) → espera, sem "pagamento recebido"',
    espera: 'espera',
    obter: () => telaDe([{ vaga: vaga('v1'), sessoes: [sessao('s1', 'FATURADO', 2 * MIN, 5_000, { energiaKWh: 0, custoAcumulado: 0 })] }], []),
  },
  // ---------------------------------------------------- caminhos que já funcionavam (não podem quebrar)
  {
    nome: 'encerrou pelo app com o carro no cabo → Pix no totem',
    espera: 'pagar',
    obter: () => telaDe([{ vaga: vaga('v1', carro('s1')), sessoes: [sessao('s1', 'CONCLUIDO', 12 * MIN, 5_000, { autorizacao: 'QR' })] }], [cobranca('s1', 'PENDENTE')]),
  },
  {
    nome: 'encerrou no totem (visitante) com o carro no cabo → Pix no totem',
    espera: 'pagar',
    obter: () => telaDe([{ vaga: vaga('v1', carro('s1')), sessoes: [sessao('s1', 'CONCLUIDO', 12 * MIN, 5_000)] }], [cobranca('s1', 'PENDENTE')]),
  },
  {
    nome: 'pagou com o carro ainda no cabo → "Pagamento recebido"',
    espera: 'pago',
    obter: () => telaDe([{ vaga: vaga('v1', carro('s1')), sessoes: [sessao('s1', 'FATURADO', 12 * MIN, 1 * MIN)] }], [cobranca('s1', 'PAGO', 10_000)]),
  },
  {
    nome: 'carregando com o cabo no carro → carga',
    espera: 'carga',
    obter: () => telaDe([{ vaga: vaga('v1', carro('s1')), sessoes: [sessao('s1', 'CARREGANDO', 5 * MIN)] }], []),
  },
  {
    nome: 'pausada com o cabo no carro → pausada',
    espera: 'pausada',
    obter: () => telaDe([{ vaga: vaga('v1', carro('s1')), sessoes: [sessao('s1', 'PAUSADO', 5 * MIN)] }], []),
  },
  {
    nome: 'cabo sai no QR (sessão expirada pelo simulador) → espera, sem conta',
    espera: 'espera',
    obter: () => telaDe([{ vaga: vaga('v1'), sessoes: [sessao('s1', 'EXPIRADA', 3 * MIN, 5_000)] }], []),
  },
  // ---------------------------------------------------- a conta pendente não atrapalha o próximo carro
  {
    nome: 'carro novo conecta na mesma vaga com a conta antiga pendente → QR do carro novo',
    espera: 'qr', foco: 'v1',
    obter: () => telaDe([{
      vaga: vaga('v1', carro('s2', 30_000)),
      sessoes: [sessao('s1', 'CONCLUIDO', 20 * MIN, 3 * MIN), sessao('s2', 'ABERTA', 30_000, undefined, { codigoVinculo: 'ABCD' })],
    }], [cobranca('s1', 'PENDENTE')]),
  },
  {
    nome: 'vaga 1 com conta sem cabo, vaga 2 carregando → o totem mostra o Pix da vaga 1',
    espera: 'pagar', foco: 'v1',
    obter: () => telaDe([
      { vaga: vaga('v1'), sessoes: [sessao('s1', 'CONCLUIDO', 12 * MIN, 5_000)] },
      { vaga: vaga('v2', carro('s2')), sessoes: [sessao('s2', 'CARREGANDO', 5 * MIN, undefined, { carregadorId: 'v2' })] },
    ], [cobranca('s1', 'PENDENTE')]),
  },
  {
    nome: 'vaga 1 com conta sem cabo, vaga 2 aguardando QR → o QR da vaga 2 vem primeiro',
    espera: 'qr', foco: 'v2',
    obter: () => telaDe([
      { vaga: vaga('v1'), sessoes: [sessao('s1', 'CONCLUIDO', 12 * MIN, 5_000)] },
      { vaga: vaga('v2', carro('s2', 20_000)), sessoes: [sessao('s2', 'ABERTA', 20_000, undefined, { carregadorId: 'v2', codigoVinculo: 'WXYZ' })] },
    ], [cobranca('s1', 'PENDENTE')]),
  },
];

let falhas = 0;
for (const c of casos) {
  const r = c.obter();
  const ok = r.tela === c.espera && (c.foco == null || r.foco === c.foco);
  if (!ok) falhas++;
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${c.nome}${ok ? '' : `  (esperava ${c.espera}${c.foco ? `/${c.foco}` : ''}, veio ${r.tela}/${r.foco ?? '-'})`}`);
}

// a regra do resto do app (preço e painéis) continua sem contar a conta de quem saiu como vaga ocupada
const resto = sessaoAtualDaVaga([sessao('s1', 'CONCLUIDO', 12 * MIN, 5_000)], null);
const okResto = resto === undefined;
if (!okResto) falhas++;
console.log(`${okResto ? 'ok   ' : 'FALHA'} preço e painéis: conta pendente sem carro não ocupa a vaga`);

console.log(falhas ? `\n${falhas} de ${casos.length + 1} casos falharam` : `\n${casos.length + 1} casos ok`);
process.exit(falhas ? 1 : 0);
