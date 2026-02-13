// Double Ratchet integration
const ratchetSessions = {};
const skippedKeysStore = window.ClawRatchet.createSkippedKeysStore();
function getRatchetSession(peerWallet) {
  let session = ratchetSessions[peerWallet];
  if (!session) {
    session = window.ClawRatchet.loadSession(peerWallet);
    if (!session) {
      // X3DH session setup if bundles available
      const myBundle = window.ClawRatchet.generatePrekeyBundle();
      // TODO: fetch peer bundle from relay or peer
      // For demo, fallback to createSession
      session = window.ClawRatchet.createSession();
    }
    ratchetSessions[peerWallet] = session;
  }
  return session;
}
function saveRatchetSession(peerWallet) {
  window.ClawRatchet.saveSession(peerWallet, ratchetSessions[peerWallet]);
}
// ...existing code...
const statusEl = document.getElementById("status");
const walletEl = document.getElementById("wallet");
const tierEl = document.getElementById("tier");
const peerSelect = document.getElementById("peer-select");
const inboxEl = document.getElementById("inbox");
const sendForm = document.getElementById("send-form");
const sendResult = document.getElementById("send-result");

const verifyWarningEl = document.getElementById("verify-warning");
const peerFingerprintEl = document.getElementById("peer-fingerprint");
const peerSafetyEl = document.getElementById("peer-safety");
const peerKeyStatusEl = document.getElementById("peer-key-status");
const btnMarkVerified = document.getElementById("btn-mark-verified");
const btnAcceptNewKey = document.getElementById("btn-accept-new-key");

const accessChallengeApi = window.CLAW_ACCESS_CHALLENGE_API || "http://localhost:8790/auth/challenge";
const accessLoginApi = window.CLAW_ACCESS_LOGIN_API || "http://localhost:8790/auth/login";
const accessChatTokenApi = window.CLAW_ACCESS_CHAT_TOKEN_API || "http://localhost:8790/auth/chat-token";
const accessTelegramConsumeApi =
  window.CLAW_ACCESS_TELEGRAM_CONSUME_API || "http://localhost:8790/auth/telegram/consume";

const chatWsUrl = window.CLAW_CHAT_WS || "ws://localhost:8791";
const chatRoom = window.CLAW_CHAT_ROOM || "global";

let accessToken = null;
let chatToken = null;
      let plaintext = null;
      // Double Ratchet: decrypt if ratchet message exists
      if (msg.ratchet && from !== "*") {
        const session = getRatchetSession(from);
        try {
          // Try skipped keys first for out-of-order
          const skipped = window.ClawRatchet.getSkippedKey(skippedKeysStore, from, msg.ratchet?.header?.n);
          if (skipped) {
            plaintext = nacl.util.encodeUTF8(skipped);
          } else {
            plaintext = await window.ClawRatchet.decrypt(session, msg.ratchet);
          }
        } catch (err) {
          appendInbox(`[${from}] (ratchet decrypt failed: ${String(err)})`);
          return;
        }
      } else {
        const opened = nacl.box.open(ciphertext, nonce, fromPubKey, identity.secretKey);
        if (!opened) {
          appendInbox(`[${from}] (failed to decrypt)`);
          return;
        }
        plaintext = nacl.util.encodeUTF8(opened);
      }
}

function savePeerStore(store) {
  localStorage.setItem(PEER_STORE_KEY, JSON.stringify(store));
}

