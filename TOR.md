# Tor / Onion deployment for ClawChat (relay + site)

This is a practical way to make ClawChat reachable from censored networks using Tor.

## What Tor gives you (and what it doesn’t)
- Tor **hides the server’s IP** and can help bypass censorship.
- Your chat is still **end-to-end encrypted** (ciphertext-only relay).
- Tor does **not** magically remove all metadata; the relay still sees who connects and message timing.

## Recommended client
- Use **Tor Browser** to load the `.onion` website.
- WebSockets over `.onion` work in Tor Browser for most setups.

## Option A: Run relay as an onion service (best)

### 1) Install Tor on the server
On Linux: install the `tor` package.

### 2) Configure `torrc`
Add something like:

```
HiddenServiceDir /var/lib/tor/clawchat/
HiddenServicePort 80 127.0.0.1:8080
HiddenServicePort 8791 127.0.0.1:8791
```

- `80` can forward to a local static web server for `site/`.
- `8791` forwards to the chat relay.

Restart Tor.

### 3) Get the onion hostname
Tor will create:
- `/var/lib/tor/clawchat/hostname`

That file contains your `.onion` address.

### 4) Serve the website locally
You can serve `site/` using any static server (Caddy, nginx, or `python -m http.server`).
Example (node):
- Use a simple static server on `127.0.0.1:8080`.

### 5) Point the site to the onion relay
In Tor Browser, set these globals (e.g. in a small inline script tag) or edit `chat.js`:
- `window.CLAW_CHAT_WS = "ws://<your-onion-hostname>:8791"`

Note: with onion services you can use `ws://` because Tor provides transport privacy.

## Option B: Tor as a client proxy only
If you can’t host an onion service, users can still connect through Tor as a client proxy to your public server.
This is less censorship-resistant and leaks your server IP.

## Operational hardening checklist
- Run the relay behind a process manager (systemd) and restart on crash.
- Enable strict OS firewall.
- Put rate limits in front (already included in relay, but a reverse proxy helps).
- Keep `ACCESS_JWT_SECRET` strong and private.
- Prefer short-lived chat tokens (`/auth/chat-token`) and rotate secrets periodically.

## Safety
Make sure your deployment complies with your local laws and hosting provider terms.
