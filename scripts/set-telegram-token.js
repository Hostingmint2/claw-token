#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const token = process.argv[2] || process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('Usage: node scripts/set-telegram-token.js <token>  OR set TELEGRAM_BOT_TOKEN env and run without args');
  process.exit(1);
}

const p = path.join(process.cwd(), 'server', '.telegram_token');
fs.mkdirSync(path.dirname(p), { recursive: true });
fs.writeFileSync(p, String(token).trim() + '\n', { mode: 0o600 });
console.log('Wrote token to', p);
