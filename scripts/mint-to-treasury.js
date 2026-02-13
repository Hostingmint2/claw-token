import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import bs58 from "bs58";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";

function loadKeypair(filePath) {
  const absolute = path.resolve(filePath);
  const raw = JSON.parse(fs.readFileSync(absolute, "utf8"));
  if (typeof raw === 'string') {
    const secretKey = bs58.decode(raw);
    return Keypair.fromSecretKey(secretKey);
  }
  throw new Error("Invalid keypair format");
}

function toBaseUnits(amount, decimals) {
  const [whole, frac = ""] = String(amount).split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole + padded);
}

async function main() {
  const rpcUrl = process.env.RPC_URL?.trim();
  const keypairPath = process.env.KEYPAIR_PATH?.trim();
  const mintAddress = process.env.MINT_ADDRESS?.trim();
  const decimals = Number(process.env.TOKEN_DECIMALS ?? 6);
  const initialSupply = process.env.INITIAL_SUPPLY?.trim();

  if (!rpcUrl) throw new Error("RPC_URL missing");
  if (!keypairPath) throw new Error("KEYPAIR_PATH missing");
  if (!mintAddress) throw new Error("MINT_ADDRESS missing");
  if (!initialSupply) throw new Error("INITIAL_SUPPLY missing");

  const payer = loadKeypair(keypairPath);
  const connection = new Connection(rpcUrl, "confirmed");
  const mint = new PublicKey(mintAddress);

  const treasury = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey,
  );

  const amount = toBaseUnits(initialSupply, decimals);

  const sig = await mintTo(
    connection,
    payer,
    mint,
    treasury.address,
    payer,
    amount,
  );

  console.log(
    JSON.stringify(
      {
        signature: sig,
        mint: mint.toBase58(),
        treasuryTokenAccount: treasury.address.toBase58(),
        amount: initialSupply,
        decimals,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
