import fs from 'fs';
import path from 'path';
import bs58 from 'bs58';
import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import { createMultisig, getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import 'dotenv/config';

const RPC = process.env.RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const OUT_DIR = process.env.OUT_DIR || path.join(process.cwd(), 'agents', 'escrow-multisig', 'data');

function ensureDir(d) {
  try { fs.mkdirSync(d, { recursive: true }); } catch {}
}

function writeKeypairFile(kp, filePath) {
  const secret = Array.from(kp.secretKey);
  fs.writeFileSync(filePath, JSON.stringify(secret, null, 2));
}

async function main() {
  const m = Number(process.env.THRESHOLD || 2);
  const n = Number(process.env.SIGNERS || 3);
  const mint = process.env.MINT;
  const payerKeyPath = process.env.KEYPAIR_PATH;

  if (!mint) throw new Error('MINT env is required');
  if (!payerKeyPath) throw new Error('KEYPAIR_PATH env is required (payer funds the multisig creation)');

  ensureDir(OUT_DIR);
  const connection = new Connection(RPC, 'confirmed');

  // Load payer
  const payerRaw = JSON.parse(fs.readFileSync(path.resolve(payerKeyPath), 'utf8'));
  const payer = Keypair.fromSecretKey(Uint8Array.from(payerRaw));

  // Create signer keypairs
  const signers = [];
  for (let i = 0; i < n; i++) {
    const kp = Keypair.generate();
    const file = path.join(OUT_DIR, `signer-${i + 1}.json`);
    writeKeypairFile(kp, file);
    signers.push({ pub: kp.publicKey.toBase58(), file });
  }

  // Create multisig account onchain
  const signerPubs = signers.map((s) => s.pub);
  const signerKeys = signerPubs.map((s) => new PublicKey(s));

  const multisig = await createMultisig(connection, payer, signerKeys, m);

  // Create an associated token account for the multisig
  const ata = await getOrCreateAssociatedTokenAccount(connection, payer, new PublicKey(mint), multisig, true);

  const out = {
    multisig: multisig.toBase58(),
    threshold: m,
    signers,
    ata: ata.address.toBase58(),
    mint,
  };

  fs.writeFileSync(path.join(OUT_DIR, 'multisig.json'), JSON.stringify(out, null, 2));

  console.log('Multisig created:', out);
}

main().catch((err) => { console.error(err); process.exit(1); });
