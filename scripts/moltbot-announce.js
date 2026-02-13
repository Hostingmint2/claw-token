/*
  Usage: node scripts/moltbot-announce.js --message "Short announcement" [--dry]
  - If your local Moltbot gateway is running, this will POST a draft announce to the gateway API (no secrets committed).
  - Set GATEWAY_URL (default: http://127.0.0.1:11434) and GATEWAY_TOKEN if required.
*/

import fs from 'fs';
import fetch from 'node-fetch';

const argv = process.argv.slice(2);
const msgArg = argv.find(a => a.startsWith('--message=')) || argv.find(a => a === '--message' && argv[argv.indexOf(a)+1]);
const dry = argv.includes('--dry');
let message = '';
if (msgArg) message = msgArg.includes('=') ? msgArg.split('=')[1] : argv[argv.indexOf(msgArg)+1] || '';
if (!message) message = fs.readFileSync('./marketing/social-copy.md', 'utf8').split('\n')[0] || 'Announcing Claw Token';

const gatewayUrl = process.env.GATEWAY_URL || 'http://127.0.0.1:11434';
const token = process.env.GATEWAY_TOKEN || '';

const payload = {
  type: 'announce',
  channel: 'telegram',
  body: message + '\n\nhttps://hostingmint2.github.io/claw-token-site/',
  meta: { sha256: '9A308A62AA389D441FA6038307A92A0E4526567557F8A8257529C6FE9FE4539B' }
};

async function run() {
  console.log('Prepared announce message:\n', payload.body);
  if (dry) return console.log('Dry run — not posting.');
  try {
    const res = await fetch(`${gatewayUrl}/announce`, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: `Bearer ${token}` } : {}),
      body: JSON.stringify(payload)
    });
    const data = await res.text();
    console.log('Gateway response:', res.status, data);
  } catch (err) {
    console.error('Failed to reach gateway:', err.message || err);
  }
}

run();
