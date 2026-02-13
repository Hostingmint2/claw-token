# Claw Token — Launch campaign

Goal
- Drive downloads and Telegram sign-ups; seed initial mint claims via Moltbook.

Audience
- Crypto builders, privacy-minded users, agent developers, escrow/marketplace early adopters.

Channels & cadence
1. Telegram (Moltbot & Claw bot): announcement + pinned post (Day 0)
2. Mastodon / X: short thread + demo GIF (Day 0)
3. Reddit (r/solana, r/cryptodevs): feature post + AMA (Day 1)
4. GitHub Release (site ZIP + SHA256) — immediate
5. Newsletter / Product Hunt (optional) — Day 2

Assets included
- Short post copy (social-copy.md)
- Downloadable PWA ZIP (already in `site/releases/`)
- SHA256 checksum for sideload verification

KPIs
- Downloads (site/releases ZIP), Telegram codes issued, Moltbook #clawmint posts, demo escrow completions.

Execution notes
- Do NOT post wallets or private key material publicly.
- Use the Moltbot announce script (`scripts/moltbot-announce.js`) to post via your local Moltbot gateway or Telegram bot (requires valid tokens configured in the environment).

Schedule (suggested)
- Day 0: soft-launch (Telegram, GitHub Release, Mastodon/X)
- Day 1: Reddit post + pinned Telegram thread
- Day 2: follow-up with demo walkthrough video and FAQ

For approval: do you want me to schedule/publish the Telegram + Moltbot post now (requires running Moltbot/gateway and TELEGRAM_BOT_TOKEN)?