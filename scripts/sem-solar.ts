/**
 * Tira a geração própria (painel FV e bateria) de todos os pontos no banco (22/10/2026: os pontos não
 * têm solar e o sistema não mostra mais isso).
 *
 *   npm run demo:sem-solar            mostra o que mudaria, sem gravar
 *   npm run demo:sem-solar -- --gravar grava (e guarda antes um backup em .backup/)
 *
 * Com `temSolar` falso, o desconto "Energia do sol do ponto" e a geração no controle de demanda dão
 * zero no app e no simulador ao mesmo tempo (os dois leem o ponto do banco), sem mexer no motor.
 * Para voltar: os valores antigos ficam no backup e no histórico do seed (git).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const CHAVE = process.env.SUPABASE_SECRET_KEY;
if (!URL || !CHAVE) {
  console.error('Faltam SUPABASE_URL e SUPABASE_SECRET_KEY no .env.local');
  process.exit(1);
}
const sb = createClient(URL, CHAVE, { auth: { persistSession: false } });
const gravar = process.argv.includes('--gravar');

interface Linha { id: string; nome: string; temSolar: boolean; potenciaFVkWp: number; temBateria: boolean; capacidadeBateriaKWh: number }

const { data, error } = await sb.from('pontos').select('id,nome,temSolar,potenciaFVkWp,temBateria,capacidadeBateriaKWh').order('id');
if (error) throw new Error(`pontos: ${error.message}`);
const pontos = (data ?? []) as Linha[];
const comSolar = pontos.filter((p) => p.temSolar || p.temBateria || Number(p.potenciaFVkWp) > 0 || Number(p.capacidadeBateriaKWh) > 0);

console.log(`${pontos.length} pontos no banco; ${comSolar.length} com painel ou bateria:`);
for (const p of comSolar) console.log(`  ${p.id} ${p.nome}: ${p.potenciaFVkWp} kWp, bateria ${p.capacidadeBateriaKWh} kWh`);
if (!comSolar.length) { console.log('Nada a mudar.'); process.exit(0); }
if (!gravar) { console.log('\nNada gravado. Rode com -- --gravar para tirar a geração desses pontos.'); process.exit(0); }

mkdirSync('.backup', { recursive: true });
const arquivo = `.backup/pontos-solar-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(arquivo, JSON.stringify(comSolar, null, 2));
console.log(`\nbackup: ${arquivo}`);

const r = await sb.from('pontos')
  .update({ temSolar: false, potenciaFVkWp: 0, temBateria: false, capacidadeBateriaKWh: 0 })
  .in('id', comSolar.map((p) => p.id))
  .select('id');
if (r.error) throw new Error(`atualizar: ${r.error.message}`);
console.log(`${r.data?.length ?? 0} pontos atualizados: sem painel e sem bateria.`);
