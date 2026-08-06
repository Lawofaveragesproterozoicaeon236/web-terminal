# web-terminal

A mobile-first, self-hosted web terminal powered by [Ghostty](https://ghostty.org)'s VT engine compiled to WebAssembly — with sessions that survive network drops, a built-in file explorer, and [herdr](https://herdr.dev) integration.

<p>
  <a href="https://github.com/code-yeongyu/web-terminal/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/code-yeongyu/web-terminal/actions/workflows/ci.yml/badge.svg" /></a>
  <img alt="Bun" src="https://img.shields.io/badge/Bun-%E2%89%A51.4-black" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue" />
</p>

## Why

Most web terminals die with the WebSocket. This one is built around the part of [mosh](https://mosh.org) that actually matters over TCP: **the server owns the terminal, not the connection.**

- **Full-spec rendering** — the client renders through `ghostty-web`, Ghostty's real VT parser compiled to a ~400 KB WASM module: truecolor, complex grapheme clusters, CJK widths, emoji, alt-screen TUIs.
- **Disconnect-surviving sessions** — PTYs live in the server. Lose the network, close the tab, switch from Wi-Fi to LTE: reconnect and the session is exactly where you left it, repainted from a bounded replay buffer with cumulative byte offsets.
- **Low-bandwidth friendly** — binary WebSocket frames, 8 ms output batching, permessage-deflate, exponential-backoff reconnect with jitter, 15 s heartbeat with live latency readout.
- **Mobile-first UX** — a touch key toolbar (Esc / Tab / sticky Ctrl / arrows / ^C / paste), safe-area insets, 44 px touch targets, drawer-mode sidebar, clean at 375 px, Korean IME composition support.
- **Files sidebar** — browse, upload, download, edit, and delete files under a jailed root directory.
- **herdr integration** — the server keeps a local [herdr](https://github.com/herdrdev/herdr) server alive (auto-start on boot and on demand) and the sidebar shows its live workspaces and agent statuses over herdr's NDJSON socket API.

## Quick start

Requires [Bun](https://bun.com) ≥ 1.4 (canary).

```bash
bun install
WT_PASSWORD='choose-a-long-password' bun run start
# open http://127.0.0.1:7777
```

### Configuration

| Env | Default | Meaning |
|---|---|---|
| `WT_PORT` | `7777` | Listen port |
| `WT_HOST` | `127.0.0.1` | Bind address (`0.0.0.0` to expose on a LAN/tailnet) |
| `WT_PASSWORD` | — | Login password (≥ 8 chars; hashed with argon2id at boot) |
| `WT_PASSWORD_HASH` | — | Pre-computed argon2id hash (overrides `WT_PASSWORD`) |
| `WT_FILES_ROOT` | `$HOME` | File explorer jail root |
| `WT_HERDR_SOCKET` | `~/.config/herdr/herdr.sock` | herdr socket path |
| `WT_ALLOWED_ORIGINS` | *(same-origin)* | Extra allowed origins for WebSocket upgrades |
| `WT_TRUSTED_BIND` | *(unset)* | Extra listener address that skips the password (e.g. a Tailscale IP). Unset = single password-protected listener |
| `WT_TRUSTED_PORT` | `WT_PORT` | Port for the trusted listener |
| `WT_SHELL` | *(auto)* | Shell for new sessions (defaults to your `$SHELL`, or zsh/bash/sh; never fish, which stalls on VT capability queries) |
| `WT_DEV` | `0` | `1` enables Bun's dev-mode host guard (local development only) |

## Deploying with cloudflared

Deployment is intentionally **not** part of CI — it runs wherever the machine you are exposing lives:

```bash
WT_PASSWORD='choose-a-long-password' ./scripts/deploy.sh
# prints a https://<random>.trycloudflare.com URL
./scripts/stop.sh   # tear down server + tunnel
```

For a tailnet instead, bind to your tailscale interface: `WT_HOST=0.0.0.0 bun run start` and open `http://<machine>.<tailnet>.ts.net:7777`.

## Security model

- **Password auth** — argon2id (64 MiB, t=3) via `Bun.password`; constant-time verification.
- **Sessions** — 256-bit random tokens in `HttpOnly` + `SameSite=Lax` cookies (+ `Secure` behind HTTPS), 7-day TTL.
- **Rate limiting** — 5 failed logins per 5 minutes per IP (honors `CF-Connecting-IP` behind Cloudflare), then `429` + `Retry-After`.
- **WebSocket** — upgrades require a valid session cookie and a same-origin `Origin` header.
- **File jail** — every path is resolved inside `WT_FILES_ROOT`; `..` traversal, absolute paths, and symlink escapes are rejected with real-path checks.

### Two surfaces: public password, tailnet passwordless

`WT_TRUSTED_BIND` starts a **second listener** on an address only your private
network can reach (a Tailscale interface IP). Requests accepted on that socket are
pre-authenticated; requests on the public listener always need the password:

```bash
WT_PASSWORD='...' WT_PORT=7820 WT_HOST=127.0.0.1 \
  WT_TRUSTED_BIND=100.x.y.z WT_TRUSTED_PORT=7820 bun run start
```

The bypass is a property of **which socket accepted the connection**, never of a
request header. `CF-Connecting-IP`, `X-Forwarded-For` and friends are settable by
anyone once traffic arrives through a public tunnel, so they are ignored for trust
decisions — reaching the tailnet socket is itself the proof of membership, and that
socket is unroutable from the internet. The bypass is off unless `WT_TRUSTED_BIND`
is set, so a misconfigured deploy fails closed to password auth.

Point cloudflared at the **loopback** listener only, never at the trusted one.

One password guards a real shell on your machine: run it behind cloudflared/Tailscale, use a long password, and never expose it as plain HTTP on an untrusted network.

## Architecture

```
┌────────────── browser ──────────────┐    ┌──────────────── bun server ───────────────┐
│ ghostty-web (WASM VT)   sidebar UI  │    │ Bun.serve — static + REST + WebSocket      │
│      ▲ write()  ▲ fetch /api/*      │    │   ├─ auth (argon2id, sessions, rate limit) │
│      │          │                   │    │   ├─ files (jailed root)                   │
│ TerminalConnection ◄────────────────┼────┼──►├─ ws-handler ── SessionStore            │
│  offsets · backoff · heartbeat      │ WS │   │               ├─ Bun.Terminal (PTY)    │
│                                     │    │   │               └─ ReplayBuffer (4 MiB)  │
│                                     │    │   └─ herdr bridge ── ~/.config/herdr/*.sock│
└─────────────────────────────────────┘    └────────────────────────────────────────────┘
```

**Reconnect protocol** — every output byte has a cumulative offset. The client says `hello {sessionId, lastOffset}`; if the offset is still inside the server's replay buffer it receives exactly the missed bytes, otherwise it gets a `reset` plus the buffer tail. Input, resize, ping/pong and repaints all flow over one WebSocket with 1-byte-opcode binary frames.

## Development

```bash
bun run dev         # hot-reloading server
bun test            # unit + integration tests
bun run typecheck   # tsgo --noEmit (TypeScript 7 native preview)
bun run lint        # biome
node script/qa/e2e-scenarios.mjs   # real-browser QA (playwright)
./script/qa/api-scenarios.sh       # curl-level auth/files/herdr QA
```

The design system lives in [`DESIGN.md`](./DESIGN.md) — every color, spacing, and motion value in the UI traces back to a token there.

## License

[MIT](./LICENSE)
