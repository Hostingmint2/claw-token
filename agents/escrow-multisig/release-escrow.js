import fs from 'fs';
import path from 'path';
import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, transfer } from '@solana/spl-token';
import 'dotenv/config';

const RPC = process.env.RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const MULTISIG_PATH = process.env.MULTISIG_PATH || path.join(process.cwd(), 'agents', 'escrow-multisig', 'data', 'multisig.json');
const PAYER_PATH = process.env.KEYPAIR_PATH; // payer pays fees
const RECIPIENT = process.env.RECIPIENT;
const AMOUNT = process.env.AMOUNT || '0';

if (!PAYER_PATH) throw new Error('KEYPAIR_PATH env required');
if (!RECIPIENT) throw new Error('RECIPIENT env required');

async function main() {
  const ms = JSON.parse(fs.readFileSync(path.resolve(MULTISIG_PATH), 'utf8'));
  const threshold = ms.threshold || 1;
  const signerFiles = (ms.signers || []).slice(0, threshold).map((s) => s.file);

  // load signers (threshold count)
  const signers = signerFiles.map((f) => {
    const raw = JSON.parse(fs.readFileSync(path.resolve(f), 'utf8'));
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  });

  const connection = new Connection(RPC, 'confirmed');
  const payerRaw = JSON.parse(fs.readFileSync(path.resolve(PAYER_PATH), 'utf8'));
  const payer = Keypair.fromSecretKey(Uint8Array.from(payerRaw));

  const multisigPub = new PublicKey(ms.multisig);
  const mint = new PublicKey(ms.mint);

  // Get or create token accounts
  const multisigAta = await getOrCreateAssociatedTokenAccount(connection, payer, mint, multisigPub, true);
  const recipient = new PublicKey(RECIPIENT);
  const recipientAta = await getOrCreateAssociatedTokenAccount(connection, payer, mint, recipient);

  // Transfer from multisig ATA to recipient ATA, signed by threshold signers
  const tx = await transfer(connection, payer, multisigAta.address, recipientAta.address, multisigPub, BigInt(AMOUNT), signers);
  console.log('Released multisig tx:', tx);
}

main().catch((err) => { console.error(err); process.exit(1); });
