import { createClient } from '@supabase/supabase-js';

/**
 * Cliente do Supabase (MVP). Sem as variáveis no .env.local, o app roda com a base
 * simulada local (modo vitrine), como antes.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const chave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const bancoConfigurado = Boolean(url && chave);
export const supabase = bancoConfigurado ? createClient(url!, chave!) : null;

/**
 * Busca todas as linhas de uma tabela, de 1000 em 1000 (limite do PostgREST).
 * A 1ª página traz o total; as outras vêm em paralelo (em sequência, 6 páginas de sessões
 * levavam o dobro do tempo e travavam a abertura de cada tela). Ordenar por id evita que o banco
 * embaralhe as páginas; um INSERT no meio da leitura ainda pode empurrar a linha da fronteira para
 * a página seguinte, por isso a lista sai sem ids repetidos (a linha pulada chega pelo tempo real).
 */
export async function buscarTudo<T>(tabela: string, filtrar?: (q: any) => any): Promise<T[]> {
  const passo = 1000;
  const pagina = (de: number, contar = false) => {
    let q = supabase!.from(tabela).select('*', contar ? { count: 'exact' } : undefined);
    if (filtrar) q = filtrar(q);
    return q.order('id').range(de, de + passo - 1);
  };
  const primeira = await pagina(0, true);
  if (primeira.error) throw new Error(`${tabela}: ${primeira.error.message}`);
  const linhas = (primeira.data ?? []) as T[];
  const total = primeira.count ?? linhas.length;
  const resto: number[] = [];
  for (let de = passo; de < total; de += passo) resto.push(de);
  const outras = await Promise.all(resto.map((de) => pagina(de)));
  for (const r of outras) {
    if (r.error) throw new Error(`${tabela}: ${r.error.message}`);
    linhas.push(...((r.data ?? []) as T[]));
  }
  const porId = new Map<unknown, T>();
  for (const l of linhas) porId.set((l as { id?: unknown }).id, l);
  return porId.size === linhas.length ? linhas : [...porId.values()];
}

export function exigirBanco() {
  if (!supabase) throw new Error('Banco não configurado: preencha o .env.local (veja .env.example).');
  return supabase;
}
