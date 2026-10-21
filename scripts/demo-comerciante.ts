/**
 * Conta de demonstração do comerciante que ainda vai pedir a franquia (comerciante@pontow.app,
 * senha DEMO_SENHA). Serve para mostrar o fluxo desde o começo: pedido → vistoria → aprovação da
 * GoodWe → ponto em instalação → ativação → mapa do motorista → recarga.
 *
 *   npm run demo:comerciante
 *
 * Rodar de novo volta a conta para o início: apaga os pedidos dela e tudo o que as aprovações
 * criaram (franqueado, ponto, vagas, sessões, telemetria, cobranças e eventos desse ponto).
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const CHAVE = process.env.SUPABASE_SECRET_KEY;
const SENHA = process.env.DEMO_SENHA;
if (!URL || !CHAVE || !SENHA) {
  console.error('Faltam SUPABASE_URL, SUPABASE_SECRET_KEY e DEMO_SENHA no .env.local');
  process.exit(1);
}
const sb = createClient(URL, CHAVE, { auth: { persistSession: false } });
const EMAIL = 'comerciante@pontow.app';
const NOME = 'Comerciante (demo)';

const checar = <T,>(r: { data: T; error: { message: string } | null }, onde: string): T => {
  if (r.error) throw new Error(`${onde}: ${r.error.message}`);
  return r.data;
};

const { data: lista } = await sb.auth.admin.listUsers({ perPage: 1000 });
let id = lista?.users.find((u) => u.email === EMAIL)?.id;
if (!id) {
  const r = await sb.auth.admin.createUser({ email: EMAIL, password: SENHA, email_confirm: true, user_metadata: { nome: NOME } });
  if (r.error) throw new Error(`conta: ${r.error.message}`);
  id = r.data.user.id;
  console.log('conta criada');
}

const pedidos = checar(await sb.from('homologacoes').select('id, pontoId').eq('solicitanteId', id), 'pedidos') as { id: string; pontoId: string | null }[];
const pontoIds = pedidos.map((p) => p.pontoId).filter((p): p is string => !!p);
if (pontoIds.length) {
  const pontos = checar(await sb.from('pontos').select('id, franqueadoId, demo').in('id', pontoIds), 'pontos') as { id: string; franqueadoId: string | null; demo: boolean }[];
  const meus = pontos.filter((p) => !p.demo).map((p) => p.id);
  const franqueados = [...new Set(pontos.filter((p) => !p.demo).map((p) => p.franqueadoId).filter(Boolean))] as string[];
  if (meus.length) {
    const sessoes = (checar(await sb.from('sessoes').select('id').in('pontoId', meus), 'sessoes') as { id: string }[]).map((s) => s.id);
    if (sessoes.length) checar(await sb.from('telemetria').delete().in('sessaoId', sessoes), 'telemetria');
    checar(await sb.from('cobrancas').delete().in('pontoId', meus), 'cobrancas');
    checar(await sb.from('sessoes').delete().in('pontoId', meus), 'sessoes');
    checar(await sb.from('eventos').delete().in('pontoId', meus), 'eventos');
    checar(await sb.from('pontos').delete().in('id', meus), 'pontos'); // vagas saem em cascata
  }
  if (franqueados.length) checar(await sb.from('franqueados').delete().in('id', franqueados), 'franqueados');
}
if (pedidos.length) checar(await sb.from('homologacoes').delete().eq('solicitanteId', id), 'pedidos');

checar(await sb.from('perfis').upsert({ id, nome: NOME, papel: 'motorista', franqueadoId: null, motoristaId: id }), 'perfil');
console.log(`pronto: ${EMAIL} no início do fluxo (${pedidos.length} pedido(s) e ${pontoIds.length} ponto(s) removidos)`);
