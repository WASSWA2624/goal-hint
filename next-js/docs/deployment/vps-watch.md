# Private VPS monitoring rollout

The `goalhint-watch` timer records aggregate HTTPS, MariaDB and worker observations in the existing system journal every five minutes, with a small per-instance delay. Staging and production have distinct probes, logs and database profiles. Each instance retains up to 288 observations from the past 24 hours for its rolling p50/p95/p99 summaries. HTTPS percentiles measure fixed synthetic requests from the VPS using each site's DNS and verified TLS certificate. The MariaDB timing includes opening a verified connection and reading the queue aggregates. Munin and sysstat cover shared host resources. WHM/cPanel continues to supervise hosted services. The monitor runs at lower CPU and disk priority under `ghprod`, with a 60-second deadline and read-only access to its home directory. [Service template](systemd/goalhint-watch@.service) · [Timer template](systemd/goalhint-watch@.timer)

Use the verified root SSH workflow. Transfer the observer scripts and systemd files from the approved source revision to a private operator directory on the VPS. Check the existing journal retention and disk budget before enabling either timer. Both instances use the standard journal and require no new daemon, external destination, or database migration.

```sh
systemd-analyze cat-config systemd/journald.conf
journalctl --disk-usage
```

Keep the MariaDB client profiles in `/etc/goalhint-watch`, owned by `root:ghprod` with mode `0640`. Use certificate-verified TLS to the existing loopback endpoint. Each profile needs a read-only account for its own schema and `SELECT` on `DurableJob` and `DurableJobAttempt`. Transfer the profile separately using the private credential workflow. Check grants and TLS under `ghprod` before starting the collector.

## Qualify staging

Run the following on the VPS from the private source directory containing `next-js/`. Install the scripts in a root-owned directory and install only the staging database profile by this step. The staging profile targets `ghprod_test`.

```sh
install -d -o root -g root -m 0755 /usr/local/lib/goalhint-watch/staging
install -d -o root -g ghprod -m 0750 /etc/goalhint-watch
install -o root -g root -m 0644 \
  next-js/scripts/vps-watch.py next-js/scripts/observe-vps.py next-js/scripts/vps_watch_db.py \
  /usr/local/lib/goalhint-watch/staging/
install -o root -g root -m 0644 \
  next-js/docs/deployment/systemd/goalhint-watch@.service next-js/docs/deployment/systemd/goalhint-watch@.timer \
  /etc/systemd/system/
systemd-analyze --recursive-errors=no verify \
  /etc/systemd/system/goalhint-watch@.service:goalhint-watch@staging.service \
  /etc/systemd/system/goalhint-watch@.timer:goalhint-watch@staging.timer
systemctl daemon-reload
systemctl start goalhint-watch@staging.service
journalctl -u goalhint-watch@staging.service -n 20 --no-pager
```

Confirm the manual sample uses staging HTTPS and the staging schema, produces fixed aggregate fields, and completes within the unit deadline. Confirm the bounded state file under `/var/lib/goalhint-watch-staging` is private. Enable the timer after these checks.

```sh
systemctl enable --now goalhint-watch@staging.timer
systemctl list-timers goalhint-watch@staging.timer
```

Inspect the first scheduled samples. Hosted staging intentionally keeps provider jobs disabled. Use disposable fixtures to verify queue age, failed attempts and missed deadlines, and check that expected staging inactivity does not raise a production alert. Run the existing hosted smoke checks before promotion.

## Promote production

Install the identical staged script bytes under `/usr/local/lib/goalhint-watch/production` and compare their SHA-256 checksums with staging. Install the distinct production TLS profile at `/etc/goalhint-watch/production.cnf` for `ghprod_prod`. The application archive and branch promotion are separate from these monitoring files.

```sh
install -d -o root -g root -m 0755 /usr/local/lib/goalhint-watch/production
for script in vps-watch.py observe-vps.py vps_watch_db.py
do
  install -o root -g root -m 0644 \
    "/usr/local/lib/goalhint-watch/staging/$script" /usr/local/lib/goalhint-watch/production/
  sha256sum "/usr/local/lib/goalhint-watch/staging/$script" "/usr/local/lib/goalhint-watch/production/$script"
done
systemd-analyze --recursive-errors=no verify \
  /etc/systemd/system/goalhint-watch@.service:goalhint-watch@production.service \
  /etc/systemd/system/goalhint-watch@.timer:goalhint-watch@production.timer
systemctl start goalhint-watch@production.service
journalctl -u goalhint-watch@production.service -n 20 --no-pager
```

Confirm the manual sample uses production HTTPS and the production schema. Check normal HTTPS traffic and scheduled job completion alongside the first production samples.

```sh
systemctl enable --now goalhint-watch@production.timer
systemctl list-timers goalhint-watch@production.timer
```

Use `journalctl -u goalhint-watch@production.service --since today -o cat` for private observations. Add `-p warning` to find new alerts and their suggested actions. Inspect the matching staging service separately. Check `systemctl status goalhint-watch@production.service goalhint-watch@production.timer` if samples stop arriving. Empty or unavailable fields call for checking the source and its permissions. Use WHM/cPanel for web or database recovery and the existing launchers for worker recovery.

Readiness and latency warnings use two recent observations. The latency warning adopts the application's two-second slow-request threshold. A failed durable attempt or expired active lease or deadline opens a worker warning where the scheduler is expected to run. An unavailable database observation preserves any open worker warning. New warnings include an operator action, and subsequent samples report active and resolved conditions. These warnings stay in the private journal.

Stop the affected timer and service before replacing its scripts. When either instance is active, qualify edits to a shared unit definition as a staging-only instance file before updating the shared template. Keep the prior verified source revision available for rollback through the approved release workflow.

## Roll back

Stop the affected timer and any in-progress observation. Use the staging instance names for a staging rollback. Journal and state remain available for incident review.

```sh
systemctl disable --now goalhint-watch@production.timer
systemctl stop goalhint-watch@production.service
```

To restore a previous monitor version, reinstall its approved scripts in the affected instance directory. Restore any changed unit files, reload systemd, run the manual probe and verify its journal before re-enabling the timer. To retire an instance, remove only its installed monitoring scripts and private monitoring profile through the normal credential process. Remove the shared unit templates after retiring both instances, then run `systemctl daemon-reload`. Verify the regular HTTPS checks and worker schedules after rollback.
