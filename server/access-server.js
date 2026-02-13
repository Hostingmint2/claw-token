import "dotenv/config";
import fs from "node:fs";
import express from "express";
import helmet from "helmet";
import crypto from "node:crypto";
import bs58 from "bs58";
import nacl from "tweetnacl";
import jwt from "jsonwebtoken";
import * as Sentry from '@sentry/node';
import { Connection, PublicKey } from "@solana/web3.js";
import { loadTelegramStore, saveTelegramStore } from "./telegram-store.js";

// Optional Sentry init (errors / performance)
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV || 'development' });
}

// Lightweight in-memory rate limiter for public endpoints (configurable via env)
function createRateLimiter({ windowMs = 60_000, max = 120 } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    try {
      const ip = req.ip || req.connection?.remoteAddress || 'anon';
      const now = Date.now();
      const rec = hits.get(ip) || { count: 0, reset: now + windowMs };
      if (now > rec.reset) { rec.count = 0; rec.reset = now + windowMs; }
      rec.count += 1;
      hits.set(ip, rec);
      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - rec.count)));
      res.setHeader('X-RateLimit-Reset', String(Math.floor(rec.reset / 1000)));
      if (rec.count > max) return res.status(429).json({ error: 'rate limit exceeded' });
      next();
    } catch (err) { next(); }
  };
}

const app = express();

// Security headers
app.use(helmet());

app.use(express.json({ limit: "1mb" }));

// Privacy mode: if enabled, suppress sensitive request logs
const PRIVACY_MODE = String(process.env.PRIVACY_MODE || 'true') === 'true';

// Basic CORS for static site hosting — keep strict in production
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Apply rate limiter to public endpoints
const RATE_WINDOW_MS = Number(process.env.RATE_WINDOW_MS || 60_000);
const RATE_MAX = Number(process.env.RATE_MAX || 120);
app.use(createRateLimiter({ windowMs: RATE_WINDOW_MS, max: RATE_MAX }));

// Minimal request logger that respects privacy mode
app.use((req, _res, next) => {
  if (!PRIVACY_MODE) console.log(new Date().toISOString(), req.method, req.path, req.ip);
  next();
});

const rpcUrl = process.env.RPC_URL?.trim();
const mintAddress = process.env.MINT_ADDRESS?.trim();
const jwtSecret = process.env.ACCESS_JWT_SECRET?.trim();
const accessPort = Number(process.env.ACCESS_PORT ?? 8790);

const tierBronze = Number(process.env.TIER_BRONZE ?? 100);
const tierSilver = Number(process.env.TIER_SILVER ?? 1000);
const tierGold = Number(process.env.TIER_GOLD ?? 10000);

// Production safety: require TLS or explicit acknowledgement of TLS offload
const NODE_ENV = String(process.env.NODE_ENV || 'development');
const ALLOW_TLS_OFFLOAD = String(process.env.ALLOW_TLS_OFFLOAD || 'false') === 'true';
if (NODE_ENV === 'production' && !ALLOW_TLS_OFFLOAD) {
  if (!process.env.TLS_CERT_PATH || !process.env.TLS_KEY_PATH) {
    throw new Error('FATAL: In production, TLS must be configured (set TLS_CERT_PATH/TLS_KEY_PATH) or set ALLOW_TLS_OFFLOAD=true when terminating TLS at the proxy');
  }
}

if (!rpcUrl) throw new Error("RPC_URL missing");
if (!mintAddress) throw new Error("MINT_ADDRESS missing");
if (!jwtSecret || jwtSecret.length < 24) {
  throw new Error("ACCESS_JWT_SECRET missing or too short (>=24 chars)");
}

const connection = new Connection(rpcUrl, "confirmed");
const mint = new PublicKey(mintAddress);

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const challenges = new Map();

function randomNonce() {
  return crypto.randomUUID();
}

