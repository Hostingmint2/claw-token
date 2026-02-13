import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, transfer } from "@solana/spl-token";
import bs58 from "bs58";
import nacl from "tweetnacl";

const app = express();
app.use(express.json({ limit: "1mb" }));

const rpcUrl = process.env.RPC_URL?.trim();
const keypairPath = process.env.KEYPAIR_PATH?.trim();
const mintAddress = process.env.MINT_ADDRESS?.trim();
const decimals = Number(process.env.TOKEN_DECIMALS ?? 6);
const claimAmount = Number(process.env.CLAIM_AMOUNT ?? 10);
const requiredHashtag = process.env.CLAIM_HASHTAG?.trim() || "#clawmint";
const moltbookApiKey = process.env.MOLTBOOK_API_KEY?.trim();
const moltbookBaseUrl = process.env.MOLTBOOK_BASE_URL?.trim() || "https://www.moltbook.com/api/v1";
const claimsDbPath = process.env.CLAIMS_DB?.trim() || "./server/claims.json";
const serverPort = Number(process.env.SERVER_PORT ?? 8787);

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const challenges = new Map();

if (!rpcUrl) throw new Error("RPC_URL missing");
if (!keypairPath) throw new Error("KEYPAIR_PATH missing");
if (!mintAddress) throw new Error("MINT_ADDRESS missing");
if (!moltbookApiKey) throw new Error("MOLTBOOK_API_KEY missing");

const connection = new Connection(rpcUrl, "confirmed");
const mint = new PublicKey(mintAddress);

