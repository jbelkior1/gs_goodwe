/**
 * Migra o preço base dos pontos para a tarifa v2 (ADR-0013).
 *
 *   npm run tarifa:migrar                 aplica
 *   npm run tarifa:migrar -- --simular    só mostra o que faria, sem gravar
 *
 * Na v1 o preço era base × fator de horário × fator de ocupação × fator de energia da região.
 * Na v2 a energia da região sai do preço (ela só define o piso e o preço base sugerido). Para
 * manter o nível de preço dos pontos que já existem, o preço base vira
 * cent(base × fator de energia antigo da região).
 *
 * Pode rodar de novo: cada ponto migrado ganha um evento 'TARIFA_V2_MIGRADA' (de, para) e quem
 * já tem o evento é pulado. Se uma rodada cair entre o evento e a gravação do preço, a rodada
 * seguinte completa o que faltou, sem aplicar o fator duas vezes. Ponto sem preço base válido
 * recebe o sugerido da região.
 * Usa a chave secreta do .env.local (SUPABASE_URL e SUPABASE_SECRET_KEY).
 */
import { createClient } from '@supabase/supabase-js';
import { cent, fatorEnergiaV1, sugerirPrecoBase } from '../src/domain/engine/tarifa';
import { REGIOES } from '../src/domain/catalogo';
import { num } from '../src/domain/formato';

const URL = process.env.SUPABASE_URL;
const CHAVE = process.env.SUPABASE_SECRET_KEY;
if (!URL || !CHAVE) {
  console.error('Faltam SUPABASE_URL e SUPABASE_SECRET_KEY no .env.local');
  process.exit(1);
}
const simular = process.argv.includes('--simular');
const sb = createClient(URL, CHAVE, { auth: { persistSession: false } });

interface PontoLinha { id: string; nome: string; regiaoId: string; precoBaseKWh: number | null }
interface EventoMigracao { pontoId: string; detalhe: { de: number | null; para: number } | null }

const fmt = (v: number | null) => (v == null ? '—' : num(v, 2));
const precoValido = (v: number | null): v is number => v != null && Number.isFinite(v) && cent(v) > 0;

async function ler<T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>, rotulo: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${rotulo}: ${error.message}`);
  return data as T;
}

/** grava o novo preço só se o ponto ainda tem o preço lido (ninguém mexeu no meio) */
async function gravar(id: string, atual: number | null, para: number) {
  const q = sb.from('pontos').update({ precoBaseKWh: para }).eq('id', id);
  await ler(atual == null ? q.is('precoBaseKWh', null) : q.eq('precoBaseKWh', atual), 'pontos');
}

const pontos = await ler<PontoLinha[]>(sb.from('pontos').select('id, nome, regiaoId, precoBaseKWh').order('id'), 'pontos');
const feitos = await ler<EventoMigracao[]>(sb.from('eventos').select('pontoId, detalhe').eq('tipo', 'TARIFA_V2_MIGRADA'), 'eventos');
const evento = new Map(feitos.map((e) => [e.pontoId, e.detalhe]));

console.log(`${simular ? 'SIMULAÇÃO · ' : ''}${pontos.length} pontos, ${evento.size} já migrados`);
console.log('ponto    UF  custo   de      para    situação');

let migrados = 0, completados = 0, pulados = 0;
for (const p of pontos) {
  const regiao = REGIOES.find((r) => r.id === p.regiaoId) ?? REGIOES[0];
  const atual = p.precoBaseKWh == null ? null : Number(p.precoBaseKWh);
  const linha = (de: number | null, para: number, situacao: string) =>
    console.log(`${p.id.padEnd(8)} ${regiao.uf}  ${fmt(regiao.custoEnergiaKWh).padEnd(6)}  ${fmt(de).padEnd(6)}  ${fmt(para).padEnd(6)}  ${situacao}`);

  const feito = evento.get(p.id);
  if (feito) {
    // evento gravado: se o preço ainda é o de antes, a gravação da rodada anterior caiu no meio e é completada agora
    const igualAoAntigo = feito.de == null ? !precoValido(atual) : precoValido(atual) && cent(atual) === cent(feito.de);
    if (igualAoAntigo && feito.de !== feito.para) {
      linha(atual, feito.para, 'completando rodada interrompida');
      if (!simular) await gravar(p.id, atual, feito.para);
      completados++;
    } else {
      pulados++;
    }
    continue;
  }

  const para = precoValido(atual) ? cent(cent(atual) * fatorEnergiaV1(regiao.custoEnergiaKWh)) : sugerirPrecoBase(regiao);
  linha(atual, para, precoValido(atual) ? 'migrar' : 'sem preço válido: usar o sugerido da região');
  if (!simular) {
    // o evento vem primeiro: se a gravação cair, a próxima rodada sabe o que faltou
    await ler(sb.from('eventos').insert({
      tipo: 'TARIFA_V2_MIGRADA', pontoId: p.id, ator: 'migracao',
      detalhe: { de: atual, para, fatorEnergiaV1: fatorEnergiaV1(regiao.custoEnergiaKWh), regiaoId: regiao.id },
    }), 'eventos');
    await gravar(p.id, atual, para);
  }
  migrados++;
}

console.log(`\n${simular ? 'Nada foi gravado. ' : ''}migrados: ${migrados} · completados: ${completados} · já estavam: ${pulados}`);
