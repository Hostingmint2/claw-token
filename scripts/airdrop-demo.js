#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { Connection, Keypair } from '@solana/web3.js';

const keypairPath = process.env.KEYPAIR_PATH || './agents/openclaw-agent/demo-keypair.json';
const rpcUrl = process.env.RPC_URL || 'https://api.devnet.solana.com';
const lamports = Number(process.env.AIRDROP_LAMPORTS || 2 * 1e9); // default 2 SOL

function loadKeypair(p) {
  const raw = JSON.parse(fs.readFileSync(path.resolve(p), 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function main() {
  const kp = loadKeypair(keypairPath);
  const conn = new Connection(rpcUrl, 'confirmed');
  console.log('Requesting airdrop to', kp.publicKey.toBase58(), 'amount lamports=', lamports);
  const sig = await conn.requestAirdrop(kp.publicKey, lamports);
  await conn.confirmTransaction(sig, 'confirmed');
  console.log('Airdrop complete:', sig);
}

main().catch((err) => { console.error(err); process.exit(1); });
