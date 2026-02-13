# Claw Token Utility (MVP that has value today)

This document defines **real, usable utility** for a fungible SPL token that is immediately deliverable without NFTs.

The guiding principle: **the token is not “valuable because price”**; it’s valuable because it is the **only key** to access specific agent capabilities, hosted services, and verified participation.

## Utility #1: Claw Access Pass (token-gated agent features)

### What users get
Holding or staking CLAW unlocks access to:
- **Premium agent workflows** (prebuilt toolchains / “one-click automations”).
- **Higher limits** (more runs/day, larger context windows, longer sandbox sessions).
- **Priority queue** on your hosted gateway (faster response time).
- **Private channels / groups** for CLAW holders.

### Why it has value today
You can ship this today with an off-chain service that checks a wallet’s token balance and issues a short-lived access token (JWT) for your web app / gateway.

### Implementation (MVP)
- Users connect a Solana wallet and **sign a login message**.
- Server verifies signature and fetches **token balance** for the wallet.
- If balance >= tier threshold, server returns a time-limited session token.

### Tiers (example)
- **Bronze**: hold 100 CLAW → access to basic premium workflows
- **Silver**: hold 1,000 CLAW → higher limits + private channels
- **Gold**: hold 10,000 CLAW → priority queue + early feature access

## Utility #2: Agent Job Board + Escrow (token has “spend” demand)

### What users get
A simple marketplace where humans post tasks, and agents/humans claim them.
- Humans **pay in CLAW** to create bounties.
- A job is completed when the buyer approves deliverables.
- Optional dispute path: time lock + moderator vote.

### Why it has value today
This creates real usage:
- buyers must acquire CLAW to post bounties
- agents earn CLAW for useful work

### Implementation (MVP)
Off-chain escrow with:
- wallet signature authentication
- database tracking
- optional on-chain transfers (direct SPL transfer to escrow wallet)

Take a small platform fee (e.g., 2–5%) in CLAW.

## Utility #3: Credits for hosted tools (pay-per-use)

### What users get
Users redeem CLAW to obtain:
- **Compute credits** (hosted agents, hosted browsing sandbox)
- **Tool credits** (premium integrations)

### Why it has value today
You can make a simple “credits” system immediately. Token redemption is a straightforward on-chain transfer to treasury + off-chain credit ledger.

### Implementation (MVP)
- User signs in
- user sends CLAW to treasury address (site provides QR/link)
- server detects transfer and increments credits

## Utility #4: Verified reputation staking (anti-spam)

### What users get
Agents/humans can “stake” CLAW to:
- create verified posts
- open proposal threads
- get higher visibility

### Why it has value today
Staking reduces spam and creates persistent demand. A small amount can be slashed for abuse.

### Implementation (MVP)
Off-chain stake registry + periodic proof of stake (balance or locked account). Upgrade later to on-chain locking.

## Utility #5: Security / audit rewards

Pay CLAW for:
- bug bounty findings
- plugin audits
- prompt injection hardening reports

This turns the token into a **coordination tool** that improves the ecosystem.

## Token economics (keep it honest)

- Avoid vague “utility later” claims.
- Publish clear rules for:
  - how access tiers work
  - what fees are charged
  - what treasury funds are used for

## Immediate next build (recommended)

1) **Token-gated login** (signature + balance check)
2) **Premium workflow library** (gated download / gated endpoint)
3) **Credit redemption** (transfer to treasury → credits)
4) **Job board v0** (bounties and payouts)
