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
- Short post copy (`social-copy.md`)
- Moltbot announce script (`scripts/moltbot-announce.js`)
- Moltbot marketing + scheduler (`scripts/moltbot-marketing.js`)
- GitHub Actions scheduled workflow (`.github/workflows/moltbot-marketing.yml`)
- Downloadable PWA ZIP (already in `site/releases/`)
- SHA256 checksum for sideload verification

Scheduling & automation
- The workflow `.github/workflows/moltbot-marketing.yml` runs daily (12:00 UTC) and performs a dry-run by default. Provide `GATEWAY_TOKEN`/`GATEWAY_URL` or `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` as repository secrets to allow live posting.
- For local cron: add a crontab entry to run `node scripts/moltbot-marketing.js --post` (or use Windows Task Scheduler on Windows).

Usage (local / manual)
1. Dry-run: `node scripts/moltbot-marketing.js --dry`
2. Live post via Moltbot gateway: set `GATEWAY_URL` + `GATEWAY_TOKEN`, then run `node scripts/moltbot-marketing.js --post`
3. Direct Telegram post (fallback): set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`, then run with `--channel telegram --post`

Hashtags & submolts
- The script rotates a prioritized hashtag list by day; you can pass `--hashtags=#tag1,#tag2` or `--submolts=subA,subB` to target sub-communities explicitly.

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