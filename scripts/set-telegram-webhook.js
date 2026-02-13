#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const tokenFile = process.env.TELEGRAM_BOT_TOKEN_FILE || path.join(process.cwd(), 'server', '.telegram_token');
let token = process.argv[2] || process.env.TELEGRAM_BOT_TOKEN || '';
const webhookUrl = process.argv[3] || process.env.TELEGRAM_WEBHOOK_URL || '';
const secret = process.argv[4] || process.env.TELEGRAM_WEBHOOK_SECRET || '';
if (!token) {
  try { token = fs.readFileSync(tokenFile, 'utf8').trim(); } catch (e) {}
}
if (!token) { console.error('Bot token required (arg | TELEGRAM_BOT_TOKEN | token file)'); process.exit(1); }
if (!webhookUrl) { console.error('Webhook URL required (arg 2 or TELEGRAM_WEBHOOK_URL)'); process.exit(1); }

(async () => {
  const body = { url: webhookUrl };
  if (secret) body['secret_token'] = secret;
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  console.log(data);
})();