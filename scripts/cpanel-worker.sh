#!/bin/bash
# One bounded invocation per five-minute cron slot; database leases remain authoritative.
set -eu
root="$HOME/goal-hint-worker"
cd "$root/current"
# Retention runs even if provider configuration prevents the live runner from starting.
if ! /usr/bin/timeout --signal=TERM --kill-after=5s 60s \
  "$HOME/nodevenv/goal-hint/24/bin/node" --conditions=react-server \
  --env-file="$root/private/.env.production.local" src/workers/members.ts purge; then
  echo "Members retention did not finish; the next hourly claim retries it." >&2
fi
# Auto-renewal from credit; each renewal is keyed by the period it renews, so a retry never charges twice.
if ! /usr/bin/timeout --signal=TERM --kill-after=5s 60s \
  "$HOME/nodevenv/goal-hint/24/bin/node" --conditions=react-server \
  --env-file="$root/private/.env.production.local" src/workers/members.ts renew; then
  echo "Auto-renewal did not finish; the next slot retries it." >&2
fi
exec /usr/bin/flock -n "$root/worker.lock" /usr/bin/timeout --signal=TERM --kill-after=20s 270s \
  "$HOME/nodevenv/goal-hint/24/bin/node" --conditions=react-server \
  --env-file="$root/private/.env.production.local" src/workers/live.ts
