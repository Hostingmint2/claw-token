#!/usr/bin/env node
import http from 'http';

function check(url, timeout = 2000) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(timeout, () => { req.destroy(); resolve(false); });
  });
}

(async () => {
  const checks = [
    { name: 'Access server', url: 'http://127.0.0.1:8790/health' },
    { name: 'OpenClaw agent', url: 'http://127.0.0.1:9800/health' },
  ];
  let ok = true;
  for (const c of checks) {
    const up = await check(c.url);
    console.log(`${c.name}: ${up ? 'OK' : 'DOWN'} (${c.url})`);
    if (!up) ok = false;
  }
  process.exit(ok ? 0 : 2);
})();