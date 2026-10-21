/**
 * Carrega a rede de demonstração no Supabase (MVP).
 *
 *   npm run seed                 só grava (upsert): comportamento antigo, não apaga nada
 *   npm run seed -- --limpar     apaga a rede inteira e grava a rede nova
 *
 * Usa a chave secreta do .env.local. A rede (10 unidades em São Paulo, 90 dias de histórico até
 * agora, solicitações de exemplo) vem do src/domain/seed.ts. As contas de demonstração têm a senha
 * DEMO_SENHA: goodwe@, franqueado@ (opera o Pão de Açúcar Moema), motorista@ e comerciante@pontow.app
 * (motorista, sem franqueado, no começo do fluxo de pedido de franquia).
 *
 * Com --limpar, antes de gravar, apaga nesta ordem (respeita as chaves estrangeiras):
 *   telemetria, cobrancas, sessoes, eventos, totens (se a tabela existir), homologacoes,
 *   carregadores, pontos, franqueados
 * e, dos motoristas, só os de demonstração do seed (id "m-…"). Não toca em auth.users nem nos
 * motoristas e perfis de usuários reais, com uma exceção: o perfil que apontava para um franqueado
 * apagado perde o vínculo (franqueadoId vazio e, se era franqueado, volta a motorista), senão ficaria
 * apontando para um franqueado que não existe mais. Cada perfil ajustado é listado na saída.
 *
 * Depois de rodar: reinicie o simulador (ele guarda a lista de pontos) e recarregue o navegador.
 */
import { createClient } from '@supabase/supabase-js';
import { gerarBase, PONTO_FRANQUEADO_DEMO } from '../src/domain/seed';
import { brl, num } from '../src/domain/formato';

const URL = process.env.SUPABASE_URL;
const CHAVE = process.env.SUPABASE_SECRET_KEY;
const SENHA = process.env.DEMO_SENHA;
if (!URL || !CHAVE || !SENHA) {
  console.error('Faltam SUPABASE_URL, SUPABASE_SECRET_KEY e DEMO_SENHA no .env.local');
  process.exit(1);
}
const limpar = process.argv.includes('--limpar');
const sb = createClient(URL, CHAVE, { auth: { persistSession: false } });

type Resposta = PromiseLike<{ data: unknown; error: { message: string } | null }>;

