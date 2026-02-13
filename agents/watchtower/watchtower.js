#!/usr/bin/env node
// Basic watchtower scaffold: monitors offers.json and logs notable events.
import fs from 'fs';
import path from 'path';
import "dotenv/config";

const OFFERS_PATH = process.env.OPENCLAW_OFFERS_PATH || path.join(process.cwd(), 'agents', 'openclaw-agent', 'offers.json');
const POLL_MS = Number(process.env.WATCH_POLL_MS || 7000);

function readOffers() {
  try { return JSON.parse(fs.readFileSync(OFFERS_PATH, 'utf8')); } catch { return []; }
}

function log(...args) { console.log(new Date().toISOString(), ...args); }

async function loop() {
  let last = {};
  while (true) {
    try {
      const offers = readOffers();
      for (const o of offers) {
        const id = o.id;
        const state = JSON.stringify({ status: o.status, fulfilled: o.fulfilled });
        if (last[id] !== state) {
          log('offer', id, 'state changed', state);
          last[id] = state;
        }
      }
    } catch (err) { log('error', String(err)); }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

loop().catch((err) => { console.error('watchtower fatal', err); process.exit(1); });