async function sha256Hex(bytes) {
  if (!crypto?.subtle?.digest) {
    throw new Error("WebCrypto unavailable (use HTTPS, localhost, or Tor/onion)");
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const arr = Array.from(new Uint8Array(digest));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function fingerprintForPubKeyB64(pubKeyB64) {
  const bytes = b64ToBytes(pubKeyB64);
  const hex = await sha256Hex(bytes);
  // Display as short grouped fingerprint
  return hex.slice(0, 32).match(/.{1,4}/g).join("-");
}

async function safetyCodeForPairB64(aB64, bB64) {
  // Order-independent safety code
  const a = b64ToBytes(aB64);
  const b = b64ToBytes(bB64);
  const concat = new Uint8Array(a.length + b.length);
  const first = aB64 < bB64 ? a : b;
  const second = aB64 < bB64 ? b : a;
  concat.set(first, 0);
  concat.set(second, first.length);
  const hex = await sha256Hex(concat);
  // 6 groups of 5 digits (derived from hex) for easy comparison
  const digits = BigInt("0x" + hex).toString(10).padStart(30, "0").slice(0, 30);
  return digits.match(/.{1,5}/g).join(" ");
}

function setVerifyWarning(text) {
  if (!verifyWarningEl) return;
  verifyWarningEl.textContent = text || "";
}

function selectedPeerWallet() {
  return peerSelect?.value || "*";
}

function getPeerRecord(wallet) {
  const store = loadPeerStore();
  return store[wallet] || null;
}

function setPeerRecord(wallet, record) {
  const store = loadPeerStore();
  store[wallet] = record;
  savePeerStore(store);
}

function markPeerVerified(wallet) {
  const rec = getPeerRecord(wallet);
  if (!rec) return;
  rec.verifiedAt = new Date().toISOString();
  setPeerRecord(wallet, rec);
}

function acceptPeerKey(wallet, pubKeyB64) {
  const rec = getPeerRecord(wallet) || { wallet };
  rec.pinnedPubKeyB64 = pubKeyB64;
  rec.firstSeenAt = rec.firstSeenAt || new Date().toISOString();
  rec.lastSeenAt = new Date().toISOString();
  rec.keyChangedAt = null;
  setPeerRecord(wallet, rec);
}

function setStatus(text) {
  statusEl.textContent = text;
}

function getProvider() {
  const provider = window.solana;
  if (!provider || !provider.isPhantom) {
    throw new Error("Phantom wallet not found. Install Phantom to continue.");
  }
  return provider;
}

async function connectWallet() {
  const provider = getProvider();
  const resp = await provider.connect();
  return resp.publicKey.toString();
}

async function signMessageUtf8(message) {
  const provider = getProvider();
  const encodedMessage = new TextEncoder().encode(message);
  const signed = await provider.signMessage(encodedMessage, "utf8");
  const bytes = signed.signature;
  return btoa(String.fromCharCode(...bytes));
}

function loadOrCreateIdentity() {
  const existing = localStorage.getItem(IDENTITY_STORAGE_KEY);
  if (existing) {
    try {
      const parsed = JSON.parse(existing);
      const pk = nacl.util.decodeBase64(parsed.publicKey);
      const sk = nacl.util.decodeBase64(parsed.secretKey);
      identity = { publicKey: pk, secretKey: sk };
      return identity;
    } catch {
      // ignore
    }
  }
  const kp = nacl.box.keyPair();
  identity = kp;
  localStorage.setItem(
    IDENTITY_STORAGE_KEY,
    JSON.stringify({
      publicKey: nacl.util.encodeBase64(kp.publicKey),
      secretKey: nacl.util.encodeBase64(kp.secretKey),
    }),
  );
  return identity;
}

function clearPeers() {
  peerSelect.innerHTML = "";
  const opt = document.createElement("option");
  opt.value = "*";
  opt.textContent = "Broadcast to all peers";
  peerSelect.appendChild(opt);
}

function upsertPeer(peer) {
  const value = peer.wallet;
  const label = `${peer.wallet.slice(0, 4)}…${peer.wallet.slice(-4)}`;

  const existing = Array.from(peerSelect.options).find((o) => o.value === value);
  if (existing) {
    existing.textContent = label;
    existing.dataset.pubkey = peer.pubKey;
    void refreshVerificationUI();
    return;
  }
  const opt = document.createElement("option");
  opt.value = value;
  opt.textContent = label;
  opt.dataset.pubkey = peer.pubKey;
  peerSelect.appendChild(opt);

  // TOFU pin on first sight, but still show as unverified until user marks verified.
  const rec = getPeerRecord(value);
  if (!rec?.pinnedPubKeyB64) {
    acceptPeerKey(value, peer.pubKey);
  }
  void refreshVerificationUI();
}

function removePeer(peerWallet) {
  const opt = Array.from(peerSelect.options).find((o) => o.value === peerWallet);
  if (opt) opt.remove();
  void refreshVerificationUI();
}

function getPeerPubKeyB64(peerWallet) {
  const opt = Array.from(peerSelect.options).find((o) => o.value === peerWallet);
  return opt?.dataset?.pubkey || null;
}

function appendInbox(line) {
  inboxEl.textContent = `${line}\n${inboxEl.textContent || ""}`;
}

async function refreshVerificationUI() {
  if (!peerFingerprintEl || !peerSafetyEl || !peerKeyStatusEl) return;

  const peerWallet = selectedPeerWallet();
  if (!peerWallet || peerWallet === "*") {
    peerFingerprintEl.textContent = "—";
    peerSafetyEl.textContent = "—";
    peerKeyStatusEl.textContent = "—";
    setVerifyWarning("");
    return;
  }

  const peerPubKeyB64 = getPeerPubKeyB64(peerWallet);
  if (!peerPubKeyB64 || !identity) {
    peerFingerprintEl.textContent = "—";
    peerSafetyEl.textContent = "—";
    peerKeyStatusEl.textContent = "No key";
    setVerifyWarning("Peer key not available yet.");
    return;
  }

  const rec = getPeerRecord(peerWallet) || { wallet: peerWallet };

  // Detect key change vs pinned key
  const pinned = rec.pinnedPubKeyB64 || null;
  const isChange = pinned && pinned !== peerPubKeyB64;
  if (isChange && !rec.keyChangedAt) {
    rec.keyChangedAt = new Date().toISOString();
    rec.lastSeenAt = new Date().toISOString();
    setPeerRecord(peerWallet, rec);
  }

  try {
    const fp = await fingerprintForPubKeyB64(peerPubKeyB64);
    const safety = await safetyCodeForPairB64(
      nacl.util.encodeBase64(identity.publicKey),
      peerPubKeyB64,
    );
    peerFingerprintEl.textContent = fp;
    peerSafetyEl.textContent = safety;
  } catch (err) {
    peerFingerprintEl.textContent = "Unavailable";
    peerSafetyEl.textContent = "Unavailable";
    setVerifyWarning(
      `WARNING: ${String(err?.message || err)}. Verification UI is degraded.`,
    );
  }

  const verified = Boolean(rec.verifiedAt);
  if (isChange) {
    peerKeyStatusEl.textContent = verified ? "Key changed (verified peer)" : "Key changed";
    setVerifyWarning(
      "WARNING: This peer's key changed. Do NOT continue until you verify the safety code out-of-band.",
    );
  } else {
    peerKeyStatusEl.textContent = verified ? "Verified" : "Unverified (TOFU)";
    setVerifyWarning(
      verified
        ? ""
        : "Unverified peer. Compare the safety code with your peer on a trusted channel, then click Mark verified.",
    );
  }
}

async function login() {
  setStatus("Signing in...");
  wallet = await connectWallet();
  walletEl.textContent = wallet;

  const chRes = await fetch(accessChallengeApi, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet }),
  });
  const ch = await chRes.json();
  if (!chRes.ok) throw new Error(ch?.error || "Failed to get login challenge");

  const signature = await signMessageUtf8(ch.message);

  const loginRes = await fetch(accessLoginApi, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, nonce: ch.nonce, signature }),
  });
  const data = await loginRes.json();
  if (!loginRes.ok) throw new Error(data?.error || "Login failed");

  accessToken = data.token;
  tier = data.tier;
  tierEl.textContent = tier;

  const chatRes = await fetch(accessChatTokenApi, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: accessToken }),
  });
  const chat = await chatRes.json();
  if (!chatRes.ok) throw new Error(chat?.error || "Failed to mint chat token");
  chatToken = chat.token;

  setStatus("Logged in. Ready to connect chat.");
}

