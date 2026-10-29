// Static file server for the Gibraltar web viewer. Node built-ins only.
//
//   node gibraltar/web/serve.mjs            -> http://127.0.0.1:8080/web/
//   PORT=9000 HOST=0.0.0.0 node gibraltar/web/serve.mjs
//
// Serves the whole gibraltar/ folder so the page at /web/ can fetch
// ../data/build/manifest.json and the tile .glb files.
// GIB_DATA=/path/to/other/build serves a different pipeline build at /data/build/
// (handy for checking a preview build without installing it).

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url))); // gibraltar/
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '127.0.0.1';
const DATA_OVERRIDE = process.env.GIB_DATA ? resolve(process.env.GIB_DATA) : null;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/' || pathname === '') {
      res.writeHead(302, { location: '/web/' }).end();
      return;
    }
    if (pathname.endsWith('/')) pathname += 'index.html';
    let base = ROOT;
    if (DATA_OVERRIDE && pathname.startsWith('/data/build/')) {
      base = DATA_OVERRIDE;
      pathname = pathname.slice('/data/build'.length);
    }
    const filePath = resolve(join(base, normalize(pathname)));
    if (filePath !== base && !filePath.startsWith(base + sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const info = await stat(filePath).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'content-length': info.size,
      'cache-control': 'no-cache',
    });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(500, { 'content-type': 'text/plain' }).end('Server error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Gibraltar viewer: http://${HOST === '0.0.0.0' ? '127.0.0.1' : HOST}:${PORT}/web/`);
  console.log(`Serving ${ROOT}${DATA_OVERRIDE ? ` (data/build -> ${DATA_OVERRIDE})` : ''}`);
});
