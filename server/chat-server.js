import "dotenv/config";
import http from "node:http";
import jwt from "jsonwebtoken";
import { WebSocketServer } from "ws";

const chatPort = Number(process.env.CHAT_PORT ?? 8791);
const jwtSecret = process.env.ACCESS_JWT_SECRET?.trim();

if (!jwtSecret || jwtSecret.length < 24) {
  throw new Error("ACCESS_JWT_SECRET missing or too short (>=24 chars)");
}

const PRIVACY_MODE = String(process.env.PRIVACY_MODE || 'true') === 'true';
const server = http.createServer((req, res) => {
  // security headers for the health endpoint
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none';");
  if (!PRIVACY_MODE) console.log(new Date().toISOString(), 'CHAT health', req.method, req.url, req.socket.remoteAddress);
  res.end('ClawChat relay OK\n');
});

const wss = new WebSocketServer({ server });

/**
 * wallet -> { ws, pubKeyB64, room, tier }
 */
const clients = new Map();

function isB64Like(s) {
  return typeof s === "string" && /^[A-Za-z0-9+/=]+$/.test(s);
}

function b64ByteLength(s) {
  try {
    return Buffer.from(s, "base64").length;
  } catch {
    return -1;
  }
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function send(ws, obj) {
  ws.send(JSON.stringify(obj));
}

function broadcastToRoom(room, obj) {
  for (const [, client] of clients) {
    if (client.room === room) {
      send(client.ws, obj);
    }
  }
}

function listPeers(room) {
  const peers = [];
  for (const [wallet, client] of clients) {
    if (client.room !== room) continue;
    if (!client.pubKeyB64) continue;
    peers.push({ wallet, pubKey: client.pubKeyB64 });
  }
  return peers;
}

wss.on("connection", (ws, req) => {
  // Connection state
  let authedWallet = null;
  let authedRoom = null;
  let authedTier = null;

  // Abuse controls
  const MAX_MESSAGE_BYTES = 16 * 1024;
  let maxMsgsPer10s = 50;
  let windowStart = Date.now();
  let windowCount = 0;

  function bumpRateOrClose() {
    const now = Date.now();
    if (now - windowStart > 10_000) {
      windowStart = now;
      windowCount = 0;
    }
    windowCount += 1;
    if (windowCount > maxMsgsPer10s) {
      try {
        ws.close(4429, "rate limit");
      } catch {
        // ignore
      }
      return false;
    }
    return true;
  }

  function requireAuthed() {
    if (!authedWallet || !authedRoom) {
      send(ws, { type: "error", error: "not authenticated" });
      return false;
    }
    return true;
  }

  ws.on("message", (buf) => {
    if (!bumpRateOrClose()) return;
    if (buf?.length && buf.length > MAX_MESSAGE_BYTES) {
      try {
        ws.close(4400, "payload too large");
      } catch {
        // ignore
      }
      return;
    }

    const msg = safeJsonParse(String(buf));
    if (!msg || typeof msg !== "object") return;

    // First message must be auth
    if (!authedWallet) {
      if (msg.type !== "auth") {
        ws.close(4401, "unauthorized");
        return;
      }
      const token = typeof msg.token === "string" ? msg.token : "";
      const room = (typeof msg.room === "string" ? msg.room : "global").slice(0, 64);
      if (!token) {
        ws.close(4401, "unauthorized");
        return;
      }

      let payload;
      try {
        payload = jwt.verify(token, jwtSecret);
      } catch {
        ws.close(4401, "unauthorized");
        return;
      }

      const wallet = typeof payload?.sub === "string" ? payload.sub : "";
      const tier = typeof payload?.tier === "string" ? payload.tier : "none";
      const scope = typeof payload?.scope === "string" ? payload.scope : "";
      const aud = typeof payload?.aud === "string" ? payload.aud : "";

      if (!wallet || tier === "none" || scope !== "chat" || aud !== "clawchat") {
        ws.close(4403, "forbidden");
        return;
      }

      authedWallet = wallet;
      authedRoom = room;
      authedTier = tier;

      // Anonymous tier gets lower throughput.
      if (tier === "anon") {
        maxMsgsPer10s = 10;
      }

      const existing = clients.get(wallet);
      if (existing) {
        try {
          existing.ws.close(4000, "replaced");
        } catch {
          // ignore
        }
      }
      clients.set(wallet, { ws, pubKeyB64: null, room, tier });

      send(ws, { type: "welcome", wallet, room, tier, peers: listPeers(room) });
      return;
    }

    if (!requireAuthed()) return;
    const wallet = authedWallet;
    const room = authedRoom;

    const client = clients.get(wallet);
    if (!client) return;

    if (msg.type === "hello") {
      const pubKey = typeof msg.pubKey === "string" ? msg.pubKey.slice(0, 256) : "";
      if (!pubKey) return;

      // Expect NaCl box public key (32 bytes) base64.
      if (!isB64Like(pubKey) || b64ByteLength(pubKey) !== 32) {
        send(ws, { type: "error", error: "invalid pubKey" });
        return;
      }
      client.pubKeyB64 = pubKey;
      broadcastToRoom(room, { type: "peer", wallet, pubKey });
      return;
    }

    if (msg.type === "msg") {
      const to = typeof msg.to === "string" ? msg.to : "";
      const ciphertext = typeof msg.ciphertext === "string" ? msg.ciphertext : "";
      const nonce = typeof msg.nonce === "string" ? msg.nonce : "";
      // Do not trust client-supplied fromPubKey; use the authenticated hello key.
      const fromPubKey = client.pubKeyB64;
      const msgId = typeof msg.msgId === "string" ? msg.msgId.slice(0, 128) : null;

      if (!to || !ciphertext || !nonce || !fromPubKey) return;

      // Require sender to have announced a valid E2EE key before sending.
      if (!client.pubKeyB64) {
        send(ws, { type: "delivery", ok: false, to, reason: "no_hello_key" });
        return;
      }

      // Validate nonce size (24 bytes) and cap payload sizes.
      if (!isB64Like(nonce) || b64ByteLength(nonce) !== 24) {
        send(ws, { type: "delivery", ok: false, to, reason: "bad_nonce" });
        return;
      }
      if (!isB64Like(ciphertext)) {
        send(ws, { type: "delivery", ok: false, to, reason: "bad_ciphertext" });
        return;
      }
      const cLen = b64ByteLength(ciphertext);
      if (cLen < 16 || cLen > 12 * 1024) {
        send(ws, { type: "delivery", ok: false, to, reason: "bad_ciphertext_len" });
        return;
      }

      // Prevent anonymous clients from broadcasting (reduces spam).
      if (authedTier === "anon" && to === "*") {
        send(ws, { type: "delivery", ok: false, to, reason: "broadcast_disabled" });
        return;
      }

      const recipient = clients.get(to);
      if (!recipient || recipient.room !== room) {
        send(ws, { type: "delivery", ok: false, to, reason: "offline" });
        return;
      }

      send(recipient.ws, {
        type: "msg",
        from: wallet,
        to,
        ciphertext,
        nonce,
        fromPubKey,
        msgId,
        ts: Date.now(),
      });
      send(ws, { type: "delivery", ok: true, to, msgId });
      return;
    }
  });

  ws.on("close", () => {
    if (!authedWallet) return;
    const wallet = authedWallet;
    const room = authedRoom;
    const current = clients.get(wallet);
    if (current?.ws === ws) {
      clients.delete(wallet);
      broadcastToRoom(room, { type: "peer_left", wallet });
    }
  });
});

server.listen(chatPort, () => {
  console.log(`ClawChat relay listening on ${chatPort}`);
});