async function loginTelegram(code) {
  setStatus("Logging in with Telegram code...");
  const res = await fetch(accessTelegramConsumeApi, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Telegram login failed");

  accessToken = data.token;
  tier = data.tier;
  tierEl.textContent = tier;
  wallet = data.sub || "telegram";
  walletEl.textContent = "Telegram (pseudonymous)";

  const chatRes = await fetch(accessChatTokenApi, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: accessToken }),
  });
  const chat = await chatRes.json();
  if (!chatRes.ok) throw new Error(chat?.error || "Failed to mint chat token");
  chatToken = chat.token;

  setStatus("Telegram login OK. Ready to connect chat.");
}

function connectChat() {
  if (!chatToken) throw new Error("Login first");
  if (ws && ws.readyState === WebSocket.OPEN) return;

  clearPeers();
  loadOrCreateIdentity();

  setStatus("Connecting to relay...");
  ws = new WebSocket(chatWsUrl);

  ws.addEventListener("open", () => {
    setStatus("Connected. Authenticating...");
    ws.send(JSON.stringify({ type: "auth", token: chatToken, room: chatRoom }));
  });

  ws.addEventListener("message", async (event) => {
    const msg = (() => {
      try {
        return JSON.parse(event.data);
      } catch {
        return null;
      }
    })();
    if (!msg) return;

    if (msg.type === "welcome") {
      setStatus(`Chat ready (room=${msg.room}).`);
      for (const peer of msg.peers || []) {
        upsertPeer(peer);
      }
      // publish our E2EE public key
      ws.send(
        JSON.stringify({
          type: "hello",
          pubKey: nacl.util.encodeBase64(identity.publicKey),
        }),
      );
      void refreshVerificationUI();
      return;
    }

    if (msg.type === "peer") {
      upsertPeer({ wallet: msg.wallet, pubKey: msg.pubKey });
      appendInbox(`[peer] ${msg.wallet} joined`);
      return;
    }

    if (msg.type === "peer_left") {
      removePeer(msg.wallet);
      appendInbox(`[peer] ${msg.wallet} left`);
      return;
    }

    if (msg.type === "msg") {
      const from = msg.from;
      const fromPubKey = nacl.util.decodeBase64(msg.fromPubKey);
      const nonce = nacl.util.decodeBase64(msg.nonce);
      const ciphertext = nacl.util.decodeBase64(msg.ciphertext);

      // Enforce pinned key: if a peer's pinned key mismatches current, refuse to decrypt.
      const rec = getPeerRecord(from);
      if (rec?.pinnedPubKeyB64 && rec.pinnedPubKeyB64 !== msg.fromPubKey) {
        appendInbox(
          `[${from}] (blocked: key changed — verify safety code before accepting new key)`,
        );
        void refreshVerificationUI();
        return;
      }

      const opened = nacl.box.open(ciphertext, nonce, fromPubKey, identity.secretKey);
      if (!opened) {
        appendInbox(`[${from}] (failed to decrypt)`);
        return;
      }

      const plaintext = nacl.util.encodeUTF8(opened);
      if (msg.pgp && window.openpgp) {
        try {
          const pgpPrivKey = localStorage.getItem("clawchat.pgp.privkey");
          if (pgpPrivKey) {
            const privKeyObj = await window.openpgp.readPrivateKey({ armoredKey: pgpPrivKey });
            const decrypted = await window.openpgp.decrypt({
              message: await window.openpgp.readMessage({ armoredMessage: msg.pgp }),
              decryptionKeys: [privKeyObj],
            });
            appendInbox(`[${from}] [PGP] ${decrypted.data}`);
            return;
          }
        } catch (err) {
          appendInbox(`[${from}] [PGP] (failed to decrypt: ${String(err)})`);
          return;
        }
      }
      appendInbox(`[${from}] ${plaintext}`);
      return;
    }

    if (msg.type === "delivery") {
      return;
    }

    if (msg.type === "error") {
      appendInbox(`[error] ${msg.error}`);
      return;
    }
  });

  ws.addEventListener("close", () => {
    setStatus("Disconnected");
  });

  ws.addEventListener("error", () => {
    setStatus("Socket error");
  });
}

