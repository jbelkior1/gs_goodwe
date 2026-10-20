/**
 * Carrega a rede de demonstração no Supabase (MVP).
 *
 *   npm run seed
 *
 * Usa a chave secreta do .env.local. Cria 16 pontos com 90 dias de histórico (gerados pelo
 * src/domain/seed.ts), solicitações de exemplo e três contas de demonstração com a senha
 * DEMO_SENHA: goodwe@pontow.app, franqueado@pontow.app e motorista@pontow.app.
 * Pode rodar de novo: usa upsert.
 */
import { createClient } from '@supabase/supabase-js';
import { gerarBase } from '../src/domain/seed';

const URL = process.env.SUPABASE_URL;
const CHAVE = process.env.SUPABASE_SECRET_KEY;
const SENHA = process.env.DEMO_SENHA;
if (!URL || !CHAVE || !SENHA) {
  console.error('Faltam SUPABASE_URL, SUPABASE_SECRET_KEY e DEMO_SENHA no .env.local');
  process.exit(1);
}
const sb = createClient(URL, CHAVE, { auth: { persistSession: false } });

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

const b = gerarBase();
// o histórico entra como pago; as vagas começam livres (o simulador cuida do que está ao vivo)
const sessoes = b.sessoes.filter((s) => s.estado === 'FATURADO').map((s) => ({ ...s, demo: true }));
const idsSessao = new Set(sessoes.map((s) => s.id));

await lote('franqueados', b.franqueados);
await lote('pontos', b.pontos.map((p) => ({ ...p, status: p.ativo ? 'ATIVO' : 'SUSPENSO', demo: true })));
await lote('carregadores', b.carregadores.map((c) => ({ ...c, estado: c.estado === 'OCUPADO' ? 'DISPONIVEL' : c.estado, carro: null })));
await lote('motoristas', b.motoristas);
await lote('sessoes', sessoes);
await lote('cobrancas', b.cobrancas.filter((c) => idsSessao.has(c.sessaoId)).map((c) => ({ ...c, demo: true })));
await lote('homologacoes', b.homologacoes);

// contas de demonstração (a franqueada opera o mesmo ponto que o painel abre por padrão)
const pontoDemo = b.pontos.filter((p) => p.ativo)[13] ?? b.pontos[0];
const gw = await usuario('goodwe@pontow.app', 'GoodWe (demo)');
const fr = await usuario('franqueado@pontow.app', 'Franqueado (demo)');
const mo = await usuario('motorista@pontow.app', 'Ana Prado (demo)');
await lote('perfis', [
  { id: gw, nome: 'GoodWe (demo)', papel: 'goodwe', franqueadoId: null, motoristaId: gw },
  { id: fr, nome: 'Franqueado (demo)', papel: 'franqueado', franqueadoId: pontoDemo.franqueadoId, motoristaId: fr },
  { id: mo, nome: 'Ana Prado (demo)', papel: 'motorista', franqueadoId: null, motoristaId: mo },
]);
console.log(`pronto. Ponto do franqueado de demonstração: ${pontoDemo.nome} (${pontoDemo.id})`);
