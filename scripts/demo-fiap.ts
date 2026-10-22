/**
 * Põe no banco só o ponto da apresentação (FIAP Aclimação, PONTO_FRANQUEADO_DEMO) e liga a conta
 * franqueado@pontow.app a ele, sem refazer a rede inteira (o seed --limpar apagaria os pedidos de
 * franquia e as fotos do GSVR que a demonstração usa).
 *
 *   npm run demo:fiap
 *
 * O ponto, o franqueado e as vagas vêm do src/domain/seed.ts. O histórico também, mas com ids próprios
 * (s-fiap-…, cb-fiap-…): os ids do seed são sequenciais e bateriam com os da rede já gravada.
 * Rodar de novo refaz o histórico do ponto (apaga o s-fiap-/cb-fiap- antigo e grava o novo).
 */
import { createClient } from '@supabase/supabase-js';
import { gerarBase, PONTO_FRANQUEADO_DEMO } from '../src/domain/seed';
import { brl, num } from '../src/domain/formato';

const URL = process.env.SUPABASE_URL;
const CHAVE = process.env.SUPABASE_SECRET_KEY;
if (!URL || !CHAVE) {
  console.error('Faltam SUPABASE_URL e SUPABASE_SECRET_KEY no .env.local');
  process.exit(1);
}
const sb = createClient(URL, CHAVE, { auth: { persistSession: false } });
const checar = <T,>(r: { data: T; error: { message: string } | null }, onde: string): T => {
  if (r.error) throw new Error(`${onde}: ${r.error.message}`);
  return r.data;
};
async function lote(tabela: string, linhas: object[]) {
  for (let i = 0; i < linhas.length; i += 500) checar(await sb.from(tabela).upsert(linhas.slice(i, i + 500)), tabela);
}

const b = gerarBase();
const ponto = b.pontos.find((p) => p.id === PONTO_FRANQUEADO_DEMO);
if (!ponto) throw new Error(`o seed não tem o ponto ${PONTO_FRANQUEADO_DEMO}`);
const franqueado = b.franqueados.find((f) => f.id === ponto.franqueadoId)!;
const vagas = b.carregadores.filter((c) => c.pontoId === ponto.id);
const novoSessao = (id: string) => id.replace(/^s-/, 's-fiap-');
const sessoes = b.sessoes
  .filter((s) => s.pontoId === ponto.id && s.estado === 'FATURADO')
  .map((s) => ({ ...s, id: novoSessao(s.id), demo: true }));
const ids = new Set(sessoes.map((s) => s.id));
const cobrancas = b.cobrancas
  .filter((c) => c.pontoId === ponto.id)
  .map((c) => ({ ...c, id: c.id.replace(/^cb-/, 'cb-fiap-'), sessaoId: novoSessao(c.sessaoId), demo: true }))
  .filter((c) => ids.has(c.sessaoId));

// o histórico anterior deste ponto (de uma execução passada) sai antes do novo
checar(await sb.from('cobrancas').delete().eq('pontoId', ponto.id).like('id', 'cb-fiap-%'), 'cobrancas antigas');
checar(await sb.from('sessoes').delete().eq('pontoId', ponto.id).like('id', 's-fiap-%'), 'sessões antigas');

await lote('franqueados', [franqueado]);
await lote('pontos', [{ ...ponto, status: 'ATIVO', demo: true }]);
await lote('carregadores', vagas.map((c) => ({ ...c, estado: 'DISPONIVEL', carro: null })));
await lote('sessoes', sessoes);
await lote('cobrancas', cobrancas);

// a conta franqueado@ passa a operar este ponto
const { data: lista } = await sb.auth.admin.listUsers({ perPage: 1000 });
const fr = lista?.users.find((u) => u.email === 'franqueado@pontow.app')?.id;
if (fr) checar(await sb.from('perfis').update({ papel: 'franqueado', franqueadoId: franqueado.id }).eq('id', fr), 'perfil do franqueado');
else console.warn('a conta franqueado@pontow.app não existe: rode npm run seed para criá-la');

const pagas = cobrancas.filter((c) => c.status === 'PAGO');
console.log(`${ponto.nome} (${ponto.id}) · ${vagas.length} vagas · preço base ${brl(ponto.precoBaseKWh)}/kWh`);
console.log(`histórico: ${num(sessoes.length)} recargas, ${brl(pagas.reduce((t, c) => t + c.valor, 0))} pagos`);
console.log(fr ? 'franqueado@pontow.app agora opera este ponto.' : '');
console.log('Reinicie o simulador para ele assumir as vagas do ponto novo.');
