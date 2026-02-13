const claimForm = document.getElementById("claim-form");
const claimResult = document.getElementById("claim-result");

const claimChallengeApi = window.CLAW_CLAIM_CHALLENGE_API || "http://localhost:8787/challenge";
const claimApi = window.CLAW_CLAIM_API || "http://localhost:8787/claim";

const accessChallengeApi = window.CLAW_ACCESS_CHALLENGE_API || "http://localhost:8790/auth/challenge";
const accessLoginApi = window.CLAW_ACCESS_LOGIN_API || "http://localhost:8790/auth/login";

function getProvider() {
  const provider = window.solana;
  if (!provider || !provider.isPhantom) {
    throw new Error("Phantom wallet not found. Install Phantom to continue.");
  }
  return provider;
}

async function signMessageUtf8(message) {
  const provider = getProvider();
  const encodedMessage = new TextEncoder().encode(message);
  const signed = await provider.signMessage(encodedMessage, "utf8");
  // signed.signature is Uint8Array
  const bytes = signed.signature;
  // Base58 encoding in browser without deps (simple base58 impl is non-trivial), so we send base64
  // and have server accept base64 OR base58 later if you want.
  // For now we hex encode and decode on server? We didn't implement that.
  // We'll use base58 via Phantom's public API? Not available.
  // So: fallback to base64 and server will accept base64 in a follow-up patch.
  const b64 = btoa(String.fromCharCode(...bytes));
  return { signatureBase64: b64 };
}

async function connectWallet() {
  const provider = getProvider();
  const resp = await provider.connect();
  return resp.publicKey.toString();
}

// Claim flow: challenge -> sign -> claim
claimForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  claimResult.textContent = "Preparing claim...";

  try {
    const wallet = await connectWallet();
    const formData = new FormData(claimForm);
    const postUrl = String(formData.get("postUrl") || "").trim();

    const chRes = await fetch(claimChallengeApi, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet }),
    });
    const ch = await chRes.json();
    if (!chRes.ok) throw new Error(ch?.error || "Failed to get claim challenge");

    const { signatureBase64 } = await signMessageUtf8(ch.message);

    claimResult.textContent = "Submitting claim...";
    const res = await fetch(claimApi, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet,
        postUrl,
        nonce: ch.nonce,
        signature: signatureBase64,
        proof: ch.claimCode,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Claim failed");
    claimResult.textContent = `Claim succeeded. Tx: ${data.signature}`;
  } catch (err) {
    claimResult.textContent = `Claim failed: ${err?.message || err}`;
  }
});

// Access login helper (call this from console for now)
window.clawLogin = async () => {
  const wallet = await connectWallet();
  const chRes = await fetch(accessChallengeApi, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet }),
  });
  const ch = await chRes.json();
  if (!chRes.ok) throw new Error(ch?.error || "Failed to get access challenge");

  const { signatureBase64 } = await signMessageUtf8(ch.message);
  const loginRes = await fetch(accessLoginApi, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, nonce: ch.nonce, signature: signatureBase64 }),
  });
  const data = await loginRes.json();
  if (!loginRes.ok) throw new Error(data?.error || "Login failed");
  return data;
};

// --- client-side auth helpers
function setClawJWT(token) { try { localStorage.setItem('claw_jwt', token); } catch {} }
function getClawJWT() { try { return localStorage.getItem('claw_jwt'); } catch { return null; } }

async function ensureClawLogin() {
  let token = getClawJWT();
  if (!token) {
    const data = await window.clawLogin();
    token = data.token || data.jwt || data.accessToken || '';
    if (!token) throw new Error('login failed');
    setClawJWT(token);
  }
  return token;
}

function clawAuthFetch(url, opts = {}) {
  opts.headers = opts.headers || {};
  const token = getClawJWT();
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  return fetch(url, opts);
}

// expose globally for other site scripts
window.getClawJWT = getClawJWT;
window.setClawJWT = setClawJWT;
window.ensureClawLogin = ensureClawLogin;
window.clawAuthFetch = clawAuthFetch;

// Telegram consume helper
const telegramConsumeApi = window.CLAW_ACCESS_TELEGRAM_CONSUME_API || (accessLoginApi.replace(/\/auth\/login$/, '') + '/auth/telegram/consume');

async function consumeTelegramCode(code) {
  const res = await fetch(telegramConsumeApi, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'consume failed');
  const token = data.token || data.jwt || data.token || data?.token;
  if (token) setClawJWT(token);
  return data;
}

window.consumeTelegramCode = consumeTelegramCode;

// Try to open Telegram app (deep-link) or fallback to web
function openTelegramBot() {
  const bot = window.CLAW_TELEGRAM_BOT || window.CLAW_TELEGRAM_BOT_USERNAME || '';
  const fallback = 'https://web.telegram.org/';
  if (!bot) {
    window.open(fallback, '_blank');
    return;
  }
  const tglink = `tg://resolve?domain=${bot.replace(/^@/, '')}`;
  const web = `https://t.me/${bot.replace(/^@/, '')}`;
  // attempt native link first
  const a = document.createElement('a');
  a.href = tglink;
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { window.open(web, '_blank'); a.remove(); }, 800);
}
window.openTelegramBot = openTelegramBot;

// Attach UI handler if present
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('tg-submit');
  const out = document.getElementById('telegram-result');
  const ctaHeader = document.getElementById('tg-cta-header');
  const ctaMarket = document.getElementById('tg-cta-market');
  if (ctaHeader) ctaHeader.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('telegram-login')?.scrollIntoView({ behavior: 'smooth' }); });
  if (ctaMarket) ctaMarket.addEventListener('click', (e) => { e.preventDefault(); window.location.href = '/#telegram-login'; });
  // mobile deep-link button (if present)
  const mobileTg = document.getElementById('tg-mobile-fab');
  if (mobileTg) mobileTg.addEventListener('click', (e) => { e.preventDefault(); openTelegramBot(); });

  // open Telegram / open bot buttons
  const openAppBtn = document.getElementById('tg-open-app');
  if (openAppBtn) openAppBtn.addEventListener('click', (e) => { e.preventDefault(); openTelegramBot(); });
  const getCodeBtn = document.getElementById('tg-get-code');
  if (getCodeBtn) getCodeBtn.addEventListener('click', (e) => { e.preventDefault(); openTelegramBot(); alert('Open the bot and send /code or /start to receive a login code.'); });

  if (!btn) return;
  btn.addEventListener('click', async () => {
    const codeEl = document.getElementById('tg-code');
    const code = codeEl?.value?.trim();
    if (!code) return out.textContent = 'Please enter a code';
    out.textContent = 'Verifying...';
    try {
      const data = await consumeTelegramCode(code);
      out.textContent = `Login OK — tier: ${data.tier} balance: ${data.balance}`;
      setTimeout(() => location.reload(), 600);
    } catch (err) {
      out.textContent = `Error: ${err?.message || err}`;
    }
  });
});
