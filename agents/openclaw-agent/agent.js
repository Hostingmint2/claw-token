#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import "dotenv/config";
import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV || 'development' });
}
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, transfer } from '@solana/spl-token';
import { createSigner } from './signer.js';
import crypto from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OFFERS_PATH = process.env.OPENCLAW_OFFERS_PATH || path.join(__dirname, 'offers.json');
const POLL_MS = Number(process.env.OPENCLAW_POLL_MS || 8000);
const ENABLE_EXECUTE = String(process.env.OPENCLAW_EXECUTE || 'false') === 'true';
const RPC_URL = process.env.RPC_URL || process.env.SOLANA_RPC_URL;
const KEYPAIR_PATH = process.env.KEYPAIR_PATH;

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

// Database-backed offers (file-based using lowdb) OR Postgres+pg-boss when DATABASE_URL is set
import { LowSync } from 'lowdb';
import { JSONFileSync } from 'lowdb/node';
import lockfile from 'proper-lockfile';
import { initPostgres, upsertOfferPg, readOffersPg, getOfferPg, publishJob, subscribeJob } from '../../db/postgres.js';
const DB_PATH = process.env.OPENCLAW_DB_PATH || path.join(__dirname, 'offers.json');

let usePostgres = false;
let postgresInit = null;

async function ensureDb() {
  if (postgresInit) return;
  if (process.env.DATABASE_URL) {
    postgresInit = await initPostgres(process.env.DATABASE_URL);
    usePostgres = true;
  }
}

// Ensure file exists (legacy fallback)
try { fs.mkdirSync(path.dirname(DB_PATH), { recursive: true }); } catch {}
if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({ offers: [] }, null, 2));

const adapter = new JSONFileSync(DB_PATH);
const db = new LowSync(adapter, { offers: [] });
db.read();
if (!db.data) db.data = { offers: [] };

function readOffers() {
  if (usePostgres) return readOffersPg();
  return (db.data.offers || []).map((r) => ({ ...r, fulfilled: Boolean(r.fulfilled) }));
}

function getOffer(id) {
  if (usePostgres) return getOfferPg(id);
  const r = (db.data.offers || []).find((x) => x.id === id);
  if (!r) return null;
  r.fulfilled = Boolean(r.fulfilled);
  return r;
}

function upsertOffer(o) {
  const now = new Date().toISOString();
  if (usePostgres) return upsertOfferPg({ ...o, updatedAt: now });

  const offers = db.data.offers || [];
  const idx = offers.findIndex((x) => x.id === o.id);
  const record = {
    ...o,
    fulfilled: Boolean(o.fulfilled),
    createdAt: idx === -1 ? now : offers[idx].createdAt,
    updatedAt: now,
  };
  if (idx === -1) offers.push(record); else offers[idx] = record;
  db.data.offers = offers;

  // atomic write with lock
  let release;
  try {
    release = lockfile.lockSync(DB_PATH);
    db.write();
  } finally {
    try { if (release) release(); } catch {}
  }
}


async function loadKeypair() {
  if (!KEYPAIR_PATH) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8'));
    if (typeof raw === 'string') {
      // base58 encoded secret
      // for safety, don't attempt to decode here without libs; assume it's a JSON array
      return null;
    }
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  } catch (err) {
    return null;
  }
}

