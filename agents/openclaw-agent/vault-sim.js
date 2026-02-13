#!/usr/bin/env node
import express from 'express';
import bodyParser from 'body-parser';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

const PORT = Number(process.env.VAULT_SIM_PORT || 8200);
const app = express();
app.use(bodyParser.json({ limit: '1mb' }));

// Simple in-memory key (dev only)
let kp;
if (process.env.VAULT_SIM_SECRET) {
  try {
    const raw = JSON.parse(process.env.VAULT_SIM_SECRET);
    kp = Keypair.fromSecretKey(Uint8Array.from(raw));
  } catch (e) {
    kp = Keypair.generate();
  }
} else {
  kp = Keypair.generate();
}

app.post('/health', (_req, res) => res.json({ ok: true, pubkey: kp.publicKey.toBase58() }));

// provide public key for the key ID
app.post('/pubkey', (req, res) => {
  const key = String(req.body.key || '');
  // only one key in sim
  return res.json({ key, pubkey: kp.publicKey.toBase58() });
});

// simple legacy sign endpoint
app.post('/sign', (req, res) => {
  try {
    const key = String(req.body.key || '');
    const messageBase64 = String(req.body.message || '');
    const buf = Buffer.from(messageBase64, 'base64');
    const sig = nacl.sign.detached(new Uint8Array(buf), kp.secretKey);
    return res.json({ key, signature: Buffer.from(sig).toString('base64'), pubkey: kp.publicKey.toBase58() });
  } catch (err) {
    return res.status(400).json({ error: String(err?.message || err) });
  }
});

// Vault Transit-like signing endpoint (dev-sim)
app.post('/v1/transit/sign/:key', (req, res) => {
  try {
    const keyName = String(req.params.key || req.body.key || 'dev-key');
    const input = String(req.body.input || ''); // base64 input
    if (!input) return res.status(400).json({ errors: ['missing input'] });
    // sign raw bytes
    const buf = Buffer.from(input, 'base64');
    const sig = nacl.sign.detached(new Uint8Array(buf), kp.secretKey);
    // Return a Vault-style signature: "vault:v1:<base64>"
    const sigB64 = Buffer.from(sig).toString('base64');
    return res.json({ data: { signature: `vault:v1:${sigB64}` } });
  } catch (err) {
    return res.status(400).json({ errors: [String(err?.message || err)] });
  }
});

app.listen(PORT, () => console.log('Vault-sim listening on', PORT));