async function ler<T>(p: Resposta, onde: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${onde}: ${error.message}`);
  return data as T;
}

async function lote(tabela: string, linhas: object[], chave = 'id') {
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await sb.from(tabela).upsert(linhas.slice(i, i + 500), { onConflict: chave });
    if (error) throw new Error(`${tabela}: ${error.message}`);
  }
  console.log(`${tabela}: ${linhas.length}`);
}

async function usuario(email: string, nome: string) {
  const { data: lista } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const existente = lista?.users.find((u) => u.email === email);
  if (existente) return existente.id;
  const { data, error } = await sb.auth.admin.createUser({ email, password: SENHA, email_confirm: true, user_metadata: { nome } });
  if (error) throw new Error(`${email}: ${error.message}`);
  return data.user.id;
}

// ---------------------------------------------------------------- limpeza
/** a tabela existe neste banco? (a de totens vem de uma migration mais nova) */
async function tabelaExiste(tabela: string): Promise<boolean> {
  const { error } = await sb.from(tabela).select('*', { count: 'exact', head: true });
  if (!error) return true;
  if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message)) return false;
  throw new Error(`${tabela}: ${error.message}`);
}

/**
 * Apaga todas as linhas de uma tabela, em lotes pequenos (a URL do filtro tem limite de tamanho).
 * Chave numérica (telemetria, eventos): apaga por faixas de id. Chave de texto: lê 1.000 ids e apaga de 200 em 200.
 */
async function apagarTudo(tabela: string, numerica = false): Promise<number> {
  let total = 0;
  if (numerica) {
    const primeiro = await ler<{ id: number }[]>(sb.from(tabela).select('id').order('id', { ascending: true }).limit(1), tabela);
    if (!primeiro.length) return 0;
    const ultimo = await ler<{ id: number }[]>(sb.from(tabela).select('id').order('id', { ascending: false }).limit(1), tabela);
    const passo = 5000;
    for (let de = Number(primeiro[0].id); de <= Number(ultimo[0].id); de += passo) {
      const { count, error } = await sb.from(tabela).delete({ count: 'exact' }).gte('id', de).lt('id', de + passo);
      if (error) throw new Error(`${tabela}: ${error.message}`);
      total += count ?? 0;
    }
    return total;
  }
  for (let volta = 0; volta < 10_000; volta++) {
    const ids = (await ler<{ id: string }[]>(sb.from(tabela).select('id').limit(1000), tabela)).map((x) => x.id);
    if (!ids.length) return total;
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await sb.from(tabela).delete().in('id', ids.slice(i, i + 200));
      if (error) throw new Error(`${tabela}: ${error.message}`);
    }
    total += ids.length;
  }
  throw new Error(`${tabela}: as linhas não param de voltar depois de apagadas`);
}

async function limparRede(preservar: Set<string>) {
  console.log('Apagando a rede atual…');
  const franqueadosAntigos = (await ler<{ id: string }[]>(sb.from('franqueados').select('id'), 'franqueados')).map((f) => f.id);

  const passos: [string, boolean][] = [
    ['telemetria', true], ['cobrancas', false], ['sessoes', false], ['eventos', true], ['totens', false],
    ['homologacoes', false], ['carregadores', false], ['pontos', false], ['franqueados', false],
  ];
  for (const [tabela, numerica] of passos) {
    if (tabela === 'totens' && !(await tabelaExiste('totens'))) {
      console.log('  totens: a tabela não existe neste banco, pulando');
      continue;
    }
    console.log(`  ${tabela}: ${num(await apagarTudo(tabela, numerica))} apagadas`);
  }

  // só os motoristas de demonstração do seed (id "m-…"); os de usuários reais têm o id do login
  const { count, error } = await sb.from('motoristas').delete({ count: 'exact' }).like('id', 'm-%');
  if (error) throw new Error(`motoristas: ${error.message}`);
  console.log(`  motoristas de demonstração: ${num(count ?? 0)} apagados`);

  // perfis que apontavam para um franqueado que acabou de sair
  if (franqueadosAntigos.length) {
    type Solto = { id: string; nome: string | null; papel: string; franqueadoId: string };
    const soltos: Solto[] = []; // as contas de demonstração são regravadas no fim, então ficam de fora
    for (let i = 0; i < franqueadosAntigos.length; i += 100) {
      soltos.push(...await ler<Solto[]>(sb.from('perfis').select('id, nome, papel, franqueadoId').in('franqueadoId', franqueadosAntigos.slice(i, i + 100)), 'perfis'));
    }
    for (const p of soltos.filter((x) => !preservar.has(x.id))) {
      const novo = p.papel === 'franqueado' ? { franqueadoId: null, papel: 'motorista' } : { franqueadoId: null };
      await ler(sb.from('perfis').update(novo).eq('id', p.id), 'perfis');
      console.log(`  perfil ajustado: ${p.nome ?? p.id} (${p.papel}${p.papel === 'franqueado' ? ' → motorista' : ''}), sem franqueado`);
    }
    if (!soltos.some((x) => !preservar.has(x.id))) console.log('  perfis de usuários reais: nenhum apontava para franqueado apagado');
  }
}

// ---------------------------------------------------------------- resumo
async function contar(tabela: string): Promise<number> {
  const { count, error } = await sb.from(tabela).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`${tabela}: ${error.message}`);
  return count ?? 0;
}

/** cobranças pagas dos últimos 30 dias, lidas do banco (é o que o painel vai somar) */
async function pagasDosUltimos30Dias(): Promise<{ pontoId: string; valor: number }[]> {
  const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const todas: { pontoId: string; valor: number }[] = [];
  for (let de = 0; ; de += 1000) {
    const pagina = await ler<{ pontoId: string; valor: number }[]>(
      sb.from('cobrancas').select('pontoId, valor').eq('status', 'PAGO').gte('criadaEm', desde).order('id').range(de, de + 999),
      'cobrancas',
    );
    todas.push(...pagina);
    if (pagina.length < 1000) return todas;
  }
}

async function resumo() {
  const [pontos, sessoes, cobrancas, homologacoes] = await Promise.all([
    contar('pontos'), contar('sessoes'), contar('cobrancas'), contar('homologacoes'),
  ]);
  const pagas = await pagasDosUltimos30Dias();
  const porPonto = new Map<string, { n: number; valor: number }>();
  for (const c of pagas) {
    const item = porPonto.get(c.pontoId) ?? { n: 0, valor: 0 };
    item.n += 1;
    item.valor += Number(c.valor);
    porPonto.set(c.pontoId, item);
  }

  console.log('\nRESUMO (lido do banco)');
  console.log(`  pontos ${num(pontos)} · sessões ${num(sessoes)} · cobranças ${num(cobrancas)} · pedidos de franquia ${num(homologacoes)}`);
  console.log('  faturamento dos últimos 30 dias (cobranças pagas):');
  for (const p of b.pontos) {
    const item = porPonto.get(p.id) ?? { n: 0, valor: 0 };
    console.log(`    ${p.nome.padEnd(30)} ${String(num(item.n)).padStart(5)} recargas  ${brl(item.valor).padStart(14)}`);
  }
  const total = [...porPonto.values()].reduce((t, x) => ({ n: t.n + x.n, valor: t.valor + x.valor }), { n: 0, valor: 0 });
  console.log(`    ${'TOTAL'.padEnd(30)} ${String(num(total.n)).padStart(5)} recargas  ${brl(total.valor).padStart(14)}`);

  // sem --limpar, o upsert não remove pontos de uma rede anterior
  const idsNovos = new Set(b.pontos.map((p) => p.id));
  const restos = (await ler<{ id: string; nome: string }[]>(sb.from('pontos').select('id, nome'), 'pontos')).filter((p) => !idsNovos.has(p.id));
  if (restos.length) {
    console.warn(`\nATENÇÃO: ${restos.length} ponto(s) fora desta rede continuam no banco (${restos.map((p) => p.nome).join(', ')}).`);
    console.warn('Rode de novo com --limpar para ficar só com a rede de São Paulo.');
  }
}

// ---------------------------------------------------------------- gravação
const b = gerarBase();
// o histórico entra como pago; as vagas começam livres (o simulador cuida do que está ao vivo)
const sessoes = b.sessoes.filter((s) => s.estado === 'FATURADO').map((s) => ({ ...s, demo: true }));
const idsSessao = new Set(sessoes.map((s) => s.id));

// contas de demonstração (criadas se faltarem): o franqueado opera o Pão de Açúcar Moema e o comerciante
// é só motorista (o fluxo de pedido de franquia começa nele; para recomeçar depois, npm run demo:comerciante)
const gw = await usuario('goodwe@pontow.app', 'GoodWe (demo)');
const fr = await usuario('franqueado@pontow.app', 'Franqueado (demo)');
const mo = await usuario('motorista@pontow.app', 'Ana Prado (demo)');
const co = await usuario('comerciante@pontow.app', 'Comerciante (demo)');

if (limpar) await limparRede(new Set([gw, fr, mo, co]));
else console.log('Sem --limpar: só grava (upsert), nada é apagado.');

console.log('\nGravando a rede nova…');
await lote('franqueados', b.franqueados);
await lote('pontos', b.pontos.map((p) => ({ ...p, status: p.ativo ? 'ATIVO' : 'SUSPENSO', demo: true })));
await lote('carregadores', b.carregadores.map((c) => ({ ...c, estado: c.estado === 'OCUPADO' ? 'DISPONIVEL' : c.estado, carro: null })));
await lote('motoristas', b.motoristas);
await lote('sessoes', sessoes);
await lote('cobrancas', b.cobrancas.filter((c) => idsSessao.has(c.sessaoId)).map((c) => ({ ...c, demo: true })));
await lote('homologacoes', b.homologacoes);

const pontoDemo = b.pontos.find((p) => p.id === PONTO_FRANQUEADO_DEMO) ?? b.pontos[0];
await lote('perfis', [
  { id: gw, nome: 'GoodWe (demo)', papel: 'goodwe', franqueadoId: null, motoristaId: gw },
  { id: fr, nome: 'Franqueado (demo)', papel: 'franqueado', franqueadoId: pontoDemo.franqueadoId, motoristaId: fr },
  { id: mo, nome: 'Ana Prado (demo)', papel: 'motorista', franqueadoId: null, motoristaId: mo },
  { id: co, nome: 'Comerciante (demo)', papel: 'motorista', franqueadoId: null, motoristaId: co },
]);
console.log(`contas de demonstração prontas. O franqueado opera: ${pontoDemo.nome} (${pontoDemo.id})`);

await resumo();
console.log('\npronto. Reinicie o simulador e recarregue o navegador.');
