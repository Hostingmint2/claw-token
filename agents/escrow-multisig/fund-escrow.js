import fs from 'fs';
import path from 'path';
import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, transfer } from '@solana/spl-token';
import 'dotenv/config';

const RPC = process.env.RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const MULTISIG_PATH = process.env.MULTISIG_PATH || path.join(process.cwd(), 'agents', 'escrow-multisig', 'data', 'multisig.json');
const PAYER_PATH = process.env.KEYPAIR_PATH;
const MINT = process.env.MINT;
const AMOUNT = process.env.AMOUNT || '0';

if (!PAYER_PATH) throw new Error('KEYPAIR_PATH env required');
if (!MINT) throw new Error('MINT env required');

async function main() {
  const connection = new Connection(RPC, 'confirmed');
  const payerRaw = JSON.parse(fs.readFileSync(path.resolve(PAYER_PATH), 'utf8'));
  const payer = Keypair.fromSecretKey(Uint8Array.from(payerRaw));

  const ms = JSON.parse(fs.readFileSync(path.resolve(MULTISIG_PATH), 'utf8'));
  const multisig = new PublicKey(ms.multisig);
  const mint = new PublicKey(MINT);

  // Get or create multisig token account (ATA)
  const multisigAta = await getOrCreateAssociatedTokenAccount(connection, payer, mint, multisig, true);
  // Get or create payer's ATA
  const payerAta = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey);

  // Transfer tokens from payer to multisig ATA
  const tx = await transfer(connection, payer, payerAta.address, multisigAta.address, payer.publicKey, BigInt(AMOUNT));
  console.log('Transferred to multisig:', tx);
}

main().catch((err) => { console.error(err); process.exit(1); });
