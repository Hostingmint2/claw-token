import fs from 'fs';
import path from 'path';
import { initPostgres, upsertOfferPg } from '../db/postgres.js';
import 'dotenv/config';

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const { pool } = await initPostgres(dbUrl);
  const OFFERS_PATH = process.env.OPENCLAW_OFFERS_PATH || path.join(path.dirname(import.meta.url.replace('file:///', '')), 'agents', 'openclaw-agent', 'offers.json');
  let offers = [];
  try { offers = JSON.parse(fs.readFileSync(process.env.OPENCLAW_OFFERS_PATH || 'agents/openclaw-agent/offers.json', 'utf8')); } catch (e) { console.error('offers file not found or invalid', e); process.exit(1); }
  for (const o of offers) {
    await upsertOfferPg(o);
    console.log('migrated', o.id);
  }
  console.log('Migration complete');
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });