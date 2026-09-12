import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] === 'dist' ? 'dist' : 'source';
const port = Number(process.argv[3]) || (mode === 'dist' ? 4174 : 5174);
const root = mode === 'dist' ? path.join(projectRoot, 'dist') : projectRoot;

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);
    const pathname = decodeURIComponent(requestUrl.pathname);

    if (pathname === '/apps/table-close' || pathname === '/table-close' || pathname === '/table-close/') {
      response.writeHead(308, { Location: '/apps/table-close/' });
      response.end();
      return;
    }

    const relativePath = (pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''))
      .replace(/\/$/, '/index.html');
    const sourceFile = relativePath === 'index.html'
      || relativePath === '404.html'
      || relativePath.startsWith('src/');
    const requestRoot = mode === 'source'
      ? sourceFile ? projectRoot : path.join(projectRoot, 'public')
      : root;
    const filePath = safeResolve(requestRoot, relativePath);

    if (!(await isFile(filePath))) {
      const notFoundPath = path.join(root, '404.html');
      response.writeHead(404, {
        'Content-Type': 'text/html; charset=utf-8',
        ...(mode === 'dist' ? productionHeaders : {}),
      });
      createReadStream(notFoundPath).pipe(response);
      return;
    }

    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': mode === 'source' ? 'no-store' : 'public, max-age=0, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      ...(mode === 'dist' ? productionHeaders : {}),
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Bad request');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Poller Apps (${mode}) running at http://localhost:${port}`);
});

const productionHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function safeResolve(base, relativePath) {
  const resolved = path.resolve(base, relativePath);
  const relative = path.relative(base, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Requested path is outside the site root.');
  }
  return resolved;
}

async function isFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}
