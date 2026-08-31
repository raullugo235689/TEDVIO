import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, '../..');
const port = Number(process.env.PORT || 4174);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function resolveRequest(rawUrl) {
  const url = new URL(rawUrl || '/', 'http://127.0.0.1');
  const pathname = decodeURIComponent(url.pathname);
  if (pathname === '/teacher' || pathname === '/teacher/' || pathname === '/teacher-v2' || pathname === '/teacher-v2/') {
    return path.join(repositoryRoot, 'teacher-v2/index.html');
  }
  if (pathname === '/teacher-legacy' || pathname === '/teacher-legacy/') {
    return path.join(repositoryRoot, 'teacher.html');
  }
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  return path.join(repositoryRoot, relative);
}

const server = http.createServer((request, response) => {
  const file = resolveRequest(request.url);
  if (!file.startsWith(repositoryRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'content-type': types[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'cache-control': file.includes(`${path.sep}assets${path.sep}`)
      ? 'public, max-age=31536000, immutable'
      : 'no-store',
  });
  fs.createReadStream(file).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`TEDVIO Phase 6 server listening on http://127.0.0.1:${port}`);
});