async function doRelease(connection, payer, offer) {
  log('Releasing offer', offer.id, 'to', offer.seller);
  const feeAccount = process.env.AGENT_FEE_ACCOUNT || null;

  // compute fee (integer math)
  const amount = BigInt(offer.amount || '0');
  const feePercent = Number(offer.feePercent ?? 0);
  const fee = feePercent > 0 ? (amount * BigInt(Math.round(feePercent * 100))) / BigInt(100 * 100) : BigInt(0);
  const payout = amount - fee;

  if (!ENABLE_EXECUTE) {
    log('EXECUTE disabled; simulating release for', offer.id, 'fee=', String(fee), 'payout=', String(payout));
    return { simulated: true, fee: String(fee), payout: String(payout) };
  }
  if (!connection) throw new Error('RPC missing for execute');

  // get signer abstraction
  const signer = await createSigner();

  if (offer.itemType !== 'token') {
    // Generic/off-chain item: agent cannot transfer on-chain; record release log
    log('Generic item; recording release for', offer.id);
    return { logged: true };
  }

  // Token item: transfer payout to seller, fee to fee account (if set)
  const mint = new PublicKey(offer.tokenMint);
  const seller = new PublicKey(offer.seller);
  const payerPub = signer.getPublicKey();

  const sellerAta = await getOrCreateAssociatedTokenAccount(connection, { publicKey: payerPub }, mint, seller);
  const payerAta = await getOrCreateAssociatedTokenAccount(connection, { publicKey: payerPub }, mint, payerPub);

  // helper to build a transaction and get it signed by signer
  async function sendTransfer(from, to, authorityPub, amountBigInt) {
    const { createTransferInstruction } = await import('@solana/spl-token');
    const ix = createTransferInstruction(from, to, authorityPub, amountBigInt);
    const tx = new Transaction().add(ix);
    tx.feePayer = payerPub;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    // sign with signer abstraction
    await signer.signTransaction(tx);
    const raw = tx.serialize();
    const sig = await connection.sendRawTransaction(raw);
    await connection.confirmTransaction(sig, 'confirmed');
    return sig;
  }

  const tx1 = await sendTransfer(payerAta.address, sellerAta.address, payerPub, payout);
  let txFee = null;
  if (fee > 0 && feeAccount) {
    const feePub = new PublicKey(feeAccount);
    const feeAta = await getOrCreateAssociatedTokenAccount(connection, { publicKey: payerPub }, mint, feePub);
    txFee = await sendTransfer(payerAta.address, feeAta.address, payerPub, fee);
  }

  return { tx: tx1, txFee };
}

async function doRefund(connection, payer, offer) {
  log('Refunding offer', offer.id, 'to', offer.buyer);
  if (!ENABLE_EXECUTE) {
    log('EXECUTE disabled; simulating refund for', offer.id);
    return { simulated: true };
  }
  if (!connection) throw new Error('RPC missing for execute');

  const signer = await createSigner();
  const mint = new PublicKey(offer.tokenMint);
  const buyer = new PublicKey(offer.buyer);
  const payerPub = signer.getPublicKey();

  const buyerAta = await getOrCreateAssociatedTokenAccount(connection, { publicKey: payerPub }, mint, buyer);
  const payerAta = await getOrCreateAssociatedTokenAccount(connection, { publicKey: payerPub }, mint, payerPub);

  const amount = Number(offer.amount);

  // send transfer with signer
  const { createTransferInstruction } = await import('@solana/spl-token');
  const ix = createTransferInstruction(payerAta.address, buyerAta.address, payerPub, BigInt(amount));
  const tx = new Transaction().add(ix);
  tx.feePayer = payerPub;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  await signer.signTransaction(tx);
  const raw = tx.serialize();
  const sig = await connection.sendRawTransaction(raw);
  await connection.confirmTransaction(sig, 'confirmed');
  return { tx: sig };
}