function randomMsgId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...bytes));
}

function padPlaintext(text, targetBytes = 256) {
  const bytes = nacl.util.decodeUTF8(text);
  if (bytes.length >= targetBytes) return bytes;
  const padded = new Uint8Array(targetBytes);
  padded.set(bytes);
  // simple zero padding; recipient trims trailing zeros
  return padded;
}

function unpadPlaintextBytes(bytes) {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end -= 1;
  return bytes.slice(0, end);
}

sendForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  sendResult.textContent = "";

  try {
    if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error("Chat not connected");

    const data = new FormData(sendForm);
    const text = String(data.get("message") || "").trim();
    if (!text) return;

    const selected = peerSelect.value;
    const targets =
      selected === "*"
        ? Array.from(peerSelect.options)
            .map((o) => o.value)
            .filter((v) => v && v !== "*")
        : [selected];

    if (targets.length === 0) throw new Error("No peers online");

    const pgpMode = document.getElementById("pgp-mode")?.checked;
    let pgpPayload = null;
    if (pgpMode && window.openpgp) {
      // Simple ephemeral PGP keypair for demo; in production, use user-supplied keys.
      let pgpPrivKey = localStorage.getItem("clawchat.pgp.privkey");
      let pgpPubKey = localStorage.getItem("clawchat.pgp.pubkey");
      if (!pgpPrivKey || !pgpPubKey) {
        const { privateKey, publicKey } = await window.openpgp.generateKey({
          type: "rsa",
          rsaBits: 2048,
          userIDs: [{ name: "ClawChat user" }],
        });
        pgpPrivKey = privateKey;
        pgpPubKey = publicKey;
        localStorage.setItem("clawchat.pgp.privkey", pgpPrivKey);
        localStorage.setItem("clawchat.pgp.pubkey", pgpPubKey);
      }
      const privKeyObj = await window.openpgp.readPrivateKey({ armoredKey: pgpPrivKey });
      const pubKeyObj = await window.openpgp.readKey({ armoredKey: pgpPubKey });
      const encrypted = await window.openpgp.encrypt({
        message: window.openpgp.createMessage({ text }),
        encryptionKeys: [pubKeyObj],
        signingKeys: [privKeyObj],
      });
      pgpPayload = encrypted;
    }

    for (const to of targets) {
      const peerPubKeyB64 = getPeerPubKeyB64(to);
      if (!peerPubKeyB64) continue;
      const peerPubKey = nacl.util.decodeBase64(peerPubKeyB64);

      const nonce = nacl.randomBytes(nacl.box.nonceLength);
      const padded = padPlaintext(text, 256);
      const ciphertext = nacl.box(padded, nonce, peerPubKey, identity.secretKey);

      ws.send(
        JSON.stringify({
          type: "msg",
          to,
          msgId: randomMsgId(),
          nonce: nacl.util.encodeBase64(nonce),
          ciphertext: nacl.util.encodeBase64(ciphertext),
          fromPubKey: nacl.util.encodeBase64(identity.publicKey),
          pgp: pgpPayload || null,
        }),
      );
    }

    sendForm.reset();
    sendResult.textContent = "Sent.";
  } catch (err) {
    sendResult.textContent = String(err?.message || err);
  }
});

