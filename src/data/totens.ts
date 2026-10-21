import { exigirBanco, supabase } from './supabase';

/**
 * Pareamento do totem (passo 4 do fluxograma).
 *
 * O aparelho novo abre /totem sem ponto: registra uma linha em "totens" com um código de 6 dígitos
 * e mostra o código na tela. No painel do comércio, o franqueado digita o código (ParearTotem): a
 * linha ganha o pontoId e o totem, que escuta a própria linha, passa a mostrar o ponto.
 *
 * Se a tabela ainda não existe (migration 20261021130000_totens.sql não aplicada), registrarTotem
 * lança TabelaAusente e o totem cai no comportamento antigo (ponto do painel ou ?ponto= na URL).
 */

const CHAVE_ID = 'pontow.totem.id';
export const CHAVE_PONTO_TOTEM = 'pontow.totem.ponto';

export interface RegistroTotem { id: string; codigo: string | null; pontoId: string | null }
export interface TotemPareado { id: string; pontoId: string | null; pareadoEm: string | null; ultimoSinal: string | null }

/** a tabela "totens" não existe neste banco (migration pendente) */
export class TabelaAusente extends Error {
  constructor() { super('A tabela de totens ainda não existe neste banco.'); this.name = 'TabelaAusente'; }
}

interface ErroBanco { message: string; code?: string }
const tabelaAusente = (e: ErroBanco) =>
  e.code === 'PGRST205' || e.code === '42P01' || /could not find the table|relation .*totens.* does not exist/i.test(e.message);
const erroDe = (e: ErroBanco): Error => (tabelaAusente(e) ? new TabelaAusente() : new Error(e.message));

// ---------------------------------------------------------------- armazenamento do aparelho
const ler = (chave: string): string | null => { try { return localStorage.getItem(chave); } catch { return null; } };
const gravar = (chave: string, valor: string | null) => {
  try { if (valor == null) localStorage.removeItem(chave); else localStorage.setItem(chave, valor); } catch { /* sem armazenamento */ }
};

export const lerPontoGuardado = (): string | null => ler(CHAVE_PONTO_TOTEM);
export const guardarPonto = (pontoId: string) => gravar(CHAVE_PONTO_TOTEM, pontoId);
export const lerIdDoTotem = (): string | null => ler(CHAVE_ID);

function idDoAparelho(): string {
  const guardado = ler(CHAVE_ID);
  if (guardado) return guardado;
  const novo = `t-${crypto.randomUUID().slice(0, 8)}`;
  gravar(CHAVE_ID, novo);
  return novo;
}

/** 6 dígitos, sorteados pelo navegador (com zeros à esquerda) */
function codigoAleatorio(): string {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return String(n[0] % 1_000_000).padStart(6, '0');
}

// ---------------------------------------------------------------- lado do totem
/** Cria (ou recupera) a linha deste aparelho. Devolve o código a mostrar, ou o ponto se já foi pareado. */
export async function registrarTotem(): Promise<RegistroTotem> {
  const sb = exigirBanco();
  const id = idDoAparelho();
  const agora = new Date().toISOString();

  const lido = await sb.from('totens').select('*').eq('id', id).maybeSingle();
  if (lido.error) throw erroDe(lido.error);
  if (lido.data) {
    const linha = lido.data as RegistroTotem;
    // linha sem ponto e sem código (não deveria acontecer): gera um código novo
    if (!linha.pontoId && !linha.codigo) return renovarCodigo(id);
    await sb.from('totens').update({ ultimoSinal: agora }).eq('id', id);
    return { id, codigo: linha.codigo, pontoId: linha.pontoId };
  }

  // 6 dígitos = 1 milhão de códigos: se sortear um que já existe, tenta de novo
  for (let tentativa = 0; tentativa < 8; tentativa++) {
    const codigo = codigoAleatorio();
    const { data, error } = await sb.from('totens').insert({ id, codigo, ultimoSinal: agora }).select().single();
    if (!error) return { id, codigo: (data as RegistroTotem).codigo, pontoId: null };
    if (error.code === '23505') {
      // duas abas do mesmo aparelho ao mesmo tempo: a linha já existe; senão foi o código que repetiu
      const outra = await sb.from('totens').select('*').eq('id', id).maybeSingle();
      if (outra.data) return outra.data as RegistroTotem;
      continue;
    }
    throw erroDe(error);
  }
  throw new Error('Não foi possível gerar um código para este totem. Tente de novo.');
}

