#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const tokenFile = process.env.TELEGRAM_BOT_TOKEN_FILE || path.join(process.cwd(), 'server', '.telegram_token');
let token = process.argv[2] || process.env.TELEGRAM_BOT_TOKEN || '';
if (!token) {
  try { token = fs.readFileSync(tokenFile, 'utf8').trim(); } catch (e) {}
}
if (!token) { console.error('Bot token required (arg | TELEGRAM_BOT_TOKEN | token file)'); process.exit(1); }

(async () => {
  const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, { method: 'POST' });
  const data = await res.json();
  console.log(data);
})();