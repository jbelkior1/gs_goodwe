/**
 * Traz o histórico de demonstração para "agora".
 *
 *   npm run demo:atualizar                (grava)
 *   npm run demo:atualizar -- --simular   (só mostra o que faria, sem gravar)
 *
 * O seed gravou 90 dias de histórico terminando no dia em que rodou; passados alguns dias, os
 * gráficos de "hoje" e "últimos 7 dias" ficam vazios. Este script desloca no tempo, todo junto e
 * pelo mesmo intervalo, só as linhas de demonstração, para a recarga mais recente terminar 30 min
 * antes de agora. Mexe apenas em colunas de data:
 *
 *   sessoes        (demo = true)           inicio, fim
 *   cobrancas      (demo = true)           criadaEm, pagaEm
 *   homologacoes   (solicitanteId nulo)    criadoEm   (os pedidos feitos por contas reais ficam como estão)
 *
 * Roda sempre: cada execução alinha ao agora, então pode rodar antes de cada apresentação. Rode com
 * os painéis fechados (cada linha alterada vira um evento de tempo real) e dê F5 depois.
 * Se cair no meio (rede), rode `npm run seed` para restaurar as datas originais e tente de novo.
 */
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { dataHora, plural } from '../src/domain/formato';

/** a recarga mais recente do histórico termina esta folga antes de agora */
const FOLGA_MS = 30 * 60_000;
const PAGINA = 1000;
const LOTE = 500;

type Linha = Record<string, unknown> & { id: string };

/** Quanto deslocar para a última recarga terminar em (agora − 30 min). null = não há recarga com fim. */
export function calcularDelta(fins: (string | null | undefined)[], agora: number): number | null {
  const tempos = fins.filter((f): f is string => !!f).map((f) => new Date(f).getTime()).filter(Number.isFinite);
  if (!tempos.length) return null;
  return agora - tempos.reduce((m, t) => (t > m ? t : m), -Infinity) - FOLGA_MS;
}

/** Desloca as colunas de data informadas (as ausentes ou nulas ficam como estão). */
export function deslocar(linhas: Linha[], campos: string[], delta: number): Linha[] {
  return linhas.map((l) => {
    const nova: Linha = { ...l };
    for (const c of campos) {
      const v = l[c];
      if (typeof v === 'string' && Number.isFinite(new Date(v).getTime())) nova[c] = new Date(new Date(v).getTime() + delta).toISOString();
    }
    return nova;
  });
}

/** "2 dias, 3 h e 12 min para frente" */
export function descrever(ms: number): string {
  let min = Math.round(Math.abs(ms) / 60_000);
  const d = Math.floor(min / 1440); min -= d * 1440;
  const h = Math.floor(min / 60); min -= h * 60;
  return `${plural(d, 'dia', 'dias')}, ${h} h e ${min} min ${ms < 0 ? 'para trás' : 'para frente'}`;
}

async function main() {
  const URL = process.env.SUPABASE_URL;
  const CHAVE = process.env.SUPABASE_SECRET_KEY;
  if (!URL || !CHAVE) {
    console.error('Faltam SUPABASE_URL e SUPABASE_SECRET_KEY no .env.local');
    process.exit(1);
  }
  const simular = process.argv.includes('--simular');
  const sb = createClient(URL, CHAVE, { auth: { persistSession: false } });

  /** tenta de novo (2 s, 4 s) antes de desistir: uma falha de rede não deve deixar o histórico pela metade */
  async function tentar<T>(rotulo: string, f: () => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
    for (let i = 1; ; i++) {
      const { data, error } = await f();
      if (!error) return data as T;
      if (i === 3) throw new Error(`${rotulo}: ${error.message}`);
      await new Promise((r) => setTimeout(r, i * 2000));
    }
  }

  async function lerTudo(tabela: 'sessoes' | 'cobrancas' | 'homologacoes'): Promise<Linha[]> {
    const todas: Linha[] = [];
    for (let de = 0; ; de += PAGINA) {
      const dados = await tentar<Linha[]>(`ler ${tabela}`, () => {
        const q = sb.from(tabela).select('*');
        const filtrada = tabela === 'homologacoes' ? q.is('solicitanteId', null) : q.eq('demo', true);
        return filtrada.order('id', { ascending: true }).range(de, de + PAGINA - 1);
      });
      todas.push(...dados);
      if (dados.length < PAGINA) return todas;
    }
  }

  async function gravar(tabela: string, linhas: Linha[]) {
    for (let i = 0; i < linhas.length; i += LOTE) {
      await tentar(`gravar ${tabela}`, () => sb.from(tabela).upsert(linhas.slice(i, i + LOTE), { onConflict: 'id' }));
    }
  }

  console.log('lendo as linhas de demonstração…');
  const sessoes = await lerTudo('sessoes');
  const cobrancas = await lerTudo('cobrancas');
  const homologacoes = await lerTudo('homologacoes');

  const agora = Date.now();
  const delta = calcularDelta(sessoes.map((s) => s.fim as string | null), agora);
  if (delta === null) {
    console.error('Não há sessão de demonstração com fim. Rode `npm run seed` antes.');
    process.exit(1);
  }
  const maisRecente = sessoes.map((s) => s.fim).filter((f): f is string => typeof f === 'string').sort().at(-1)!;

  console.log(`deslocamento: ${descrever(delta)} (${delta} ms)`);
  console.log(`recarga mais recente: ${dataHora(maisRecente)} → ${dataHora(new Date(new Date(maisRecente).getTime() + delta))} (agora ${dataHora(new Date(agora))})`);
  console.log(`sessoes: ${sessoes.length} · cobrancas: ${cobrancas.length} · homologacoes (sem solicitante): ${homologacoes.length}`);

  if (simular) {
    console.log('simulação: nada foi gravado.');
    return;
  }

  await gravar('sessoes', deslocar(sessoes, ['inicio', 'fim'], delta));
  console.log(`sessoes gravadas: ${sessoes.length}`);
  await gravar('cobrancas', deslocar(cobrancas, ['criadaEm', 'pagaEm'], delta));
  console.log(`cobrancas gravadas: ${cobrancas.length}`);
  await gravar('homologacoes', deslocar(homologacoes, ['criadoEm'], delta));
  console.log(`homologacoes gravadas: ${homologacoes.length}`);

  // confere no banco: a recarga mais recente deve estar 30 min antes de agora
  const ultima = await tentar<{ fim: string }[]>('conferir', () => sb.from('sessoes').select('fim').eq('demo', true)
    .not('fim', 'is', null).order('fim', { ascending: false }).limit(1));
  console.log(`pronto. Última recarga de demonstração agora termina em ${ultima[0] ? dataHora(ultima[0].fim) : '—'}. Dê F5 nas janelas abertas.`);
}

// só executa quando chamado direto (o teste importa as funções puras sem tocar no banco)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e: Error) => { console.error(`falhou: ${e.message}`); process.exit(1); });
}