function buildLoginMessage(params) {
  return [
    "ClawToken access login",
    `wallet=${params.wallet}`,
    `nonce=${params.nonce}`,
    `issuedAt=${params.issuedAt}`,
  ].join("\n");
}

function setChallenge(params) {
  const record = {
    wallet: params.wallet,
    nonce: params.nonce,
    issuedAt: params.issuedAt,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  };
  challenges.set(params.wallet, record);
  return record;
}

function getChallenge(wallet) {
  const record = challenges.get(wallet);
  if (!record) return null;
  if (Date.now() > record.expiresAt) {
    challenges.delete(wallet);
    return null;
  }
  return record;
}

function verifyWalletSignature(params) {
  const publicKey = new PublicKey(params.wallet);
  const messageBytes = new TextEncoder().encode(params.message);
  let sigBytes;
  try {
    sigBytes = bs58.decode(params.signature);
  } catch {
    sigBytes = new Uint8Array(Buffer.from(params.signature, "base64"));
  }
  return nacl.sign.detached.verify(messageBytes, sigBytes, publicKey.toBytes());
}

async function getTokenBalanceUi(owner) {
  const resp = await connection.getParsedTokenAccountsByOwner(owner, {
    mint,
  });
  const accounts = resp.value ?? [];
  let total = 0;
  for (const item of accounts) {
    const amount = item.account?.data?.parsed?.info?.tokenAmount?.uiAmount;
    if (typeof amount === "number") total += amount;
  }
  return total;
}

function computeTier(balance) {
  if (balance >= tierGold) return "gold";
  if (balance >= tierSilver) return "silver";
  if (balance >= tierBronze) return "bronze";
  return "none";
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, mint: mint.toBase58(), pwa: !!process.env.PWA_PUBLIC_URL || undefined });
});

// --- Serve bundled PWA from the same always-on server (optional, cheap + simple)
import expressStatic from 'express';
const PUBLIC_SITE_DIR = process.env.PWA_DIR || path.join(__dirname, '..', 'site');
try {
  // mount at /app for clear separation from API
  app.use('/app', express.static(PUBLIC_SITE_DIR, { index: 'index.html' }));
  // quick download route for latest packaged release
  app.get('/app/download/latest', (req, res) => {
    try {
      const metaPath = path.join(PUBLIC_SITE_DIR, 'releases', 'latest.json');
      if (!fs.existsSync(metaPath)) return res.status(404).send('no-release');
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      const zipPath = path.join(PUBLIC_SITE_DIR, meta.path, '..', `${meta.tag}.zip`);
      const resolved = path.resolve(PUBLIC_SITE_DIR, zipPath);
      if (!fs.existsSync(resolved)) return res.status(404).send('zip-not-found');
      res.download(resolved);
    } catch (err) {
      res.status(500).send('error');
    }
  });
} catch (e) {
  // noop; static serving is best-effort
}

