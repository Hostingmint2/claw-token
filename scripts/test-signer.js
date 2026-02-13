import { createSigner } from '../agents/openclaw-agent/signer.js';

async function main() {
  try {
    // Default VAULT_URL for local dev and prefer vault signer if available
    if (!process.env.VAULT_URL) process.env.VAULT_URL = 'http://localhost:8200';
    if (!process.env.SIGNER_MODE && process.env.VAULT_URL) process.env.SIGNER_MODE = 'vault';
    const s = await createSigner();
    console.log('Signer mode:', s.mode);
    console.log('Public key:', s.getPublicKey().toBase58());
    const msg = new TextEncoder().encode('hello');
    const sig = await s.signMessage(msg);
    console.log('Signature (base64):', Buffer.from(sig).toString('base64'));
  } catch (err) {
    console.error('Signer test failed:', err);
    process.exit(1);
  }
}
main();
