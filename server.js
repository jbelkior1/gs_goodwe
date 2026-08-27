/**
 * Servidor estático do Ponto W.
 *
 * O Railway roda `npm start` e injeta a porta em PORT. Como o app usa rotas
 * reais (/totem, /franqueado/...), toda rota desconhecida cai no index.html —
 * é o fallback de SPA. Sem dependência externa de propósito: o deploy fica
 * com a mesma árvore de node_modules do build.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const PORTA = Number(process.env.PORT) || 8080;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

/** Resolve o caminho pedido dentro de dist/, barrando "../". */
function resolver(url) {
  const caminho = decodeURIComponent(new URL(url, 'http://x').pathname);
  const destino = normalize(join(RAIZ, caminho));
  if (!destino.startsWith(RAIZ)) return null;
  if (existsSync(destino) && statSync(destino).isFile()) return destino;
  return null;
}

createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end();
    return;
  }

  const arquivo = resolver(req.url) ?? join(RAIZ, 'index.html');
  const ext = extname(arquivo);

  // o bundle vem com hash no nome, então pode ser cacheado para sempre;
  // o index.html nunca, senão o deploy novo não aparece
  const cache = arquivo.includes(`${'assets'}`) && ext !== '.html'
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';

  res.writeHead(200, { 'content-type': TIPOS[ext] ?? 'application/octet-stream', 'cache-control': cache });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(arquivo).pipe(res);
}).listen(PORTA, () => {
  console.log(`Ponto W no ar em http://0.0.0.0:${PORTA}`);
});