async function processOffersLoop() {
  log('OpenClaw agent starting (pid=' + process.pid + ')', 'EXECUTE=' + ENABLE_EXECUTE);
  let connection = null;
  let payer = null;
  if (ENABLE_EXECUTE) {
    // Require explicit signer mode in production: 'kms' or 'local' (local allowed for testing only)
    const SIGNER_MODE = String(process.env.SIGNER_MODE || 'local');
    // If kms mode, require KMS envs; if local, require KEYPAIR_PATH but warn
    if (SIGNER_MODE === 'kms') {
      const KMS_PROVIDER = String(process.env.KMS_PROVIDER || '').trim();
      const KMS_KEY_ID = String(process.env.KMS_KEY_ID || '').trim();
      if (!KMS_PROVIDER || !KMS_KEY_ID) {
        log('FATAL: SIGNER_MODE=kms requires KMS_PROVIDER and KMS_KEY_ID to be set');
        process.exit(1);
      }
    }
    if (!RPC_URL) log('WARNING: RPC_URL not set — execute will fail');
    connection = new Connection(RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');
    payer = await loadKeypair();
    if (!payer) {
      if (SIGNER_MODE === 'local') {
        log('WARNING: KEYPAIR_PATH not set or invalid — execute disabled');
      } else {
        // In KMS mode we do not require a local keypair on disk
        log('KMS signing mode active — not requiring local keypair');
      }
    }

    // Safety: do not allow accidental production execution with local signer unless explicitly allowed
    if (SIGNER_MODE !== 'kms' && process.env.NODE_ENV === 'production' && process.env.FORCE_ALLOW_LOCAL !== 'true') {
      log('FATAL: In production NODE_ENV=production, SIGNER_MODE must be kms (or set FORCE_ALLOW_LOCAL=true to bypass)');
      process.exit(1);
    }
  }

  // HTTP API for operator and integration
  // Auth: expects access-server JWT signed with ACCESS_JWT_SECRET
  const ACCESS_JWT_SECRET = process.env.ACCESS_JWT_SECRET || process.env.ACCESS_SECRET;
  const AGENT_PORT = Number(process.env.OPENCLAW_PORT || 9800);
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // read-only RPC connection for token checks (used regardless of EXECUTE)
  const QUERY_RPC_URL = process.env.QUERY_RPC_URL || RPC_URL || 'https://api.devnet.solana.com';
  const queryConnection = new Connection(QUERY_RPC_URL, 'confirmed');

  // Market access middleware - requires ownership of configured MINT_ADDRESS
  async function marketAuthMiddleware(req, res, next) {
    try {
      // First try JWT-based check
      if (req.user) {
        const bal = Number(req.user.bal || 0);
        if (bal > 0) return next();
      }

      // Fallback: check wallet + signature headers for ad-hoc proof
      const wallet = String(req.headers['x-wallet'] || '').trim();
      const sig = String(req.headers['x-wallet-signature'] || '').trim();
      const ts = String(req.headers['x-wallet-ts'] || '').trim();
      if (!wallet || !sig || !ts) return res.status(401).json({ error: 'token-gate: missing wallet proof headers' });
      // timestamp check (allow 5min)
      const t = Number(ts);
      if (!t || Math.abs(Date.now() - t) > 5 * 60 * 1000) return res.status(401).json({ error: 'token-gate: invalid timestamp' });

      // Verify signature (message = wallet:ts)
      const msg = `market:${wallet}:${ts}`;
      const mBytes = new TextEncoder().encode(msg);
      let sigBytes;
      try { sigBytes = bs58.decode(sig); } catch { sigBytes = Uint8Array.from(Buffer.from(sig, 'base64')); }
      try {
        const pub = new PublicKey(wallet);
        const ok = nacl.sign.detached.verify(mBytes, sigBytes, pub.toBytes());
        if (!ok) return res.status(401).json({ error: 'token-gate: invalid signature' });
      } catch (err) {
        return res.status(401).json({ error: 'token-gate: signature verification failed' });
      }

      // Check token balance on-chain for the configured MINT
      const mintAddr = process.env.MINT_ADDRESS || process.env.MINT || '';
      if (!mintAddr) return res.status(500).json({ error: 'server misconfigured (MINT_ADDRESS)' });
      try {
        const ownerPk = new PublicKey(wallet);
        const resp = await queryConnection.getParsedTokenAccountsByOwner(ownerPk, { mint: new PublicKey(mintAddr) });
        let total = 0;
        for (const item of resp.value || []) {
          const amt = item.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
          total += amt;
        }
        if (total > 0) return next();
        return res.status(403).json({ error: 'token-gate: wallet does not hold required token' });
      } catch (err) {
        return res.status(500).json({ error: 'token-gate: rpc or wallet invalid' });
      }
    } catch (err) {
      return res.status(500).json({ error: 'token-gate: internal error' });
    }
  }

  function authMiddleware(req, res, next) {
    const auth = String(req.headers.authorization || '').trim();
    if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'missing token' });
    const token = auth.slice(7).trim();
    if (!ACCESS_JWT_SECRET) return res.status(500).json({ error: 'server misconfigured (ACCESS_JWT_SECRET)' });
    try {
      const payload = jwt.verify(token, ACCESS_JWT_SECRET);
      req.user = payload;
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'invalid token' });
    }
  }

  app.get('/health', (_req, res) => res.json({ ok: true, execute: ENABLE_EXECUTE }));

  app.get('/offers', authMiddleware, async (req, res) => {
    const offers = await readOffers();
    return res.json({ ok: true, offers });
  });

  app.post('/offers', authMiddleware, (req, res) => {
    try {
      const body = req.body || {};
      const id = String(body.id || 'offer-' + Date.now());

      // Optional buyer signature verification: requires 'buyerSig' (base64) and 'buyer' to equal req.user.sub
      const buyer = String(body.buyer || req.user.sub || '');
      const buyerSig = body.buyerSig || null;

      if (buyerSig && buyer !== req.user.sub) {
        return res.status(403).json({ error: 'buyer must match signer' });
      }

      const offer = {
        id,
        buyer,
        seller: String(body.seller || ''),
        amount: String(body.amount || '0'),
        tokenMint: String(body.tokenMint || ''),
        description: String(body.description || ''),
        itemType: String(body.itemType || 'token'),
        feePercent: Number(body.feePercent ?? 1.5),
        status: String(body.status || 'open'),
        expiry: body.expiry || null,
        fulfilled: Boolean(body.fulfilled || false),
        buyerSig: buyerSig || null,
      };

      // Verify signature if provided
      if (buyerSig) {
        try {
          const pub = new PublicKey(buyer);
          const msg = `offer:${offer.id}:${offer.buyer}:${offer.amount}:${offer.tokenMint}:${offer.itemType}:${offer.description}`;
          const mBytes = new TextEncoder().encode(msg);
          let sigBytes;
          try {
            sigBytes = bs58.decode(buyerSig);
          } catch {
            sigBytes = Uint8Array.from(Buffer.from(buyerSig, 'base64'));
          }
          const ok = nacl.sign.detached.verify(mBytes, sigBytes, pub.toBytes());
          if (!ok) return res.status(400).json({ error: 'invalid buyer signature' });
        } catch (err) {
          return res.status(400).json({ error: 'signature verification failed' });
        }
      }

      upsertOffer(offer);
      return res.json({ ok: true, offer });
    } catch (err) {
      return res.status(500).json({ error: String(err?.message || err) });
    }
  });

  app.post('/market/listings', authMiddleware, async (req, res) => {
    try {
      // require token-gate: jwt must indicate balance or wallet proof
      if (!(req.user && Number(req.user.bal || 0) > 0)) {
        // if no JWT balance, try header wallet proof
        const wallet = String(req.headers['x-wallet'] || '').trim();
        const sig = String(req.headers['x-wallet-signature'] || '').trim();
        const ts = String(req.headers['x-wallet-ts'] || '').trim();
        if (!wallet || !sig || !ts) return res.status(403).json({ error: 'not token holder' });
        // reuse marketAuthMiddleware logic by calling it
        const fakeReq = req; // marketAuthMiddleware uses headers and queryConnection
        // We'll perform a small check inline
        const msg = `market:${wallet}:${ts}`;
        const mBytes = new TextEncoder().encode(msg);
        let sigBytes;
        try { sigBytes = bs58.decode(sig); } catch { sigBytes = Uint8Array.from(Buffer.from(sig, 'base64')); }
        try {
          const pub = new PublicKey(wallet);
          const ok = nacl.sign.detached.verify(mBytes, sigBytes, pub.toBytes());
          if (!ok) return res.status(401).json({ error: 'invalid wallet proof' });
        } catch (err) { return res.status(401).json({ error: 'invalid wallet proof' }); }
        // Check on-chain balance
        const mintAddr = process.env.MINT_ADDRESS || process.env.MINT || '';
        if (!mintAddr) return res.status(500).json({ error: 'server misconfigured (MINT_ADDRESS)' });
        const ownerPk = new PublicKey(wallet);
        const resp = await queryConnection.getParsedTokenAccountsByOwner(ownerPk, { mint: new PublicKey(mintAddr) });
        let total = 0;
        for (const item of resp.value || []) {
          const amt = item.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
          total += amt;
        }
        if (total <= 0) return res.status(403).json({ error: 'wallet does not hold required token' });
      }

      const body = req.body || {};
      const id = String(body.id || 'listing-' + Date.now());
      const listing = {
        id,
        seller: String(body.seller || req.user?.sub || ''),
        title: String(body.title || ''),
        description: String(body.description || ''),
        price: String(body.price || '0'),
        currency: String(body.currency || 'CLAW'),
        status: 'listed',
        createdAt: new Date().toISOString(),
      };
      await upsertOffer({ id: listing.id, buyer: '', seller: listing.seller, amount: listing.price, description: listing.description, itemType: 'market', status: 'listed', createdAt: listing.createdAt });
      return res.json({ ok: true, listing });
    } catch (err) {
      return res.status(500).json({ error: String(err?.message || err) });
    }
  });

  app.get('/market/listings', marketAuthMiddleware, async (req, res) => {
    const offers = await readOffers();
    const listings = (offers || []).filter((o) => o.itemType === 'market' && o.status === 'listed');
    return res.json({ ok: true, listings });
  });

  app.get('/market/listings/:id', marketAuthMiddleware, async (req, res) => {
    const o = await getOffer(req.params.id);
    if (!o || o.itemType !== 'market') return res.status(404).json({ error: 'not found' });
    return res.json({ ok: true, listing: o });
  });

  app.post('/offers/:id/fund', authMiddleware, async (req, res) => {
    const o = await getOffer(req.params.id);
    if (!o) return res.status(404).json({ error: 'not found' });
    o.status = 'funded';
    o.fundedAt = new Date().toISOString();
    await upsertOffer(o);
    return res.json({ ok: true, offer: o });
  });

  app.post('/offers/:id/fulfill', authMiddleware, async (req, res) => {
    const o = await getOffer(req.params.id);
    if (!o) return res.status(404).json({ error: 'not found' });
    // Only seller may mark fulfilled
    if (req.user.sub !== o.seller) return res.status(403).json({ error: 'only seller may mark fulfilled' });
    o.fulfilled = true;
    o.fulfilledAt = new Date().toISOString();
    await upsertOffer(o);
    // If using pg-boss, publish a release job
    if (process.env.DATABASE_URL && o.status === 'funded') {
      await publishJob('release', o);
    }
    return res.json({ ok: true, offer: o });
  });

  app.post('/offers/:id/refund', authMiddleware, async (req, res) => {
    const o = await getOffer(req.params.id);
    if (!o) return res.status(404).json({ error: 'not found' });
    // Buyer or seller may request refund; agent executes based on state
    if (req.user.sub !== o.buyer && req.user.sub !== o.seller) return res.status(403).json({ error: 'not authorized' });
    // If using pg-boss, publish refund job immediately; otherwise set expiry to trigger loop
    if (process.env.DATABASE_URL) {
      await publishJob('refund', o);
    } else {
      o.expiry = new Date().toISOString();
      await upsertOffer(o);
    }
    return res.json({ ok: true, offer: o });
  });

  // Seller marks an offer as shipped (carrier + tracking number)
  app.post('/offers/:id/ship', authMiddleware, async (req, res) => {
    const o = await getOffer(req.params.id);
    if (!o) return res.status(404).json({ error: 'not found' });
    if (req.user.sub !== o.seller) return res.status(403).json({ error: 'only seller may mark shipped' });
    const carrier = String(req.body.carrier || '');
    const trackingNumber = String(req.body.trackingNumber || '');
    if (!carrier || !trackingNumber) return res.status(400).json({ error: 'carrier and trackingNumber required' });
    o.shipped = true;
    o.tracking = { carrier, trackingNumber, status: 'in_transit', updatedAt: new Date().toISOString() };
    // set auto-release expiry to 7 days from now (can be overridden with SHIP_AUTO_RELEASE_MS)
    o.expiry = new Date(Date.now() + (Number(process.env.SHIP_AUTO_RELEASE_MS) || 7 * 24 * 60 * 60 * 1000)).toISOString();
    await upsertOffer(o);
    return res.json({ ok: true, offer: o });
  });

  // Tracking status webhook / update (seller or tracking provider)
  app.post('/offers/:id/tracking', authMiddleware, async (req, res) => {
    const o = await getOffer(req.params.id);
    if (!o) return res.status(404).json({ error: 'not found' });

    // If TRACKING_HMAC_SECRET is set, require an HMAC signature header
    const TRACKING_HMAC_SECRET = process.env.TRACKING_HMAC_SECRET || '';
    if (TRACKING_HMAC_SECRET) {
      const sig = String(req.headers['x-tracking-signature'] || '').trim();
      if (!sig) return res.status(401).json({ error: 'missing tracking signature' });
      const payload = JSON.stringify(req.body || {});
      const h = crypto.createHmac('sha256', TRACKING_HMAC_SECRET).update(payload).digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(sig, 'hex'))) {
        return res.status(401).json({ error: 'invalid signature' });
      }
    }

    const status = String(req.body.status || '');
    const deliveredAt = req.body.deliveredAt || new Date().toISOString();
    o.tracking = o.tracking || {};
    o.tracking.status = status;
    o.tracking.updatedAt = new Date().toISOString();
    if (status === 'delivered') {
      o.tracking.deliveredAt = deliveredAt;
      o.fulfilled = true;
      o.fulfilledAt = new Date().toISOString();
      // If using pg-boss and offer is funded, publish release
      if (process.env.DATABASE_URL && o.status === 'funded') {
        await publishJob('release', o);
      }
    }
    await upsertOffer(o);
    return res.json({ ok: true, offer: o });
  });

  // Buyer confirms receipt
  app.post('/offers/:id/confirm', authMiddleware, async (req, res) => {
    const o = await getOffer(req.params.id);
    if (!o) return res.status(404).json({ error: 'not found' });
    if (req.user.sub !== o.buyer) return res.status(403).json({ error: 'only buyer may confirm receipt' });
    o.fulfilled = true;
    o.fulfilledAt = new Date().toISOString();
    await upsertOffer(o);
    if (process.env.DATABASE_URL && o.status === 'funded') {
      await publishJob('release', o);
    }
    return res.json({ ok: true, offer: o });
  });

  // Raise a dispute (buyer or seller)
  app.post('/offers/:id/dispute', authMiddleware, (req, res) => {
    const offers = readOffers();
    const o = offers.find((x) => x.id === req.params.id);
    if (!o) return res.status(404).json({ error: 'not found' });
    if (req.user.sub !== o.buyer && req.user.sub !== o.seller) return res.status(403).json({ error: 'not authorized' });
    o.disputed = true;
    o.disputedAt = new Date().toISOString();
    upsertOffer(o);
    return res.json({ ok: true, offer: o });
  });

  app.listen(AGENT_PORT, () => log('OpenClaw API listening on', AGENT_PORT));

  // Initialize Postgres + pg-boss subscriptions when DATABASE_URL is set
  if (process.env.DATABASE_URL) {
    try {
      await ensureDb();
      // subscribe to release jobs
      await subscribeJob('release', async (data) => {
        try {
          await doRelease(connection, payer, data);
          const o = await getOffer(data.id);
          if (o) {
            o.status = 'released';
            o.releasedAt = new Date().toISOString();
            o.lastError = null;
            o.retryCount = 0;
            await upsertOffer(o);
          }
        } catch (err) {
          log('Release job error for', data.id, String(err));
          const o = await getOffer(data.id);
          if (o) {
            o.retryCount = (o.retryCount || 0) + 1;
            o.lastError = String(err);
            if (o.retryCount > 3) o.status = 'error';
            await upsertOffer(o);
          }
          throw err;
        }
      });

      // subscribe to refund jobs
      await subscribeJob('refund', async (data) => {
        try {
          await doRefund(connection, payer, data);
          const o = await getOffer(data.id);
          if (o) {
            o.status = 'refunded';
            o.refundedAt = new Date().toISOString();
            o.lastError = null;
            o.retryCount = 0;
            await upsertOffer(o);
          }
        } catch (err) {
          log('Refund job error for', data.id, String(err));
          const o = await getOffer(data.id);
          if (o) {
            o.retryCount = (o.retryCount || 0) + 1;
            o.lastError = String(err);
            if (o.retryCount > 3) o.status = 'error';
            await upsertOffer(o);
          }
          throw err;
        }
      });

      log('Subscribed to pg-boss jobs');
    } catch (err) {
      log('Failed to subscribe to jobs', String(err));
    }
  }

  while (true) {
    try {
      const offers = await readOffers();
      let changed = false;
      const now = Date.now();
      for (const o of offers) {
        if (o.status === 'funded') {
          // If item was shipped, check tracking for delivery or expiry-after-shipment to auto-mark fulfilled
          if (o.itemType === 'shipped' && o.shipped && !o.fulfilled) {
            const t = o.tracking || {};
            if (t.status === 'delivered') {
              o.fulfilled = true;
              o.fulfilledAt = new Date().toISOString();
              upsertOffer(o);
              changed = true;
            } else if (o.expiry && now > new Date(o.expiry).getTime() && !o.disputed) {
              // If shipment hasn't been disputed within auto-release window, mark fulfilled
              o.fulfilled = true;
              o.fulfilledAt = new Date().toISOString();
              upsertOffer(o);
              changed = true;
            }
          }

          // fulfill or refund
          if (o.fulfilled) {
            try {
              await doRelease(connection, payer, o);
              o.status = 'released';
              o.releasedAt = new Date().toISOString();
              o.lastError = null;
              o.retryCount = 0;
              upsertOffer(o);
              changed = true;
            } catch (err) {
              log('Release error for', o.id, String(err));
              o.retryCount = (o.retryCount || 0) + 1;
              o.lastError = String(err);
              if (o.retryCount > 3) {
                o.status = 'error';
              }
              upsertOffer(o);
            }
          } else if (o.expiry && now > new Date(o.expiry).getTime()) {
            try {
              // For shipped items, only refund if disputed; otherwise auto-release logic above handles delivery/expiry
              if (o.itemType === 'shipped' && o.shipped && o.disputed) {
                await doRefund(connection, payer, o);
                o.status = 'refunded';
                o.refundedAt = new Date().toISOString();
                o.lastError = null;
                o.retryCount = 0;
                upsertOffer(o);
                changed = true;
              } else if (o.itemType !== 'shipped') {
                await doRefund(connection, payer, o);
                o.status = 'refunded';
                o.refundedAt = new Date().toISOString();
                o.lastError = null;
                o.retryCount = 0;
                upsertOffer(o);
                changed = true;
              }
            } catch (err) {
              log('Refund error for', o.id, String(err));
              o.retryCount = (o.retryCount || 0) + 1;
              o.lastError = String(err);
              if (o.retryCount > 3) {
                o.status = 'error';
              }
              upsertOffer(o);
            }
          }
        }
      }
      if (changed) log('Offers updated');
    } catch (err) {
      log('Loop error', String(err));
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

// Ensure offers file exists
try { fs.mkdirSync(path.dirname(OFFERS_PATH), { recursive: true }); } catch {}
if (!fs.existsSync(OFFERS_PATH)) fs.writeFileSync(OFFERS_PATH, '[]');

processOffersLoop().catch((err) => { console.error('Agent fatal', err); process.exit(1); });
