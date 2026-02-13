import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { Keypair, PublicKey, Transaction } from '@solana/web3.js';

const KEYPAIR_PATH = process.env.KEYPAIR_PATH;
// Note: these are read dynamically inside createSigner to support changing envs during tests
const DEFAULT_VAULT_URL = process.env.VAULT_URL || process.env.KMS_PROVIDER_URL || 'http://localhost:8200';
const DEFAULT_VAULT_KEY = process.env.VAULT_KEY_ID || process.env.KMS_KEY_ID || 'dev-key';

function loadLocalKeypair() {
  if (!KEYPAIR_PATH) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8'));
    if (typeof raw === 'string') {
      // assume base58
      const sk = bs58.decode(raw);
      return Keypair.fromSecretKey(sk);
    }
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  } catch (err) {
    return null;
  }
}

function base64ToUint8Array(s) {
  return Uint8Array.from(Buffer.from(s, 'base64'));
}

async function vaultSignMessage(messageBase64, vaultUrl = DEFAULT_VAULT_URL, key = DEFAULT_VAULT_KEY) {
  // Call Vault Transit-compatible endpoint
  const url = new URL(`/v1/transit/sign/${key}`, vaultUrl).toString();
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: messageBase64 }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error('vault sign failed: ' + resp.status + ' ' + text);
  }
  const data = await resp.json();
  // Vault returns data.signature like 'vault:v1:<base64>'
  const sigField = data?.data?.signature || data?.data?.value || data?.signature || null;
  if (!sigField) throw new Error('vault sign response missing signature');
  // If in format 'vault:v1:<base64>' extract base64
  const parts = String(sigField).split(':');
  const b64 = parts.length >= 3 ? parts.slice(2).join(':') : parts[parts.length - 1];
  return { signature: b64 };
}

export async function createSigner() {
  const mode = String(process.env.SIGNER_MODE || (process.env.VAULT_URL ? 'vault' : 'local'));
  const VAULT_URL = process.env.VAULT_URL || DEFAULT_VAULT_URL;
  const VAULT_KEY = process.env.VAULT_KEY_ID || process.env.KMS_KEY_ID || DEFAULT_VAULT_KEY;

  if (mode === 'vault') {
    // Query vault for public key
    const url = new URL('/pubkey', VAULT_URL).toString();
    const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: VAULT_KEY }) });
    if (!resp.ok) throw new Error('vault pubkey fetch failed');
    const { pubkey } = await resp.json();
    const pub = new PublicKey(pubkey);
    return {
      mode: 'vault',
      getPublicKey: () => pub,
      // sign a Transaction by adding a signature returned from vault
      signTransaction: async (tx) => {
        const message = tx.serializeMessage();
        const messageBase64 = Buffer.from(message).toString('base64');
        const r = await vaultSignMessage(messageBase64, VAULT_URL, VAULT_KEY);
        const sig = base64ToUint8Array(r.signature);
        tx.addSignature(pub, sig);
        return tx;
      },
      signMessage: async (msgBytes) => {
        const messageBase64 = Buffer.from(msgBytes).toString('base64');
        const r = await vaultSignMessage(messageBase64, VAULT_URL, VAULT_KEY);
        return base64ToUint8Array(r.signature);
      },
    };
  }

  // default: local keypair
  const kp = loadLocalKeypair();
  if (!kp) throw new Error('local keypair not found (KEYPAIR_PATH)');
  return {
    mode: 'local',
    getPublicKey: () => kp.publicKey,
    signTransaction: async (tx) => {
      tx.sign(kp);
      return tx;
    },
    signMessage: async (msgBytes) => {
      return nacl.sign.detached(new Uint8Array(msgBytes), kp.secretKey);
    },
  };
}
