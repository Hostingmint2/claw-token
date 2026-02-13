/*
  Moltbot marketing poster

  - Builds a short advertising post using prioritized hashtags and optional submolts.
  - Posts to your local Moltbot gateway (`/announce`) or directly to Telegram if TELEGRAM_BOT_TOKEN+CHAT_ID provided.
  - Designed for cron/GitHub Actions scheduling. Use `--dry` to preview only.

  Examples:
    node scripts/moltbot-marketing.js --dry
    node scripts/moltbot-marketing.js --channel telegram --chat 123456789 --post
    # run from GitHub Actions with GATEWAY_URL + GATEWAY_TOKEN secrets
*/

import fetch from 'node-fetch';
import { argv } from 'process';

const defaults = {
  gatewayUrl: process.env.GATEWAY_URL || 'http://127.0.0.1:11434',
  gatewayToken: process.env.GATEWAY_TOKEN || '',
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChat: process.env.TELEGRAM_CHAT_ID || '',
  siteUrl: 'https://hostingmint2.github.io/claw-token-site/',
  zipSha256: '9A308A62AA389D441FA6038307A92A0E4526567557F8A8257529C6FE9FE4539B'
};

const builtinHashtags = [
  '#clawmint',
  '#privacy',
  '#solana',
  '#E2EE',
  '#web3',
  '#escrow',
  '#p2p',
  '#opensource',
  '#decentralized',
  '#agents'
];

function pickHashtags(n = 3, seed = Date.now()) {
  // deterministic-ish rotation based on day
  const r = Math.floor(seed / (1000 * 60 * 60 * 24));
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(builtinHashtags[(r + i) % builtinHashtags.length]);
  }
  return out;
}

function buildMessage({ headline, blurb, hashtags = [], submolts = [] }) {
  const tags = (hashtags || []).join(' ');
  const subs = (submolts && submolts.length) ? `\nSubmolts: ${submolts.join(', ')}` : '';
  return `${headline}\n\n${blurb}\n\nTry the PWA → ${defaults.siteUrl} \nDownload & verify: SHA256 ${defaults.zipSha256}\n\n${tags}${subs}`;
}

async function postToGateway(body) {
  const url = `${defaults.gatewayUrl.replace(/\/$/, '')}/announce`;
  const headers = { 'Content-Type': 'application/json' };
  if (defaults.gatewayToken) headers['Authorization'] = `Bearer ${defaults.gatewayToken}`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: res.status, body: await res.text() };
}

async function postTelegram(token, chatId, text) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: false }) });
  return { status: res.status, body: await res.json() };
}

function parseArgs() {
  const out = { dry: false, channel: 'gateway', hashtags: null, submolts: [], headline: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry') out.dry = true;
    else if (a.startsWith('--channel=')) out.channel = a.split('=')[1];
    else if (a.startsWith('--hashtags=')) out.hashtags = a.split('=')[1].split(',').map(s => s.trim());
    else if (a.startsWith('--submolts=')) out.submolts = a.split('=')[1].split(',').map(s => s.trim());
    else if (a.startsWith('--headline=')) out.headline = a.split('=')[1];
    else if (a === '--post') out.dry = false;
  }
  return out;
}

import fs from 'fs';
import { execSync } from 'child_process';

const LAST_POST_PATH = './marketing/last_post.json';

function readLastPost() {
  try {
    const raw = fs.readFileSync(LAST_POST_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { ts: 0, message: '' };
  }
}

function writeLastPost(obj) {
  fs.mkdirSync('./marketing', { recursive: true });
  fs.writeFileSync(LAST_POST_PATH, JSON.stringify(obj, null, 2));
}

async function main() {
  const args = parseArgs();
  const hashtags = args.hashtags || pickHashtags(4);
  const headline = args.headline || 'Claw — privacy-first SPL token, pseudonymous Telegram login, E2EE chat & private escrow.';
  const blurb = 'Claim via Moltbook, login pseudonymously with Telegram, and use OpenClaw for private escrow automation.';
  const message = buildMessage({ headline, blurb, hashtags, submolts: args.submolts });

  console.log('Prepared message:\n');
  console.log(message);
  console.log('\nChannel:', args.channel, 'dry:', args.dry);

  // cooldown logic (default 300s)
  const cooldownSeconds = Number(process.env.MARKETING_COOLDOWN_SECONDS || 300);
  const last = readLastPost();
  const now = Math.floor(Date.now() / 1000);
  const elapsed = now - (last.ts || 0);
  if (!args.dry && elapsed < cooldownSeconds) {
    console.log(`Skipping post — cooldown in effect (${elapsed}s elapsed, need ${cooldownSeconds}s).`);
    return;
  }

  if (args.dry) return console.log('\nDry run — nothing posted.');

  let posted = false;
  let result = null;

  if (args.channel === 'telegram') {
    const token = defaults.telegramToken;
    const chat = defaults.telegramChat;
    if (!token || !chat) return console.error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID required to post to Telegram.');
    result = await postTelegram(token, chat, message);
    console.log('Telegram response:', result);
    posted = result && (result.status === 200 || result.status === '200');
  } else {
    const payload = { type: 'announce', channel: 'telegram', body: message, meta: { hashtags, submolts: args.submolts } };
    try {
      result = await postToGateway(payload);
      console.log('Gateway response:', result.status, result.body);
      posted = result && result.status && result.status >= 200 && result.status < 300;
    } catch (err) {
      console.error('Failed to post to gateway:', err.message || err);
      posted = false;
    }

    // Fallback: if gateway failed and Telegram creds exist, attempt direct Telegram post
    if (!posted && defaults.telegramToken && defaults.telegramChat) {
      console.log('Gateway post failed — attempting Telegram fallback...');
      try {
        const tg = await postTelegram(defaults.telegramToken, defaults.telegramChat, message);
        console.log('Telegram fallback response:', tg.status, JSON.stringify(tg.body).slice(0, 400));
        posted = tg && (tg.status === 200 || tg.status === '200');
        if (posted) result = { via: 'telegram', status: tg.status, body: tg.body };
      } catch (err) {
        console.error('Telegram fallback failed:', err.message || err);
      }
    }
  }

  if (posted) {
    const record = { ts: now, message: message, channel: args.channel, result };
    writeLastPost(record);

    // If running in CI with GITHUB_TOKEN, commit the updated last_post.json so workflow respects cooldown.
    if (process.env.GITHUB_ACTIONS && process.env.GITHUB_TOKEN) {
      try {
        execSync('git config user.email "actions@github.com"');
        execSync('git config user.name "github-actions[bot]"');
        execSync('git add ' + LAST_POST_PATH);
        execSync('git commit -m "chore(marketing): update last_post after live announcement" || true');
        execSync('git push origin HEAD:master');
        console.log('Committed last_post.json to repo (CI).');
      } catch (e) {
        console.warn('Failed to commit last_post.json from CI:', e.message || e);
      }
    }
  } else {
    console.log('Post not confirmed — not updating last_post.json.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
