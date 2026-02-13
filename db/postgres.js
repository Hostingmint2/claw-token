const PgBossModule = await import('pg-boss');
const PgBoss = PgBossModule.default ?? PgBossModule.PgBoss ?? PgBossModule;
import { Pool } from 'pg';

let pool = null;
let boss = null;

export async function initPostgres(connectionString) {
  if (pool) return { pool, boss };
  pool = new Pool({ connectionString });
  // ensure offers table exists
  await pool.query(`CREATE TABLE IF NOT EXISTS offers (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
  );`);

  // init pg-boss
  boss = new PgBoss({
    connectionString,
    // keep retrys conservative; visibility timeout allows for job retries
    noSupervisor: false,
  });
  await boss.start();

  return { pool, boss };
}

export async function upsertOfferPg(o) {
  const id = o.id;
  const now = new Date().toISOString();
  await pool.query(`INSERT INTO offers(id, data, created_at, updated_at) VALUES($1, $2, now(), now()) ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = now()`, [id, o]);
}

export async function getOfferPg(id) {
  const r = await pool.query(`SELECT data FROM offers WHERE id = $1`, [id]);
  if (!r.rows[0]) return null;
  return r.rows[0].data;
}

export async function readOffersPg() {
  const r = await pool.query(`SELECT data FROM offers`);
  return r.rows.map((r) => r.data);
}

export async function publishJob(name, data, opts = {}) {
  if (!boss) throw new Error('job queue not initialized');
  return boss.publish(name, data, opts);
}

export async function subscribeJob(name, handler, opts = {}) {
  if (!boss) throw new Error('job queue not initialized');
  return boss.subscribe(name, async (job) => {
    try {
      await handler(job.data, job);
      await job.done();
    } catch (err) {
      console.error('Job handler error', name, err);
      throw err;
    }
  }, opts);
}
