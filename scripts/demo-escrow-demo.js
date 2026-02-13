import axios from 'axios';
import jwt from 'jsonwebtoken';
import "dotenv/config";

const AGENT_URL = process.env.OPENCLAW_URL || 'http://localhost:9800';
const SECRET = process.env.ACCESS_JWT_SECRET || 'demo-secret';

function makeToken(sub) {
  return jwt.sign({ sub, tier: 'gold' }, SECRET, { expiresIn: '1h' });
}

async function main() {
  console.log('Demo starting, agent:', AGENT_URL);
  const buyer = 'DemoBuyer1111111111111111111111111111111111';
  const seller = 'DemoSeller2222222222222222222222222222222222';
  const tokenMint = process.env.DEMO_TOKEN_MINT || 'So11111111111111111111111111111111111111112';

  const buyerToken = makeToken(buyer);
  const sellerToken = makeToken(seller);

  // Create token offer (buyer)
  const offerResp = await axios.post(
    `${AGENT_URL}/offers`,
    {
      id: `demo-token-${Date.now()}`,
      buyer,
      seller,
      amount: '1000000',
      tokenMint,
      itemType: 'token',
      feePercent: 1.5,
      description: 'Demo token sale',
      status: 'open',
    },
    { headers: { Authorization: `Bearer ${buyerToken}` } },
  );
  console.log('Created token offer:', offerResp.data.offer.id);
  const id = offerResp.data.offer.id;

  // Mark funded
  await axios.post(`${AGENT_URL}/offers/${id}/fund`, {}, { headers: { Authorization: `Bearer ${buyerToken}` } });
  console.log('Marked funded');

  // Seller marks fulfilled
  await axios.post(`${AGENT_URL}/offers/${id}/fulfill`, {}, { headers: { Authorization: `Bearer ${sellerToken}` } });
  console.log('Seller marked fulfilled');

  // Create generic offer (buyer) with fee
  const genResp = await axios.post(
    `${AGENT_URL}/offers`,
    {
      id: `demo-generic-${Date.now()}`,
      buyer,
      seller: 'GenericSeller00000000000000000000000000000000',
      amount: '0',
      itemType: 'generic',
      feePercent: 2.0,
      description: 'Domain transfer',
      status: 'open',
    },
    { headers: { Authorization: `Bearer ${buyerToken}` } },
  );
  console.log('Created generic offer:', genResp.data.offer.id);
  const gid = genResp.data.offer.id;
  await axios.post(`${AGENT_URL}/offers/${gid}/fund`, {}, { headers: { Authorization: `Bearer ${buyerToken}` } });
  // Generic seller marks fulfilled (seller should mark delivered)
  const genericSellerToken = makeToken('GenericSeller00000000000000000000000000000000');
  await axios.post(`${AGENT_URL}/offers/${gid}/fulfill`, {}, { headers: { Authorization: `Bearer ${genericSellerToken}` } });
  console.log('Generic offer fulfilled');

  // --- Shipped item demo: seller marks shipped with tracking, then tracking updates to 'delivered' to trigger release ---
  const shipSeller = 'Shipper3333333333333333333333333333333333';
  const shippedResp = await axios.post(
    `${AGENT_URL}/offers`,
    {
      id: `demo-shipped-${Date.now()}`,
      buyer,
      seller: shipSeller,
      amount: '500000',
      itemType: 'shipped',
      feePercent: 1.5,
      description: 'Physical item (shipped)',
      status: 'open',
    },
    { headers: { Authorization: `Bearer ${buyerToken}` } },
  );
  console.log('Created shipped offer:', shippedResp.data.offer.id);
  const sid = shippedResp.data.offer.id;
  await axios.post(`${AGENT_URL}/offers/${sid}/fund`, {}, { headers: { Authorization: `Bearer ${buyerToken}` } });
  console.log('Shipped offer funded');
  const shipSellerToken = makeToken(shipSeller);
  const trackingNumber = `TRACK-DEL-${Date.now()}`;
  await axios.post(`${AGENT_URL}/offers/${sid}/ship`, { carrier: 'UPS', trackingNumber }, { headers: { Authorization: `Bearer ${shipSellerToken}` } });
  console.log('Seller marked shipped with tracking', trackingNumber);
  // Simulate tracking delivered (provider or seller webhook)
  await axios.post(`${AGENT_URL}/offers/${sid}/tracking`, { status: 'delivered', deliveredAt: new Date().toISOString() }, { headers: { Authorization: `Bearer ${shipSellerToken}` } });
  console.log('Tracking updated to delivered for', sid);

  // --- Dispute example: buyer raises dispute and agent must not auto-release even if delivered/expiry occurs ---
  const disputeResp = await axios.post(
    `${AGENT_URL}/offers`,
    {
      id: `demo-ship-dispute-${Date.now()}`,
      buyer,
      seller: 'BadShipper44444444444444444444444444444444',
      amount: '200000',
      itemType: 'shipped',
      feePercent: 1.5,
      description: 'Dispute example',
      status: 'open',
    },
    { headers: { Authorization: `Bearer ${buyerToken}` } },
  );
  const did = disputeResp.data.offer.id;
  await axios.post(`${AGENT_URL}/offers/${did}/fund`, {}, { headers: { Authorization: `Bearer ${buyerToken}` } });
  const badSellerToken = makeToken('BadShipper44444444444444444444444444444444');
  await axios.post(`${AGENT_URL}/offers/${did}/ship`, { carrier: 'DHL', trackingNumber: `TRACK-NOT-DEL-${Date.now()}` }, { headers: { Authorization: `Bearer ${badSellerToken}` } });
  // Buyer raises dispute
  await axios.post(`${AGENT_URL}/offers/${did}/dispute`, {}, { headers: { Authorization: `Bearer ${buyerToken}` } });
  console.log('Dispute created for', did);

  // Wait a few seconds for agent loop to process
  await new Promise((r) => setTimeout(r, 5000));

  // Fetch offers
  const list = await axios.get(`${AGENT_URL}/offers`, { headers: { Authorization: `Bearer ${buyerToken}` } });
  console.log('Offers:', list.data.offers.filter((o) => o.id === id));
}

main().catch((err) => {
  console.error('Demo failed:', err?.response?.data || err?.message || err);
  process.exit(1);
});