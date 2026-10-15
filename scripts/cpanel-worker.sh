#!/bin/bash
# One bounded invocation per five-minute cron slot; database leases remain authoritative.
set -eu
root="$HOME/goal-hint-worker"
cd "$root/current"
exec /usr/bin/flock -n "$root/worker.lock" /usr/bin/timeout --signal=TERM --kill-after=20s 270s \
  "$HOME/nodevenv/goal-hint/24/bin/node" --conditions=react-server \
  --env-file="$root/private/.env.production.local" src/workers/live.ts
