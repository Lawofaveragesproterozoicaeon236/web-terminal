#!/usr/bin/env bash
# Stop the deployed server + tunnel started by deploy.sh
set -uo pipefail
cd "$(dirname "$0")/.."
for name in server cloudflared; do
  if [ -f ".deploy/$name.pid" ]; then
    pid=$(cat ".deploy/$name.pid")
    kill "$pid" 2>/dev/null && echo "stopped $name ($pid)" || echo "$name ($pid) already gone"
    rm -f ".deploy/$name.pid"
  fi
done
