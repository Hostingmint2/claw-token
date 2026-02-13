#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.SITE_PORT || 8080);
const ROOT = path.join(process.cwd(), 'site');

function contentType(file) {
  if (file.endsWith('.html')) return 'text/html';
  if (file.endsWith('.js')) return 'application/javascript';
  if (file.endsWith('.css')) return 'text/css';
  if (file.endsWith('.json')) return 'application/json';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  let filePath = path.join(ROOT, decodeURIComponent(url === '/' ? '/index.html' : url));
  if (!filePath.startsWith(ROOT)) return res.writeHead(403).end('Forbidden');
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    return res.end('Not found');
  }
  res.setHeader('Content-Type', contentType(filePath));
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => console.log('Static site server listening on', PORT));
