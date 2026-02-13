import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import { Telegraf } from "telegraf";
import { loadTelegramStore, saveTelegramStore } from "./telegram-store.js";

function getBotToken() {
  // Prefer token file for safer local storage (set TELEGRAM_BOT_TOKEN_FILE to a path)
  const tokenFile = process.env.TELEGRAM_BOT_TOKEN_FILE?.trim();
  if (tokenFile) {
    try {
      const raw = fs.readFileSync(tokenFile, 'utf8').trim();
      if (raw) return raw;
    } catch (err) {
      console.log('Failed to read TELEGRAM_BOT_TOKEN_FILE', err?.message || err);
    }
  }

  const envToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (envToken) return envToken;
  return null;
}

const botToken = getBotToken();
if (!botToken) console.log('TELEGRAM_BOT_TOKEN not set; Telegram bot disabled');

// when token is present use real bot, otherwise provide a no-op stub so the process can launch
const bot = botToken ? new Telegraf(botToken) : { start: async () => {}, command: () => {}, launch: () => {}, stop: async () => {} };

const CODE_TTL_MS = 10 * 60 * 1000;

function randomCode() {
  // human-friendly, not a wallet identifier
  return Buffer.from(crypto.randomBytes(9)).toString("base64url");
}

function getUserKey(ctx) {
  const id = ctx.from?.id;
  if (!id) return null;
  return String(id);
}

function ensureUser(store, tgUserId) {
  const existing = store.users[tgUserId];
  if (existing && typeof existing.clawId === "string") return existing;
  const clawId = `claw_${crypto.randomUUID()}`;
  const user = { clawId, createdAt: new Date().toISOString() };
  store.users[tgUserId] = user;
  return user;
}

function issueLoginCode(store, tgUserId) {
  const code = randomCode();
  const record = {
    tgUserId,
    code,
    issuedAt: new Date().toISOString(),
    expiresAt: Date.now() + CODE_TTL_MS,
    usedAt: null,
  };
  store.codes[code] = record;
  return record;
}

bot.start(async (ctx) => {
  const tgUserId = getUserKey(ctx);
  if (!tgUserId) return;

  const store = loadTelegramStore();
  const user = ensureUser(store, tgUserId);
  const codeRec = issueLoginCode(store, tgUserId);
  saveTelegramStore(store);

  const msg = [
    "Claw identity issued.",
    "",
    `Your Claw ID: ${user.clawId}`,
    "",
    "Login code (expires in 10 minutes):",
    codeRec.code,
    "",
    "Use this code on the Claw site to login anonymously (no Twitter required).",
    "",
    "OPSEC tips:",
    "- Use Tor Browser for the site/chat if you need anonymity",
    "- Use a dedicated wallet if you later link tokens",
  ].join("\n");

  await ctx.reply(msg);
});

bot.command("code", async (ctx) => {
  const tgUserId = getUserKey(ctx);
  if (!tgUserId) return;

  const store = loadTelegramStore();
  ensureUser(store, tgUserId);
  const codeRec = issueLoginCode(store, tgUserId);
  saveTelegramStore(store);

  await ctx.reply(`Login code (10 min):\n${codeRec.code}`);
});

// Link wallet flow: /link => bot issues a link challenge message to sign
function issueLinkChallenge(store, tgUserId) {
  const user = ensureUser(store, tgUserId);
  const nonce = crypto.randomUUID();
  const rec = { nonce, issuedAt: new Date().toISOString(), expiresAt: Date.now() + CODE_TTL_MS };
  user.linkChallenge = rec;
  store.users[tgUserId] = user;
  return rec;
}

bot.command('link', async (ctx) => {
  const tgUserId = getUserKey(ctx);
  if (!tgUserId) return;

  const store = loadTelegramStore();
  const user = ensureUser(store, tgUserId);
  const rec = issueLinkChallenge(store, tgUserId);
  saveTelegramStore(store);

  const msg = [
    'To link your wallet privately, sign the following message with your Solana wallet:',
    '',
    `claw:link:${user.clawId}:${rec.nonce}`,
    '',
    'Then reply with:',
    '/verify <WALLET_ADDRESS> <SIGNATURE_BASE64_or_BASE58>',
    '',
    'This proves token ownership privately to the bot; it will not post or share your wallet publicly.',
  ].join('\n');

  await ctx.reply(msg);
});

// Verify command: user responds with /verify <wallet> <signature>
bot.command('verify', async (ctx) => {
  const tgUserId = getUserKey(ctx);
  if (!tgUserId) return;

  const text = String(ctx.message?.text || '').trim();
  const parts = text.split(/\s+/).slice(1);
  if (parts.length < 2) return ctx.reply('Usage: /verify <WALLET_ADDRESS> <SIGNATURE>');
  const wallet = parts[0];
  const signature = parts[1];

  const store = loadTelegramStore();
  const user = store.users[tgUserId];
  if (!user?.linkChallenge) return ctx.reply('No link challenge found. Use /link first.');

  // Call access server to verify and store link privately
  try {
    const port = Number(process.env.ACCESS_PORT || 8790);
    const url = `http://127.0.0.1:${port}/auth/telegram/verify-wallet`;
    const body = { clawId: user.clawId, wallet, signature, nonce: user.linkChallenge.nonce };
    const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await resp.json();
    if (!resp.ok) return ctx.reply(`Verification failed: ${data?.error || 'unknown'}`);
    await ctx.reply(`Wallet linked privately. Tier: ${data.tier} balance: ${data.balance}`);
  } catch (err) {
    await ctx.reply(`Verification error: ${String(err?.message || err)}`);
  }
});

bot.command("opsec", async (ctx) => {
  await ctx.reply(
    [
      "OPSEC reminder:",
      "- Telegram accounts can be linked to phone numbers",
      "- Don’t reuse wallets tied to exchanges/KYC",
      "- Prefer Tor Browser for chat",
      "- E2EE protects content, not all metadata",
    ].join("\n"),
  );
});

bot.launch();
console.log("Telegram bot running");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
