// Gera o .env.local a partir do projeto Supabase linkado pela CLI, sem mostrar as chaves na tela.
//   node scripts/criar-env.mjs
// Pré-requisito: npx supabase login  e  npx supabase link --project-ref <ref>
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const refArq = 'supabase/.temp/project-ref';
if (!existsSync(refArq)) {
  console.error('Projeto não linkado. Rode: npx supabase link --project-ref <ref>');
  process.exit(1);
}
const ref = readFileSync(refArq, 'utf8').trim();
const saida = execFileSync('npx', ['--yes', 'supabase@2', 'projects', 'api-keys', '--project-ref', ref, '-o', 'json'],
  { encoding: 'utf8', shell: process.platform === 'win32' });
const chaves = JSON.parse(saida.slice(saida.indexOf('[')));
const valor = (k) => k.api_key ?? k.apiKey ?? '';
const mascarada = (v) => !v || /[*•·]/.test(v);
const achar = (...testes) => {
  for (const t of testes) {
    const k = chaves.find(t);
    if (k && !mascarada(valor(k))) return valor(k);
  }
  return '';
};
const publica = achar((k) => k.type === 'publishable', (k) => k.name === 'anon');
const secreta = achar((k) => k.type === 'secret', (k) => k.name === 'service_role');
if (!publica || !secreta) {
  console.error('Não consegui ler as duas chaves pela CLI. Copie do painel: Project Settings → API Keys.');
  process.exit(1);
}

// mantém a senha das contas de demonstração se o arquivo já existir
const antigo = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : '';
const senha = antigo.match(/^DEMO_SENHA=(.+)$/m)?.[1] ?? randomBytes(9).toString('base64url');
const url = `https://${ref}.supabase.co`;

writeFileSync('.env.local', [
  '# gerado por scripts/criar-env.mjs — não vai para o git',
  `VITE_SUPABASE_URL=${url}`,
  `VITE_SUPABASE_PUBLISHABLE_KEY=${publica}`,
  'VITE_MODO_DEMO=true',
  `VITE_DEMO_SENHA=${senha}`,
  `SUPABASE_URL=${url}`,
  `SUPABASE_SECRET_KEY=${secreta}`,
  `DEMO_SENHA=${senha}`,
  'SIM_ACELERACAO=10',
  '',
].join('\n'));
console.log(`.env.local criado para o projeto ${ref} (chaves não exibidas).`);