function loadKeypair(filePath) {
  const absolute = path.resolve(filePath);
  const raw = JSON.parse(fs.readFileSync(absolute, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

const treasury = loadKeypair(keypairPath);

function randomNonce() {
  return crypto.randomUUID();
}

function randomClaimCode() {
  // URL-safe, easy to copy/paste, not a wallet identifier.
  return Buffer.from(crypto.randomBytes(12)).toString("base64url");
}

function buildChallengeMessage(params) {
  return [
    "ClawToken claim",
    `wallet=${params.wallet}`,
    `nonce=${params.nonce}`,
    `claimCode=${params.claimCode}`,
    `issuedAt=${params.issuedAt}`,
  ].join("\n");
}

function setChallenge(params) {
  const now = Date.now();
  const record = {
    wallet: params.wallet,
    nonce: params.nonce,
    claimCode: params.claimCode,
    issuedAt: params.issuedAt,
    expiresAt: now + CHALLENGE_TTL_MS,
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

function verifySignature(params) {
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

function loadClaims() {
  const absolute = path.resolve(claimsDbPath);
  if (!fs.existsSync(absolute)) {
    return { wallets: {} };
  }
  const raw = JSON.parse(fs.readFileSync(absolute, "utf8"));
  return raw && typeof raw === "object" ? raw : { wallets: {} };
}

function saveClaims(data) {
  const absolute = path.resolve(claimsDbPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, JSON.stringify(data, null, 2));
}

function toBaseUnits(amount, tokenDecimals) {
  const [whole, frac = ""] = String(amount).split(".");
  const padded = (frac + "0".repeat(tokenDecimals)).slice(0, tokenDecimals);
  return BigInt(whole + padded);
}

async function moltbookSearch(query) {
  const url = `${moltbookBaseUrl}/search?q=${encodeURIComponent(query)}&type=posts&limit=20`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${moltbookApiKey}`,
    },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`Moltbook API error (${res.status}): ${text || res.statusText}`);
  }
  return data;
}

function extractPosts(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.posts)) return payload.posts;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function postText(post) {
  if (!post || typeof post !== "object") return "";
  const title = typeof post.title === "string" ? post.title : "";
  const content = typeof post.content === "string" ? post.content : "";
  const url = typeof post.url === "string" ? post.url : "";
  return `${title}\n${content}\n${url}`.toLowerCase();
}

async function verifyMoltbookPost({ proof, postUrl }) {
  const query = `${requiredHashtag} ${proof}`;
  const payload = await moltbookSearch(query);
  const posts = extractPosts(payload);

  const normalizedProof = proof.toLowerCase();
  const normalizedHashtag = requiredHashtag.toLowerCase();
  const normalizedPostUrl = postUrl?.toLowerCase();

  return posts.some((post) => {
    const text = postText(post);
    if (!text.includes(normalizedHashtag) || !text.includes(normalizedProof)) {
      return false;
    }
    if (!normalizedPostUrl) return true;
    const postLink =
      (typeof post.url === "string" ? post.url : "") ||
      (typeof post.link === "string" ? post.link : "");
    return postLink.toLowerCase().includes(normalizedPostUrl);
  });
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/challenge", async (req, res) => {
  try {
    const wallet = String(req.body?.wallet || "").trim();
    if (!wallet) {
      return res.status(400).json({ error: "wallet required" });
    }
    // Validate base58 pubkey
    new PublicKey(wallet);

    const nonce = randomNonce();
    const claimCode = randomClaimCode();
    const issuedAt = new Date().toISOString();
    const record = setChallenge({ wallet, nonce, claimCode, issuedAt });
    const message = buildChallengeMessage(record);
    return res.json({ wallet, nonce, claimCode, issuedAt, message, expiresInMs: CHALLENGE_TTL_MS });
  } catch (err) {
    return res.status(400).json({ error: String(err?.message || err) });
  }
});

app.post("/claim", async (req, res) => {
  try {
    const wallet = String(req.body?.wallet || "").trim();
    const postUrl = String(req.body?.postUrl || "").trim();
    const nonce = String(req.body?.nonce || "").trim();
    const requestSignature = String(req.body?.signature || "").trim();
    const proof = String(req.body?.proof || req.body?.claimCode || "").trim();
    if (!wallet) {
      return res.status(400).json({ error: "wallet required" });
    }
    if (!nonce || !requestSignature) {
      return res.status(400).json({ error: "nonce and signature required" });
    }
    if (!proof) {
      return res.status(400).json({ error: "proof (claimCode) required" });
    }

    const challenge = getChallenge(wallet);
    if (!challenge || challenge.nonce !== nonce) {
      return res.status(403).json({ error: "invalid or expired challenge" });
    }
    if (challenge.claimCode !== proof) {
      return res.status(403).json({ error: "proof does not match challenge" });
    }

    const message = buildChallengeMessage(challenge);
    const okSig = verifySignature({ wallet, message, signature: requestSignature });
    if (!okSig) {
      return res.status(403).json({ error: "signature verification failed" });
    }

    const claims = loadClaims();
    if (claims.wallets?.[wallet]) {
      return res.status(409).json({ error: "already claimed" });
    }

    const verified = await verifyMoltbookPost({ proof, postUrl });
    if (!verified) {
      return res.status(403).json({
        error: "No Moltbook post found. Include the hashtag and your claim code in the post.",
      });
    }

    const recipient = new PublicKey(wallet);
    const treasuryToken = await getOrCreateAssociatedTokenAccount(
      connection,
      treasury,
      mint,
      treasury.publicKey,
    );
    const recipientToken = await getOrCreateAssociatedTokenAccount(
      connection,
      treasury,
      mint,
      recipient,
    );

    const amount = toBaseUnits(claimAmount, decimals);
    const txSignature = await transfer(
      connection,
      treasury,
      treasuryToken.address,
      recipientToken.address,
      treasury.publicKey,
      amount,
    );

    challenges.delete(wallet);

    claims.wallets = claims.wallets ?? {};
    claims.wallets[wallet] = {
      claimedAt: new Date().toISOString(),
      postUrl: postUrl || null,
      signature: txSignature,
      amount: claimAmount,
    };
    saveClaims(claims);

    return res.json({ ok: true, signature: txSignature, amount: claimAmount });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
});

app.listen(serverPort, () => {
  console.log(`Claim server listening on ${serverPort}`);
});
