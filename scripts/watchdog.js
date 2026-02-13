#!/usr/bin/env node
/*
  Watchdog: periodically checks health endpoints and restarts services (detached) if unhealthy.
  Designed for quick ops redundancy when running on a single host/container orchestration fallback.
*/
import http from 'node:http';
import { spawnSync } from 'child_process';

const CHECKS = [
  { name: 'access-server', url: process.env.ACCESS_HEALTH || 'http://127.0.0.1:8790/health', restartCmd: ['npm', ['run','start-access-server:detached']] },
  { name: 'openclaw-agent', url: process.env.AGENT_HEALTH || 'http://127.0.0.1:9800/health', restartCmd: ['npm', ['run','start-openclaw-agent:detached']] },
];
const INTERVAL = Number(process.env.WATCHDOG_INTERVAL_MS || 15000);

function check(url, timeout = 2000) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => resolve(res.statusCode === 200));
    req.on('error', () => resolve(false));
    req.setTimeout(timeout, () => { req.destroy(); resolve(false); });
  });
}

async function run() {
  console.log('Watchdog started — checks every', INTERVAL, 'ms');
  while (true) {
    for (const c of CHECKS) {
      try {
        const ok = await check(c.url);
        if (!ok) {
          console.error(new Date().toISOString(), 'Watchdog: service', c.name, 'is DOWN — attempting restart');
          // spawn restart command synchronously (fire-and-forget)
          try { spawnSync(c.restartCmd[0], c.restartCmd[1], { stdio: 'inherit' }); } catch (e) { console.error('restart failed', e?.message || e); }
        }
      } catch (err) {
        console.error('watchdog check error', err?.message || err);
      }
    }
    await new Promise((r) => setTimeout(r, INTERVAL));
  }
}

run().catch((e) => { console.error('watchdog fatal', e); process.exit(1); });