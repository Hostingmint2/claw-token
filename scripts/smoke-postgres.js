import { initPostgres } from '../db/postgres.js';
import 'dotenv/config';

async function main() {
  const url = process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/postgres';
  try {
    await initPostgres(url);
    console.log('Postgres + pg-boss initialized OK');
    process.exit(0);
  } catch (err) {
    console.error('Postgres smoke test failed:', err);
    process.exit(1);
  }
}

main();
