# OPSEC sanity check (Twitter + wallets + token gating)

> NOTE: repository scrub completed — previously committed secrets have been removed from the public history. Rotate any exposed keys immediately (Moltbook, Telegram bot, gateway token, Venice, etc.).

You’re right to worry: **“post on Twitter to get a bonus” and “strong OPSEC” are in tension**.
Twitter is an identity magnet (phone/email, device fingerprinting, social graph) and many people will use accounts tied to their real name.

This doc is about reducing harm and avoiding accidental doxxing. It is not a guarantee of anonymity.

## Key reality: Solana is public
Even if users never post a wallet address, **on-chain transfers are visible**.
- If you airdrop/transfer from your treasury to a claimant, anyone can see that wallet received CLAW.
- If that same wallet later interacts with exchanges or KYC services, it can be linked.

Best practice: encourage users to use a **dedicated wallet** for CLAW and chat access.

## Biggest fix: never require posting a wallet address
We updated the claim design so public posts use a **claim code** instead of the wallet.
- Moltbook proof uses `#clawmint + claimCode`.
- The wallet proves ownership privately via a signed challenge.

This prevents the “Twitter/Moltbook post directly links to my wallet” failure mode.

## Twitter bonus: how to do it without doxxing
If you add a Twitter/X repost bonus:

1) Make it **optional**
- Treat it as marketing, not a core requirement.

2) Use a **claim code**, not wallet
- Tweet content should contain: `#clawmint` + the claim code.
- Do not ask for: wallet address, real name, location, employer, etc.

3) Avoid collecting extra identifiers
- Don’t require users to submit their Twitter handle.
- If you must verify the tweet, you can ask for the tweet URL and only store a hash.

4) Don’t log more than needed
- Minimize server logs.
- Don’t keep IP addresses longer than necessary.

## Token-gated E2EE chat: OPSEC notes
Wallet-based access adds linkage risk.

Recommendations:
- Use a **separate wallet** for chat than for anything tied to their identity.
- Prefer accessing the site/chat via **Tor Browser** (especially if you host an onion).
- Don’t mix: Twitter browsing + wallet approvals + chat on the same browser profile.

## Escrow and privacy

If you use the built-in escrow service (on-chain or off-chain UI), consider:
- Escrow transactions are on-chain by default: they create persistent, linkable records.
- Avoid requiring personal identity to use escrow; offer pseudonymous, wallet-based flows where practical.
- Use cryptographic commitments and transaction references in UI and logs, not PII.
- If off-chain dispute resolution is offered, minimize retention of user-identifying data and clearly document policies.

Security-first principle: treat escrow as a high-risk feature. Design flows so the platform is not a single point of custody or data leakage.

## Telegram login option (tradeoffs)
This repo supports a Telegram bot that issues a short-lived login code you can use on the site.

Pros:
- You don’t need to reveal a wallet address publicly.
- You can log in without connecting a wallet.

Cons:
- Telegram accounts can be linked to a phone number.
- Telegram has its own metadata exposure and threat model.

If you’re high-risk, treat Telegram as a convenience layer, not a guarantee of anonymity.

## Tor / censorship-resistance
Tor helps conceal the server IP and can help users in censored regions reach you.
- See TOR.md for onion deployment.
- Consider making the chat relay onion-only for the highest-risk users.

## Additional OPSEC controls for production
- **Minimal logging**: redact or avoid storing IP addresses, user-agent, or other PII in logs; use aggregated telemetry only.
- **Onion + TLS**: publish an onion endpoint for high-risk users and use TLS for normal clients.
- **Ephemeral wallets**: encourage ephemeral/dedicated wallets for escrow use to reduce linkage.
- **KMS signer**: keep signer key material off disk — use KMS / Vault HSM; do not enable `OPENCLAW_EXECUTE=true` without KMS configured.
- **Access tiering**: rotate `ACCESS_JWT_SECRET` frequently and enforce short-lived tokens for automation; add RBAC to agent endpoints so only authorized operators can trigger releases.
- **Runbook**: maintain an incident response playbook (revoke keys, freeze agent, notify users).
## Honest messaging you should put on the site
- “E2EE protects message contents, not necessarily metadata.”
- “Using Twitter reduces anonymity.”
- “Use a dedicated wallet if you need separation.”

## Bottom line
If OPSEC is a real priority:
- Don’t require Twitter at all (or keep it strictly optional).
- Never require posting wallets publicly.
- Offer Tor/onion access.
- Keep verification minimal, ephemeral, and privacy-preserving.
