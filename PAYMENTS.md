# Payments / Buying CLAW (security-first)

## Goal
Let users acquire CLAW without you handling credit cards, gift cards, or custody.

## Recommended design (most secure + least liability)
1) Use a **regulated fiat on-ramp** (cards/Apple Pay/etc.) to buy SOL/USDC.
2) Users self-custody in their wallet.
3) Users swap SOL/USDC → CLAW using a DEX aggregator.

Why:
- You avoid PCI scope entirely.
- You avoid storing payment data.
- You reduce fraud exposure.
- You don’t become a money transmitter.

## Why not gift cards (if you care about OPSEC + abuse)
Gift cards are one of the highest-fraud rails in crypto.
- Stolen cards, chargebacks, coercion, and laundering are common.
- “No verification” + “gift cards” is a magnet for abuse.

Trying to offer a fixed rate like “$0.80 on the dollar” without strict controls is especially risky.
In practice, legitimate providers will adjust rates dynamically based on card type, region, fraud risk,
and will often require identity verification.

If someone claims “gift cards without privacy impact”, treat that as a red flag. Real providers will
do fraud screening, and many require KYC/AML.

If you still insist:
- Use a third-party vendor that is licensed in the jurisdictions you serve.
- Expect KYC/AML and robust fraud controls.
- Keep it off your infrastructure (link-out).

## Site implementation here
  - `window.CLAW_ONRAMP_URL`
  - `window.CLAW_ONRAMP_URL_ALT`
  - `window.CLAW_SWAP_URL`
  - `window.CLAW_GIFTCARD_URL`

## Escrow (general-purpose)

CLAW recommends an on-chain-first escrow architecture for most flows: multisig and timelock patterns reduce custodial risk and can be run cheaply using SPL tokens. The goal is to offer a practical, privacy-preserving escrow alternative — not to make absolute guarantees or replace audited custodial services where those are required.

Security guidance for escrow:
- Prefer multisig or programmatic timelocks to avoid single-point custody.
- Use SPL-native flows and batching to reduce fees.
- Minimize data retention: store only cryptographic commitments and transaction IDs; avoid storing PII.

Operational guidance:
- Run watchtowers or relayers to monitor escrow state and auto-submit releases when conditions are met.
- Provide transparent dispute paths: multisig arbitration keys, or time-lock fallback releases.
- Offer an onion/Tor endpoint for users who need extra privacy.

If you want a developer-first example, see `ESCROW.md` for recommended patterns and an example flow. I can scaffold a multisig example and a watchtower relayer next if you want to implement the service backend.

## OPSEC warnings you should display
- Card purchases reduce anonymity.
- On-ramps may require KYC.
- On-chain activity is public.
- Recommend a dedicated wallet for high-risk users.

## Minimum security checklist
- Serve over HTTPS.
- No analytics by default.
- Strong CSP, no inline scripts where possible.
- Do not log query strings containing identifiers.
- If offering Tor/onion site, avoid loading external resources.
