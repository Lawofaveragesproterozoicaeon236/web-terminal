#!/usr/bin/env bash
# Local deployment: run the server + a cloudflared tunnel (NOT part of CI by design).
# Usage: WT_PASSWORD=... ./scripts/deploy.sh [port]
set -euo pipefail
PORT="${1:-7777}"
cd "$(dirname "$0")/.."

if [ -z "${WT_PASSWORD:-}" ] && [ -z "${WT_PASSWORD_HASH:-}" ]; then
  echo "Set WT_PASSWORD (>=8 chars) or WT_PASSWORD_HASH" >&2
  exit 1
fi

mkdir -p .deploy
echo "Starting web-terminal on 127.0.0.1:$PORT"
WT_PORT="$PORT" WT_HOST=127.0.0.1 nohup bun run src/server/index.ts > .deploy/server.log 2>&1 &
echo $! > .deploy/server.pid
sleep 1

echo "Starting cloudflared quick tunnel"
# Isolate from any global ~/.cloudflared/config.yml so this deploy never adopts (or
# disturbs) an unrelated named tunnel's credentials and ingress rules.
mkdir -p .deploy/cloudflared-home
nohup env HOME="$PWD/.deploy/cloudflared-home" TUNNEL_ORIGIN_CERT="$PWD/.deploy/cloudflared-home/none.pem" \
  cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$PORT" > .deploy/cloudflared.log 2>&1 &
echo $! > .deploy/cloudflared.pid

echo "Waiting for tunnel URL..."
for _ in $(seq 1 60); do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' .deploy/cloudflared.log | head -1 || true)
  [ -n "$URL" ] && break
  sleep 1
done

if [ -z "${URL:-}" ]; then
  echo "Tunnel URL not found; check .deploy/cloudflared.log" >&2
  exit 1
fi

echo "web-terminal is live: $URL"
echo "$URL" > .deploy/url.txt
