#!/usr/bin/env node
import http from 'http';
import { promisify } from 'util';
const get = (url) => new Promise((resolve) => { http.get(url, (res) => resolve({ status: res.statusCode, headers: res.headers })); }).catch(() => ({ status: 0 }));

(async () => {
  console.log('PWA smoke test');
  const base = process.env.OPENCLAW_URL || 'http://localhost:8080';
  const tests = [
    { name: 'manifest', url: `${base}/manifest.json` },
    { name: 'service-worker', url: `${base}/sw.js` },
    { name: 'index', url: `${base}/index.html` },
    { name: 'icon-192', url: `${base}/assets/icon-192.svg` },
  ];
  let ok = true;
  for (const t of tests) {
    const r = await get(t.url);
    const pass = r.status === 200;
    console.log(`${t.name}: ${pass ? 'OK' : 'FAIL'} (${t.url})`);
    if (!pass) ok = false;
  }
  process.exit(ok ? 0 : 2);
})();