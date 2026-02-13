#!/usr/bin/env node
import 'dotenv/config';

function fail(msg) { console.error('✖', msg); process.exitCode = 1; }
function ok(msg) { console.log('✔', msg); }

console.log('Security preflight check');

const ACCESS_JWT_SECRET = process.env.ACCESS_JWT_SECRET || '';
if (!ACCESS_JWT_SECRET || ACCESS_JWT_SECRET.length < 24) fail('ACCESS_JWT_SECRET missing or too short (>=24 chars recommended)'); else ok('ACCESS_JWT_SECRET present');

const OPENCLAW_EXECUTE = String(process.env.OPENCLAW_EXECUTE || 'false') === 'true';
const NODE_ENV = String(process.env.NODE_ENV || 'development');
const SIGNER_MODE = String(process.env.SIGNER_MODE || 'local');

if (NODE_ENV === 'production' && OPENCLAW_EXECUTE) {
  ok('OPENCLAW_EXECUTE requested in production');
  if (SIGNER_MODE !== 'kms') fail('In production, SIGNER_MODE must be set to kms'); else ok('SIGNER_MODE=kms');
  const KMS_PROVIDER = String(process.env.KMS_PROVIDER || '');
  const KMS_KEY_ID = String(process.env.KMS_KEY_ID || '');
  if (!KMS_PROVIDER || !KMS_KEY_ID) fail('KMS_PROVIDER and KMS_KEY_ID required when SIGNER_MODE=kms'); else ok('KMS config present');
}

// DB checks
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
if (OPENCLAW_EXECUTE && !DATABASE_URL) fail('DATABASE_URL (Postgres) required for production execute'); else if (DATABASE_URL) ok('DATABASE configured');

// RPC key
const RPC_URL = process.env.RPC_URL || process.env.SOLANA_RPC_URL || '';
if (OPENCLAW_EXECUTE && !RPC_URL) fail('RPC_URL is required when execute is enabled'); else if (RPC_URL) ok('RPC_URL set');

// TLS check
const ALLOW_TLS_OFFLOAD = String(process.env.ALLOW_TLS_OFFLOAD || 'false') === 'true';
if (!process.env.TLS_CERT_PATH || !process.env.TLS_KEY_PATH) {
  if (NODE_ENV === 'production' && !ALLOW_TLS_OFFLOAD) {
    fail('TLS certificate/key not configured (set TLS_CERT_PATH & TLS_KEY_PATH) or set ALLOW_TLS_OFFLOAD=true when terminating TLS upstream');
  } else {
    console.warn('⚠ TLS certificate/key not configured via TLS_CERT_PATH/TLS_KEY_PATH — ensure TLS termination in front of services');
  }
} else {
  ok('TLS cert/key configured');
}

// Finalize
if (process.exitCode === 0) {
  console.log('\nAll checks passed (or only warnings).');
  process.exit(0);
} else {
  console.error('\nSecurity preflight failed. Fix issues and re-run.');
  process.exit(2);
}
