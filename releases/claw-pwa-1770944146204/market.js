const API = (window.OPENCLAW_URL || '/');

function getJWT() { return window.getClawJWT ? window.getClawJWT() : null; }

async function fetchListings() {
  const token = getJWT();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const resp = await fetch(`${API}market/listings`, { headers });
  const data = await resp.json();
  if (!data.ok) throw new Error(data.error || 'failed');
  return data.listings;
}

async function render() {
  const listEl = document.getElementById('list');
  try {
    const listings = await fetchListings();
    listEl.innerHTML = listings.map((l) => `<div class="card"><h4>${l.description}</h4><p>Price: ${l.amount}</p><small>Seller: ${l.seller}</small></div>`).join('\n');
  } catch (err) {
    listEl.innerHTML = `<div class="error">${err.message}</div>`;
  }
}

async function createListing() {
  try {
    await window.ensureClawLogin();
  } catch (err) {
    return alert('Please login first');
  }
  const token = getJWT();
  const title = document.getElementById('title').value;
  const desc = document.getElementById('desc').value;
  const price = document.getElementById('price').value;
  const resp = await fetch(`/market/listings`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ title, description: desc, price }) });
  const data = await resp.json();
  if (!data.ok) return alert('error: ' + (data.error || 'unknown'));
  alert('Listing created');
  render();
}

function showLogin() {
  const loginEl = document.getElementById('login');
  loginEl.innerHTML = '<button id="loginBtn">Login</button>';
  document.getElementById('loginBtn').addEventListener('click', async () => { try { await window.ensureClawLogin(); location.reload(); } catch (err) { alert('login failed'); }});
}

document.getElementById('createBtn').addEventListener('click', createListing);

// attempt to ensure login silently, else show login button
window.ensureClawLogin().then(() => {
  document.getElementById('create').style.display = 'block';
}).catch(() => {
  showLogin();
});

render();
