import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import bs58 from "bs58";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";

function loadKeypair(filePath) {
  const absolute = path.resolve(filePath);
  const raw = JSON.parse(fs.readFileSync(absolute, "utf8"));
  if (typeof raw === 'string') {
    const secretKey = bs58.decode(raw);
    return Keypair.fromSecretKey(secretKey);
  }
  throw new Error("Invalid keypair format");
}

async function main() {
  const rpcUrl = process.env.RPC_URL?.trim();
  const keypairPath = process.env.KEYPAIR_PATH?.trim();
  const decimals = Number(process.env.TOKEN_DECIMALS ?? 6);

  if (!rpcUrl) throw new Error("RPC_URL missing");
  if (!keypairPath) throw new Error("KEYPAIR_PATH missing");

  const payer = loadKeypair(keypairPath);
  const connection = new Connection(rpcUrl, "confirmed");

  const mintAuthority = payer.publicKey;
  const freezeAuthority = payer.publicKey;

  const mint = await createMint(
    connection,
    payer,
    mintAuthority,
    freezeAuthority,
    decimals,
  );

  const treasury = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey,
  );

  const output = {
    mint: mint.toBase58(),
    treasuryOwner: payer.publicKey.toBase58(),
    treasuryTokenAccount: treasury.address.toBase58(),
    decimals,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
