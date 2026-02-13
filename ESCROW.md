# Escrow design (privacy-first, on-chain-first)

This doc describes recommended patterns to implement a reliable, low-cost, privacy-respecting escrow service for CLAW. It does not promise "perfect" guarantees — on-chain flows and operational security matter. Use these designs to reduce custodial risk and maximise privacy.

## Goals
- Privacy-first: minimize collection and storage of personally-identifying information. Prefer pseudonymous, wallet-based flows.
- Low-cost: use SPL token flows, batching, and minimal on-chain interactions.
- Reliable: prefer multisig/time-locked patterns and automated monitoring (watchtowers) to avoid human custody errors.

## Principles
- Do not accept fiat custody on-platform. Use on-chain token escrow or trusted third-party custody only when unavoidable.
- Design UI so escrow operations are explicit, auditable, and reversible when allowed by the on-chain logic.
- Provide clear OPSEC guidance to users: dedicated wallets, Tor access, and how to avoid linking identities.

## Recommended building blocks

- Multisig escrow: use a multisig (2-of-3 or 3-of-5) where participants are buyer/seller/arbitrator (or automated arbots). Multisig reduces single-point custody.

- Time-locked vaults: for simple one-party release, use a timelock pattern (on-chain program or scheduled oracle) so funds automatically return after expiry.

- Watchtower / relayer: an automated service that monitors escrow transactions and notifies participants (also can auto-submit release transactions if conditions met). Run watchtowers on private infrastructure and over Tor for privacy.

- Commitment flow (off-chain + on-chain): create a secure off-chain contract record (hash commitment) and settle on-chain only when both sides are ready. This reduces unnecessary on-chain fees.

## Privacy controls
- Use ephemeral wallets for offers; require no PII to create an escrow offer.
- Keep server logs minimal: store only cryptographic commitments and transaction IDs. Rotate logs and purge retention aggressively.
- Offer an onion/Tor UI for high-risk users.

## Operational reliability
- Add automated healthchecks for relayers and watchtowers with alerting (email/pagerduty) for failures.
- Provide a signed, immutable audit trail: every escrow action is hash-committed on-chain or in an append-only log users can verify.
- Offer optional multisig arbitration; do not centralize dispute resolution unless users opt-in.

## Example flow (buyer/seller multisig)
1. Buyer and seller agree terms off-chain and create an escrow offer (hash committed to server). No PII required.
2. Buyer funds the multisig-controlled escrow ATA (SPL token). Transaction ID is stored as the commitment.
3. Watchtower monitors the multisig: when seller fulfills, both parties sign release; watchtower broadcasts and records release tx.
4. If dispute/time expiry happens, pre-agreed arbitration keys or timelock release apply.

## Tradeoffs and limitations
- On-chain escrow leaves public records (addresses, amounts). Privacy mitigations (dedicated wallets, mixers) have tradeoffs and regulatory implications.
- True censorship-resistant, programmable timelocks require on-chain programs (smart contracts). JS-only scripts can't enforce timelocks without program support.

## Next steps (implementation options)
- Add a lightweight multisig example using `@solana/spl-token` and a recommended multisig program.
- Scaffold a watchtower service (relayer) with healthchecks and optional onion endpoint.
- Provide user-facing UI for creating offers and inspecting tx commitments.

If you'd like, I can scaffold the multisig example and a watchtower service next.

## Shipping & Tracking flow 🚚

This project supports shipping-based escrows for physical goods. Key behaviors:

- Create an escrow with `itemType: 'shipped'` (buyer creates and funds as usual).
- Seller calls POST `/offers/:id/ship` with `{ carrier, trackingNumber }` to mark the offer as shipped. This sets an auto-release expiry (default 7 days, override with `SHIP_AUTO_RELEASE_MS`).
- Tracking updates may be posted to POST `/offers/:id/tracking` (e.g., `{ status: 'delivered', deliveredAt }`) by sellers or tracking providers (webhook). When `status === 'delivered'`, the agent marks the offer fulfilled and will release funds. For production, set `TRACKING_HMAC_SECRET` and require `X-Tracking-Signature` which should be the HMAC-SHA256 hex of the request body; the agent verifies signatures to prevent spoofed delivery updates.
- Buyer can confirm receipt with POST `/offers/:id/confirm` or raise a dispute with POST `/offers/:id/dispute`. If a dispute is raised, the agent will not auto-release on expiry and will wait for manual resolution.

Notes:
- For production, use a verified tracking provider webhook with signature verification (the demo accepts tracking updates authenticated by the same JWT as the seller — adapt with provider verification for production).
- The agent auto-releases once delivery is confirmed or if the auto-release window passes without a dispute. Refunds occur if an offer is expired and disputed (or as otherwise configured).

These endpoints and behaviors are implemented in the agent and exercised in the demo script `scripts/demo-escrow-demo.js` (includes a shipped item test and a dispute example).
