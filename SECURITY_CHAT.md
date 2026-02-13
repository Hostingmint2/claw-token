# ClawChat Security Notes (MVP)

This is an E2EE chat MVP designed as a **ciphertext-only relay**.

## Threat model

### Protects against
- Relay operator reading message content (messages are encrypted client-side).
- Passive observers on the network if you use `wss://` or Tor Browser.

### Does NOT fully protect against
- Metadata leakage (who talks to whom, timestamps, message sizes).
- Malicious clients impersonating others *if users don’t verify keys*.
- Compromised endpoints (malware in the browser/OS).

## What we implemented
- Token-gated authentication via wallet signature + on-chain balance check.
- Short-lived scoped `chat` token minted by the access server.
- WebSocket relay requires `auth` as first message; no token in the URL.
- Basic rate limits and payload size limits in the relay.
- NaCl box encryption in-browser; relay never sees plaintext.
- Message padding to reduce size fingerprinting (coarse).
- Key pinning (TOFU) with warnings on key changes.
- Peer verification UI: fingerprints + safety codes.
- Relay enforces sender public key from authenticated `hello` (prevents spoofed `fromPubKey`).

## What you should add next (for “bells and whistles”)

### 1) Key verification (safety numbers)
- Implemented in the UI: fingerprints + safety codes, plus “Mark verified”.
- Still requires users to verify out-of-band for real security.

### 2) Forward secrecy + post-compromise security
- Implement a Double Ratchet protocol (Signal-style).
- This is the main missing piece for a serious secure messenger.

### 3) Key transparency / pinning
- Store and warn on key changes per wallet.
- Optional transparency log for published identity keys.

### 4) Metadata resistance
- Mixnets / delay queues / batching.
- Optional message routing via Tor onion-only.

### 5) Supply-chain hardening
- Do not load crypto libraries from public CDNs.
- Bundle and serve pinned, audited versions.
- Add Subresource Integrity (SRI) if you must use CDNs.

This repo now prefers **local vendored crypto** in `site/vendor/`.
Run `npm install` then `npm run vendor-crypto` to populate the files.

## Important note
This MVP is useful for private chat, but it is not yet comparable to Signal.
The fastest path to “serious” is adding Double Ratchet and key verification UI.

If your use-case is truly life-or-death, do not rely on an unaudited web MVP.
Use mature, audited secure messengers and treat this as an experimental prototype.
