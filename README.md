# Claw — underground private messaging & escrow (product overview)

Claw is a privacy‑first messaging and escrow platform built for low‑visibility communities. It combines token‑gated access, Signal‑grade end‑to‑end encryption primitives, and a watchtower‑style escrow/watchdog to automate dispute‑resistant settlements while minimizing metadata and on‑server exposure.

## Core proposition
- Private by default: anonymous Telegram identities, privacy mode that suppresses PII in logs, and minimal telemetry.
- Secure custody: signing via KMS/HSM (no private keys on disk) and explicit simulation mode for any fund movement.
- Automated escrow: configurable watchtower agent for shipping/tracking/dispute flows and queued, auditable release/refund jobs.
- Token‑gated utility: access and marketplace features gated by token ownership without publicly exposing wallets.

## Security highlights (production defaults)
- KMS-only signing required for money movement in production (Signer abstraction supports Vault/AWS/GCP).
- Mandatory TLS in production (or explicit TLS‑offload acknowledgement) — deployments will fail otherwise.
- Privacy mode enabled by default; strict security headers and rate limiting applied to public endpoints.
- HMAC‑signed webhooks for trusted tracking updates; Postgres + pg‑boss for durable, auditable job processing.

## How Claw compares (concise)</p>

| Feature / property | Claw (this project) | Signal (messaging) | Traditional Escrow Providers | Decentralized Marketplaces |
|---|---:|:---:|:---:|:---:|
| End‑to‑end encrypted messaging | Yes (Signal‑style ratchet) | Yes | No | Varies |
| Anonymous / pseudonymous login | Telegram anonymous IDs + wallet‑link | Phone‑based (less anonymous) | Account/KYC required | Often pseudonymous |
| Programmable escrow + automation | Yes (watchtower agents + auto‑release) | No | Yes (custodial) | Limited / on‑chain only |
| Non‑custodial signing (KMS/HSM) | Yes (required for production execute) | N/A | Custodial or escrowed | Varies |
| Token‑gated access / marketplace | Native SPL token gating | No | No | Sometimes |
| Metadata minimization & OPSEC defaults | Built‑in (privacy mode, minimal logging) | Strong | Weak | Varies |
| Deployability for private hosts | Docker + Vault + Postgres — hardened defaults | Closed source (service) | SaaS | Self‑hosted options |

Why choose Claw: it combines Signal‑grade privacy with programmable, auditable escrow automation — a unique fit when you need private, automated settlements tied to token ownership without exposing wallets or relying on custodial third parties.

---

## Contact / access
This repository contains the core implementation; distribution or deployment can be provided under controlled access for security‑sensitive deployments. For access, audits, or enterprise evaluation contact the project owner.

## Publish & host (quick private repo + public PWA)
- To keep the **source private** but make the **PWA public**, create a private GitHub repo and push this code; the included GitHub Actions workflow will publish `site/` to GitHub Pages.
- Quick steps (one‑time, on your machine):
  1. Ensure `gh` CLI is installed and authenticated: `gh auth login`.
  2. Run: `./scripts/create-github-repo.sh <youruser>/<your-repo>` (or use the PowerShell script on Windows).
  3. After push, the workflow `pages-deploy.yml` will publish `site/` to Pages; the public URL will be `https://<youruser>.github.io/<your-repo>/`.

Notes:
- Repository remains private; the Pages output will be public (GitHub Pages is public by design). If you want a private public‑facing domain, deploy the `site/` folder to a private host and point DNS.
- I added an `/app` mount to the always‑on `access-server` so the PWA can also be served from your backend at `https://<your-host>/app/` once you deploy the server.


