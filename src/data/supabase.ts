import { createClient } from '@supabase/supabase-js';

/**
 * Cliente do Supabase (MVP). Sem as variáveis no .env.local, o app roda com a base
 * simulada local (modo vitrine), como antes.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const chave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const bancoConfigurado = Boolean(url && chave);
export const supabase = bancoConfigurado ? createClient(url!, chave!) : null;

/** Busca todas as linhas de uma tabela, de 1000 em 1000 (limite do PostgREST). */
export async function buscarTudo<T>(tabela: string, filtrar?: (q: any) => any): Promise<T[]> {
  const linhas: T[] = [];
  const passo = 1000;
  for (let de = 0; ; de += passo) {
    let q = supabase!.from(tabela).select('*').range(de, de + passo - 1);
    if (filtrar) q = filtrar(q);
    const { data, error } = await q;
    if (error) throw new Error(`${tabela}: ${error.message}`);
    linhas.push(...((data ?? []) as T[]));
    if (!data || data.length < passo) break;
  }
  return linhas;
}

export function exigirBanco() {
  if (!supabase) throw new Error('Banco não configurado: preencha o .env.local (veja .env.example).');
  return supabase;
}
