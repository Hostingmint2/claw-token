# OpenClaw agent

This agent monitors `offers.json` and can release or refund escrowed SPL tokens based on offer state. It is intentionally conservative by default: execution is disabled unless you set `OPENCLAW_EXECUTE=true` and provide `RPC_URL` and a `KEYPAIR_PATH` environment variable pointing to a Solana keypair JSON.

Usage

1. Edit `agents/openclaw-agent/offers.json` to add offers (see example).
2. Run:

```bash
OPENCLAW_OFFERS_PATH=agents/openclaw-agent/offers.json \
RPC_URL=https://api.devnet.solana.com \
KEYPAIR_PATH=path/to/keypair.json \
OPENCLAW_EXECUTE=false \
node agents/openclaw-agent/agent.js
```

Notes

- `OPENCLAW_EXECUTE=false` (default) runs in simulation mode and will not submit transactions.
- The agent is a scaffold for a watchtower/escrow executor. For production, add robust locking, signed offers, and program-controlled escrow accounts.