// Patch decrypt to unpad
(function patchUnpad() {
  const original = nacl.box.open;
  nacl.box.open = function (ciphertext, nonce, publicKey, secretKey) {
    const opened = original(ciphertext, nonce, publicKey, secretKey);
    if (!opened) return null;
    return unpadPlaintextBytes(opened);
  };
})();

document.getElementById("btn-login")?.addEventListener("click", async () => {
  try {
    await login();
  } catch (err) {
    setStatus(String(err?.message || err));
  }
});

peerSelect?.addEventListener("change", () => {
  void refreshVerificationUI();
});

btnMarkVerified?.addEventListener("click", () => {
  const w = selectedPeerWallet();
  if (!w || w === "*") return;
  markPeerVerified(w);
  void refreshVerificationUI();
  appendInbox(`[security] Marked ${w} as verified`);
});

btnAcceptNewKey?.addEventListener("click", () => {
  const w = selectedPeerWallet();
  if (!w || w === "*") return;
  const pk = getPeerPubKeyB64(w);
  if (!pk) return;
  acceptPeerKey(w, pk);
  void refreshVerificationUI();
  appendInbox(`[security] Accepted new key for ${w}`);
});

document.getElementById("btn-connect")?.addEventListener("click", () => {
  try {
    connectChat();
  } catch (err) {
    setStatus(String(err?.message || err));
  }
});

document.getElementById("btn-tg-login")?.addEventListener("click", async () => {
  try {
    const code = String(document.getElementById("tg-code")?.value || "").trim();
    if (!code) throw new Error("Enter a Telegram code");
    await loginTelegram(code);
  } catch (err) {
    setStatus(String(err?.message || err));
  }
});

clearPeers();
setStatus("Load complete. Login to begin.");