app.post("/auth/challenge", (req, res) => {
  try {
    const wallet = String(req.body?.wallet || "").trim();
    if (!wallet) return res.status(400).json({ error: "wallet required" });
    new PublicKey(wallet);

    const nonce = randomNonce();
    const issuedAt = new Date().toISOString();
    const record = setChallenge({ wallet, nonce, issuedAt });
    const message = buildLoginMessage(record);

    res.json({ wallet, nonce, issuedAt, message, expiresInMs: CHALLENGE_TTL_MS });
  } catch (err) {
    res.status(400).json({ error: String(err?.message || err) });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const wallet = String(req.body?.wallet || "").trim();
    const nonce = String(req.body?.nonce || "").trim();
    const signature = String(req.body?.signature || "").trim();

    if (!wallet) return res.status(400).json({ error: "wallet required" });
    if (!nonce || !signature) return res.status(400).json({ error: "nonce and signature required" });

    const challenge = getChallenge(wallet);
    if (!challenge || challenge.nonce !== nonce) {
      return res.status(403).json({ error: "invalid or expired challenge" });
    }

    const message = buildLoginMessage(challenge);
    const okSig = verifyWalletSignature({ wallet, message, signature });
    if (!okSig) return res.status(403).json({ error: "signature verification failed" });

    const owner = new PublicKey(wallet);
    const balance = await getTokenBalanceUi(owner);
    const tier = computeTier(balance);

    const token = jwt.sign(
      {
        sub: wallet,
        tier,
        bal: balance,
        mint: mint.toBase58(),
      },
      jwtSecret,
      { expiresIn: "2h" },
    );

    challenges.delete(wallet);

    res.json({ ok: true, tier, balance, token, mint: mint.toBase58() });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// Telegram code login (pseudonymous).
// The Telegram bot writes one-time codes into TELEGRAM_STORE; this endpoint consumes them.
app.post("/auth/telegram/consume", (req, res) => {
  try {
    const code = String(req.body?.code || "").trim();
    if (!code) return res.status(400).json({ error: "code required" });

    const store = loadTelegramStore();
    const record = store.codes?.[code];
    if (!record) return res.status(401).json({ error: "invalid code" });
    if (record.usedAt) return res.status(409).json({ error: "code already used" });
    if (typeof record.expiresAt === "number" && Date.now() > record.expiresAt) {
      return res.status(401).json({ error: "code expired" });
    }

    const tgUserId = String(record.tgUserId || "");
    const user = store.users?.[tgUserId];
    const clawId = typeof user?.clawId === "string" ? user.clawId : "";
    if (!clawId) return res.status(500).json({ error: "missing identity" });

    // mark code used
    record.usedAt = new Date().toISOString();
    store.codes[code] = record;

    // If this Telegram user has a linked wallet, include their tier and balance in the JWT
    const tier = typeof user?.tier === "string" ? user.tier : "anon";
    const bal = typeof user?.bal === "number" ? user.bal : 0;

    // persist any changes
    saveTelegramStore(store);

    // Issue a JWT that preserves the anonymity of the Telegram user (sub=clawId)
    // but includes their tier/balance so services can gate access without the wallet being public.
    const payload = {
      sub: clawId,
      tier,
      bal,
      auth: "telegram",
    };

    const token = jwt.sign(payload, jwtSecret, { expiresIn: "2h" });

    return res.json({ ok: true, tier, balance: bal, token });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
});

// Verify and link a Wallet to a Telegram Claw ID privately.
// POST /auth/telegram/verify-wallet
// body: { clawId, wallet, signature, nonce }
app.post('/auth/telegram/verify-wallet', async (req, res) => {
  try {
    const clawId = String(req.body?.clawId || '').trim();
    const wallet = String(req.body?.wallet || '').trim();
    const signature = String(req.body?.signature || '').trim();
    const nonce = String(req.body?.nonce || '').trim();
    if (!clawId || !wallet || !signature || !nonce) return res.status(400).json({ error: 'clawId, wallet, signature and nonce required' });

    const store = loadTelegramStore();
    // find user by clawId
    let tgUserId = null;
    for (const k of Object.keys(store.users || {})) {
      if (store.users[k]?.clawId === clawId) { tgUserId = k; break; }
    }
    if (!tgUserId) return res.status(404).json({ error: 'claw id not found' });

    const user = store.users[tgUserId];
    const link = user?.linkChallenge;
    if (!link || link.nonce !== nonce) return res.status(400).json({ error: 'no matching link challenge' });
    if (typeof link.expiresAt === 'number' && Date.now() > link.expiresAt) return res.status(400).json({ error: 'link challenge expired' });

    // verify signature: message format = claw:link:${clawId}:${nonce}
    const message = `claw:link:${clawId}:${nonce}`;
    const ok = verifyWalletSignature({ wallet, message, signature });
    if (!ok) return res.status(401).json({ error: 'signature verification failed' });

    // check on-chain balance for MINT
    const owner = new PublicKey(wallet);
    const balance = await getTokenBalanceUi(owner);
    const tier = computeTier(balance);

    // store link privately (we store wallet, tier and bal in the private telegram store)
    user.linkedWallet = wallet;
    user.bal = balance;
    user.tier = tier;
    user.linkedAt = new Date().toISOString();
    delete user.linkChallenge;

    store.users[tgUserId] = user;
    saveTelegramStore(store);

    return res.json({ ok: true, tier, balance });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
});

// Mint a short-lived token specifically for chat relay auth.
// This keeps the main access token out of long-lived WS sessions.
app.post("/auth/chat-token", (req, res) => {
  try {
    const accessToken = String(req.body?.token || "").trim();
    if (!accessToken) return res.status(400).json({ error: "token required" });

    let payload;
    try {
      payload = jwt.verify(accessToken, jwtSecret);
    } catch {
      return res.status(401).json({ error: "invalid token" });
    }

    const wallet = typeof payload?.sub === "string" ? payload.sub : "";
    const tier = typeof payload?.tier === "string" ? payload.tier : "none";
    if (!wallet) return res.status(401).json({ error: "invalid token" });
    if (tier === "none") return res.status(403).json({ error: "insufficient tier" });

    const chatToken = jwt.sign(
      {
        sub: wallet,
        tier,
        auth: typeof payload?.auth === "string" ? payload.auth : "wallet",
        scope: "chat",
        aud: "clawchat",
      },
      jwtSecret,
      { expiresIn: "10m" },
    );

    return res.json({ ok: true, token: chatToken, expiresIn: 600 });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
});

// --- Telegram webhook receiver (optional)
// Allows hosting Telegram webhook on the access server so no long-lived bot process is required.
// Security: requires TLS and supports TELEGRAM_WEBHOOK_SECRET header verification.
app.post('/telegram/webhook', express.json(), async (req, res) => {
  try {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
    if (secret) {
      const hdr = String(req.headers['x-telegram-bot-api-secret-token'] || '');
      if (!hdr || hdr !== secret) return res.status(403).json({ error: 'invalid webhook secret' });
    }

    const body = req.body || {};
    const message = body.message || body.edited_message || null;
    if (!message) return res.status(200).send('ok');

    const chatId = message.chat?.id;
    const text = String(message.text || '').trim();
    if (!chatId || !text) return res.status(200).send('ok');

    // support: /start and /code -> issue a login code and reply
    if (text.startsWith('/start') || text.startsWith('/code')) {
      const store = loadTelegramStore();
      const tgUserId = String(message.from?.id || '');
      if (!tgUserId) return res.status(200).send('ok');

      // ensure user record
      let user = store.users?.[tgUserId];
      if (!user) {
        const clawId = `claw_${crypto.randomUUID()}`;
        user = { clawId, createdAt: new Date().toISOString() };
        store.users = store.users || {};
        store.users[tgUserId] = user;
      }

      // issue code
      const code = Buffer.from(crypto.randomBytes(9)).toString('base64url');
      const rec = { tgUserId, code, issuedAt: new Date().toISOString(), expiresAt: Date.now() + 10 * 60 * 1000, usedAt: null };
      store.codes = store.codes || {};
      store.codes[code] = rec;
      saveTelegramStore(store);

      // reply via Telegram sendMessage
      const tokenFile = process.env.TELEGRAM_BOT_TOKEN_FILE?.trim();
      const envToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
      let botToken = envToken;
      try { if (!botToken && tokenFile) botToken = fs.readFileSync(tokenFile, 'utf8').trim(); } catch {}
      if (botToken) {
        const reply = `Claw login code (10 min):\n${code}`;
        try {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: reply }) });
        } catch (e) { /* ignore send errors */ }
      }
    }

    return res.status(200).send('ok');
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
});

app.listen(accessPort, () => {
  console.log(`Access server listening on ${accessPort}`);
});
