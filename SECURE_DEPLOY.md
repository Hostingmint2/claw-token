# Secure deploy checklist (production readiness)

This document lists required steps and checks to bring the escrow stack to production with a security-first posture.

## Must have (blocker before enabling `OPENCLAW_EXECUTE=true`)

1. Signer & key management
   - Use a KMS/HSM provider for custodial signing (AWS KMS, GCP KMS, or HashiCorp Vault Transit). Do NOT store private keys on disk.
   - Set `SIGNER_MODE=kms`, `KMS_PROVIDER=<aws|gcp|vault>`, `KMS_KEY_ID=<key-id>`.
   - Integrate a signer service that returns Solana transaction signatures (or use a gateway that supports Solana signing via KMS).

2. Program controlled escrow
   - Move from payer-controlled transfers to a program-based escrow (multisig/timelock or on-chain escrow program) so releases require on-chain policy enforcement.

3. Persistent, durable DB + job queue
   - Replace the current file DB with Postgres (or managed DB) and a job queue (BullMQ/Redis or pg-based jobs) for reliable retries and observability.
   - Ensure DB encryption at rest and periodic backups.

4. Signed webhooks & provider verification
   - Require webhooks (tracking updates) to be HMAC-signed or use provider-signed JWTs. Validate signatures before changing offer state.
   - Set `TRACKING_HMAC_SECRET` and require `X-Tracking-Signature` (HMAC-SHA256 hex of request body) for provider webhooks. Use `crypto.timingSafeEqual` on the server side to avoid timing attacks. Example (provider):

```js
const secret = process.env.TRACKING_HMAC_SECRET;
const payload = JSON.stringify(body);
const sig = require('crypto').createHmac('sha256', secret).update(payload).digest('hex');
// send header 'X-Tracking-Signature: ' + sig
```

5. Secrets & key rotation
   - Store secrets in Vault or cloud secret manager. Rotate `ACCESS_JWT_SECRET` regularly.

6. Network, TLS and mTLS
   - Serve all endpoints over TLS. Enable mTLS between internal services where possible.
   - Use a private network or VPN for internal traffic.

7. Observability & alerting
   - Export metrics (status of offers, release failures, retry counts).
   - Add Prometheus alerts for repeated failures, stuck offers, or healthcheck failures.

8. Audit & testing
   - Static analysis, SCA, and dependency pinning.
   - Integration test suite including KMS signing simulator and a dev multisig program.
   - External security audit before mainnet usage.

## Recommended (post-blockers)

- Hardware-backed signers for operator approvals (YubiKey/HSM).
- WAF, rate-limiting, and DDoS protections on public endpoints.
- Tor onion service for high-risk clients.
- Signed, append-only audit logs exposed for users to verify.

## Quick start (dev environment)

1. Run the Vault simulator for dev (listens on 8200 by default):

```bash
npm run start-vault-sim
```

1.5 Start Postgres (local dev) and Caddy for TLS (optional):

```bash
docker compose -f docker-compose.postgres.yml up -d
```

This will start Postgres and a local Vault-sim (via node) and a Caddy placeholder. For full containerized deploy, extend `docker-compose.postgres.yml` with services for `openclaw-agent`, `access-server`, and `watchtower` (Dockerfiles are included in repository).
2. Configure env for dev KMS signer:

```bash
# example (POSIX)
export SIGNER_MODE=vault
export VAULT_URL=http://localhost:8200
export VAULT_KEY_ID=dev-key
export OPENCLAW_EXECUTE=false
```

3. Start services (detached):

```bash
npm run start-openclaw-agent:detached && npm run start-access-server:detached
```

4. Start Postgres & Caddy (optional local infra):

```bash
docker compose -f docker-compose.postgres.yml up -d
```

5. Test signer locally (ensure vault-sim is running):

```bash
npm run test-signer
```

6. Run Postgres smoke test and migrate offers (one-time):

```bash
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/openclaw
node ./scripts/smoke-postgres.js
npm run migrate-offers
```

7. Deploy to VPS (example script)

```bash
# edit .env or export required env vars: DATABASE_URL, VAULT_URL, VAULT_KEY_ID, ACCESS_JWT_SECRET, DOMAIN
./scripts/deploy-prod.sh
```
5. Run demo flows (still in simulation mode):

```bash
npm run demo-escrow
```

Notes:
- The vault simulator is for local development only. In production, set `SIGNER_MODE=kms` and configure `KMS_PROVIDER`/`KMS_KEY_ID` for your KMS of choice (HashiCorp Vault Transit, AWS KMS, etc.).

---

Follow the checklist above to get to production readiness. If you want, I can implement the KMS signer abstraction for the agent and a Vault simulator for local dev next.