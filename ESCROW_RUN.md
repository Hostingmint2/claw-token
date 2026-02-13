# Running the Escrow stack (dev/demo)

This document shows a simple way to run the required components locally for demos.

Requirements
- Node.js installed (16+ recommended)
- Docker (optional, for containerized run)

Environment variables (example):

- ACCESS_JWT_SECRET=VERY_SECRET_STRING
- OPENCLAW_EXECUTE=false   # simulation mode
- OPENCLAW_OFFERS_PATH=agents/openclaw-agent/offers.json
- OPENCLAW_PORT=9800
- RPC_URL=https://api.devnet.solana.com (if OPENCLAW_EXECUTE=true)

Run servers concurrently (recommended for demo):

Using npm scripts (requires `concurrently`):

```bash
# from repo root
npm run start-all
```

This will run the `access-server`, `openclaw-agent`, and `watchtower` concurrently and stop all on first failure.

If you'd rather start servers and return immediately (so your CLI isn't blocked), use the detached starters which spawn processes and exit:

```bash
npm run start-access-server:detached
npm run start-openclaw-agent:detached
npm run start-watchtower:detached
```

You can start them all and return instantly with:

```bash
npm run start-all:detached
```

If you want a short startup check that surfaces immediate crashes (recommended), use the `-checked` variants which wait 2s and fail if the process exits quickly:

```bash
npm run start-access-server:detached-demo
npm run start-openclaw-agent:detached-checked
npm run start-watchtower:detached-checked
```
To stop a detached process, either call:

```bash
npm run stop-detached <pid|name>
```

Or find it in `tmp/pids/*.json` and kill the PID directly. Detached starters write a small JSON meta file with PID and command in `tmp/pids/`.

Manual (Windows PowerShell):

```powershell
# open three terminals
$env:ACCESS_JWT_SECRET='demo-secret'
# Terminal 1: access server
node server/access-server.js
# Terminal 2: agent (simulation)
$env:OPENCLAW_EXECUTE='false'; $env:ACCESS_JWT_SECRET='demo-secret'; node agents/openclaw-agent/agent.js
# Terminal 3: watchtower
node agents/watchtower/watchtower.js
```

Notes
- For production, set `OPENCLAW_EXECUTE=true`, provide `RPC_URL` and `KEYPAIR_PATH`, replace file DB with Postgres/Redis, and use secure signer (HSM/KMS).
- Store `ACCESS_JWT_SECRET` securely and rotate periodically.
