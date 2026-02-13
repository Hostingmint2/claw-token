const btnLogin = document.getElementById('btn-login');
const createForm = document.getElementById('create-form');
const createResult = document.getElementById('create-result');
const offersList = document.getElementById('offers-list');

const ACCESS_CHALLENGE = window.CLAW_ACCESS_CHALLENGE_API || 'http://localhost:8790/auth/challenge';
const ACCESS_LOGIN = window.CLAW_ACCESS_LOGIN_API || 'http://localhost:8790/auth/login';
const ACCESS_TELEGRAM_CONSUME = window.CLAW_ACCESS_TELEGRAM_CONSUME_API || 'http://localhost:8790/auth/telegram/consume';
const AGENT_URL = window.CLAW_OPENCLAW_API || 'http://localhost:9800';

let accessToken = null;
let wallet = null;

async function connectWallet() {
  const provider = window.solana;
  if (!provider || !provider.isPhantom) throw new Error('Phantom not found');
  const resp = await provider.connect();
  return resp.publicKey.toString();
}

async function signMessageUtf8(message) {
  const provider = window.solana;
  const encodedMessage = new TextEncoder().encode(message);
  const signed = await provider.signMessage(encodedMessage, 'utf8');
  const bytes = signed.signature;
  return btoa(String.fromCharCode(...bytes));
}

async function login() {
  wallet = await connectWallet();
  const chRes = await fetch(ACCESS_CHALLENGE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wallet }) });
  const ch = await chRes.json();
  if (!chRes.ok) throw new Error(ch?.error || 'challenge failed');
  const signature = await signMessageUtf8(ch.message);
  const loginRes = await fetch(ACCESS_LOGIN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, nonce: ch.nonce, signature }),
  });
  const data = await loginRes.json();
  if (!loginRes.ok) throw new Error(data?.error || 'login failed');
  accessToken = data.token;
  localStorage.setItem('claw.access.token', accessToken);
  btnLogin.textContent = `Logged in: ${wallet.slice(0,6)}...`;
  await refreshOffers();
}

async function refreshOffers() {
  try {
    const res = await fetch(`${AGENT_URL}/offers`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'failed to list');
    renderOffers(data.offers || []);
  } catch (err) {
    offersList.innerHTML = `<div class="note">Unable to list offers: ${err?.message || err}</div>`;
  }
}

function renderOffers(items) {
  if (!items || items.length === 0) { offersList.innerHTML = '<div class="note">No offers</div>'; return; }
  offersList.innerHTML = items.map((o) => {
    const feePercent = Number(o.feePercent || 0);
    let fee = '';
    let payout = '';
    if (o.itemType === 'token' && o.amount) {
      try {
        const amount = BigInt(o.amount);
        const feeCalc = feePercent > 0 ? (amount * BigInt(Math.round(feePercent * 100))) / BigInt(100 * 100) : BigInt(0);
        const payoutCalc = amount - feeCalc;
        fee = String(feeCalc);
        payout = String(payoutCalc);
      } catch (err) {
        fee = 'N/A'; payout = 'N/A';
      }
    }
    return `<div class="card" style="padding:0.8rem;">
      <div><strong>${o.id}</strong></div>
      <div>Description: ${o.description || '—'}</div>
      <div>Type: ${o.itemType}</div>
      <div>Buyer: ${o.buyer}</div>
      <div>Seller: ${o.seller}</div>
      <div>Amount: ${o.amount || '—'}</div>
      <div>Mint: ${o.tokenMint || '—'}</div>
      <div>Fee %: ${feePercent}% ${fee ? `(fee=${fee} payout=${payout})` : ''}</div>
      <div>Status: ${o.status}</div>
      <div style="margin-top:0.6rem;display:flex;gap:0.5rem;flex-wrap:wrap;">
        <button data-id="${o.id}" data-action="fund">Mark funded</button>
        <button data-id="${o.id}" data-action="fulfill">Mark fulfilled</button>
        <button data-id="${o.id}" data-action="refund">Request refund</button>
      </div>
    </div>`;
  }).join('');
}

createForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  createResult.textContent = 'Creating offer...';
  try {
    if (!accessToken) throw new Error('Login first');
    const data = new FormData(createForm);
    const description = String(data.get('description') || '').trim();
    const itemType = String(data.get('itemType') || 'token');
    const seller = String(data.get('seller') || '').trim();
    const amount = String(data.get('amount') || '').trim();
    const tokenMint = String(data.get('tokenMint') || '').trim();
    const feePercent = Number(data.get('feePercent') || 1.5);
    const res = await fetch(`${AGENT_URL}/offers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ description, itemType, seller, amount, tokenMint, feePercent }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body?.error || 'create failed');
    createResult.textContent = `Offer created: ${body.offer.id}`;
    await refreshOffers();
  } catch (err) {
    createResult.textContent = `Create failed: ${err?.message || err}`;
  }
});

offersList?.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  if (!accessToken) return alert('Login first');
  try {
    const url = `${AGENT_URL}/offers/${id}/${action}`;
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
    const body = await res.json();
    if (!res.ok) throw new Error(body?.error || 'action failed');
    await refreshOffers();
  } catch (err) {
    alert('Action failed: ' + (err?.message || err));
  }
});

btnLogin?.addEventListener('click', async () => {
  try { await login(); } catch (err) { alert('Login failed: ' + (err?.message || err)); }
});

document.getElementById('btn-tg-login')?.addEventListener('click', async () => {
  try {
    const code = String(document.getElementById('tg-code')?.value || '').trim();
    if (!code) return alert('Enter a Telegram code');
    const res = await fetch(ACCESS_TELEGRAM_CONSUME, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Telegram consume failed');
    accessToken = data.token;
    localStorage.setItem('claw.access.token', accessToken);
    btnLogin.textContent = 'Logged in: Telegram';
    await refreshOffers();
  } catch (err) {
    alert('Telegram login failed: ' + (err?.message || err));
  }
});

// Auto-refresh every 8s
setInterval(() => { if (accessToken) refreshOffers(); }, 8000);

// Try to refresh on load if user already has a session token in localStorage
(async () => {
  const stored = localStorage.getItem('claw.access.token');
  if (stored) { accessToken = stored; await refreshOffers(); }
})();