async function renovarCodigo(id: string): Promise<RegistroTotem> {
  const sb = exigirBanco();
  for (let tentativa = 0; tentativa < 8; tentativa++) {
    const codigo = codigoAleatorio();
    const { error } = await sb.from('totens').update({ codigo, pontoId: null, pareadoEm: null, ultimoSinal: new Date().toISOString() }).eq('id', id);
    if (!error) return { id, codigo, pontoId: null };
    if (error.code !== '23505') throw erroDe(error);
  }
  throw new Error('Não foi possível gerar um novo código para este totem.');
}

/**
 * Fica de olho na própria linha: assim que o franqueado digita o código, chama aoParear(pontoId).
 * Canal de tempo real com nome único (um por aba) e, de reserva, consulta a cada 5 s.
 */
export function ouvirTotem(id: string, aoParear: (pontoId: string) => void): () => void {
  const sb = supabase;
  if (!sb) return () => {};
  let ativo = true;
  const checar = (linha?: { pontoId?: string | null } | null) => { if (ativo && linha?.pontoId) aoParear(linha.pontoId); };

  const canal = sb.channel(`totem-${id}-${crypto.randomUUID().slice(0, 8)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'totens', filter: `id=eq.${id}` },
      (p) => checar(p.new as { pontoId?: string | null }))
    .subscribe();
  const consultar = async () => {
    const { data } = await sb.from('totens').select('*').eq('id', id).maybeSingle();
    checar(data as { pontoId?: string | null } | null);
  };
  const timer = window.setInterval(() => { consultar().catch(() => {}); }, 5000);
  return () => { ativo = false; window.clearInterval(timer); sb.removeChannel(canal); };
}

/** O totem pareado avisa que está vivo (aparece como "último sinal" no painel do comércio). */
export async function sinalDoTotem(id: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('totens').update({ ultimoSinal: new Date().toISOString() }).eq('id', id);
}

/**
 * Desparear este totem: esquece o ponto no aparelho e devolve a linha ao estado "sem ponto", com
 * um código novo. Sem a tabela, só esquece o ponto guardado.
 */
export async function desparearTotem(): Promise<void> {
  const id = ler(CHAVE_ID);
  gravar(CHAVE_PONTO_TOTEM, null);
  if (!id || !supabase) return;
  try { await renovarCodigo(id); } catch { /* sem a tabela ou sem rede: o aparelho já esqueceu o ponto */ }
}

// ---------------------------------------------------------------- lado do franqueado
/** Liga o totem que mostra este código ao ponto. Só pareia totem que ainda está sem ponto. */
export async function parearTotem(codigo: string, pontoId: string): Promise<TotemPareado> {
  const limpo = codigo.replace(/\D/g, '');
  if (limpo.length !== 6) throw new Error('O código tem 6 números. Confira a tela do totem.');
  const { data, error } = await exigirBanco().from('totens')
    .update({ pontoId, pareadoEm: new Date().toISOString() })
    .eq('codigo', limpo).is('pontoId', null).select();
  if (error) {
    const e = erroDe(error);
    throw e instanceof TabelaAusente ? new Error('O pareamento ainda não está disponível neste ambiente.') : e;
  }
  if (!data?.length) {
    throw new Error('Não encontramos este código. Confira os 6 números na tela do totem — ele só vale para um totem que ainda está sem ponto.');
  }
  return data[0] as TotemPareado;
}

/** Totens ligados a um ponto (para o painel mostrar "pareado" e o último sinal). Sem a tabela, lista vazia. */
export async function totensDoPonto(pontoId: string): Promise<TotemPareado[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('totens').select('*').eq('pontoId', pontoId).order('pareadoEm', { ascending: false });
  if (error) { if (tabelaAusente(error)) return []; throw new Error(error.message); }
  return (data ?? []) as TotemPareado[];
}
