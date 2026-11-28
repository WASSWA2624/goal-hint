"""Collect fixed, private readiness and workload metrics for one hosted environment."""

import argparse
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import runpy
import subprocess
import tempfile
import time

from vps_watch_db import sample_database


HOSTS = {"staging": "test.goalhint.com", "production": "goalhint.com"}
ROUTES = {
    "matches-read": "/api/matches?when=today&pageSize=1&leagues=0",
    "guest-session": "/api/account/session",
}
MAX_SAMPLES = 288
HISTORY_SECONDS = 24 * 60 * 60
LOG_WINDOW_SECONDS = 300
SLOW_HTTP_MS = 2_000
WORKER_ALERTS = {"worker-deadlines-at-risk", "worker-attempt-failures"}
ALERT_ACTIONS = {
    "matches-read-unavailable": "Check the Matches response, Passenger group and recent Apache errors.",
    "matches-read-slow": "Compare the Matches transaction and membership timings.",
    "guest-session-unavailable": "Check the account session route and MariaDB availability.",
    "guest-session-slow": "Compare session dependency timings and Passenger CPU.",
    "database-unavailable": "Check the local MariaDB listener and the monitor account's verified TLS connection.",
    "worker-deadlines-at-risk": "Inspect the existing job leases and cutoff schedule before intervening.",
    "worker-attempt-failures": "Review recent durable attempts and the private football worker log.",
}


def probe_http(host, path):
    """Use the site's DNS and certificate with redirects disabled."""
    try:
        result = subprocess.run(
            ["/usr/bin/curl", "--disable", "--silent", "--show-error", "--noproxy", "*", "--proto", "=https",
             "--connect-timeout", "3", "--max-time", "10", "--max-filesize", "262144", "--output", "/dev/null",
             "--write-out", "%{response_code} %{time_starttransfer} %{time_total}",
             f"https://{host}{path}"],
            capture_output=True, text=True, timeout=12, check=False,
        )
        code, headers, done = result.stdout.split()
        status = int(code) or None
        if result.returncode:
            return {"status": status, "error": "timeout" if result.returncode == 28 else "transport"}
        return {"status": status, "ttfbMs": round(float(headers) * 1000, 2),
                "completeMs": round(float(done) * 1000, 2)}
    except subprocess.TimeoutExpired:
        return {"status": None, "error": "timeout"}
    except (OSError, ValueError):
        return {"status": None, "error": "unavailable"}


def ready(probe):
    return probe.get("status") == 200 and not probe.get("error")


def distribution(values):
    ordered = sorted(value for value in values
                     if type(value) in {int, float} and math.isfinite(value) and value >= 0)
    return {"samples": len(ordered), **{
        f"p{p}": ordered[math.ceil(len(ordered) * p / 100) - 1] if ordered else None for p in (50, 95, 99)
    }}


def summarize(samples):
    routes = {}
    for name in ROUTES:
        attempts = [sample["http"][name] for sample in samples]
        successes = [probe for probe in attempts if ready(probe)]
        routes[name] = {
            "attempts": len(attempts), "failed": len(attempts) - len(successes),
            "ttfbMs": distribution(probe.get("ttfbMs") for probe in successes),
            "completeMs": distribution(probe.get("completeMs") for probe in successes),
        }
    return {
        "originHttps": routes,
        "databaseProbeRoundTripMs": distribution(sample.get("databaseMs") for sample in samples),
    }


def active_alerts(samples, database):
    latest = samples[-2:]
    alerts = []
    if len(latest) == 2 and latest[-1]["at"] - latest[0]["at"] <= 2 * LOG_WINDOW_SECONDS:
        for name in ROUTES:
            checks = [sample["http"][name] for sample in latest]
            if all(not ready(probe) for probe in checks):
                alerts.append(f"{name}-unavailable")
            elif all(ready(probe) and probe.get("completeMs", 0) >= SLOW_HTTP_MS for probe in checks):
                alerts.append(f"{name}-slow")
        if all(not sample.get("databaseReady") for sample in latest):
            alerts.append("database-unavailable")
    if database.get("scheduler_expected_active"):
        queue = database.get("queue", {})
        attempts = database.get("attempts_5m", {})
        if any(queue.get(key, 0) > 0 for key in (
            "expired_leases", "expired_attempt_deadlines", "unresolved_past_deadline",
        )):
            alerts.append("worker-deadlines-at-risk")
        if attempts.get("failed", 0) > 0:
            alerts.append("worker-attempt-failures")
    return alerts


def read_samples(path, now):
    try:
        with path.open(encoding="utf-8") as source:
            raw = source.read(1_000_001)
        if len(raw) > 1_000_000:
            return []
        stored = json.loads(raw)
    except (OSError, ValueError):
        return []
    if not isinstance(stored, list):
        return []
    return sorted((row for row in stored[-MAX_SAMPLES:]
                   if isinstance(row, dict) and type(row.get("at")) is int
                   and now - HISTORY_SECONDS <= row["at"] <= now
                   and isinstance(row.get("http"), dict)
                   and all(isinstance(row["http"].get(name), dict) for name in ROUTES)),
                  key=lambda row: row["at"])


def save_samples(path, samples):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as output:
            temporary = Path(output.name)
            json.dump(samples, output, separators=(",", ":"), allow_nan=False)
        temporary.replace(path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def log_window(observe, host, now):
    access_log = Path("/home/ghprod/access-logs") / f"{host}-ssl_log"
    report = observe["collect_access_log"](access_log, now - 60, LOG_WINDOW_SECONDS, 4 * 2**20)
    if not report.get("windows"):
        return report
    latest = report["windows"][-1]
    return {key: report[key] for key in ("state", "scanLimited", "unparsedLines", "incompleteTailLines")} | {
        "window": latest,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--environment", choices=HOSTS, required=True)
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--db-options", type=Path, required=True)
    args = parser.parse_args()
    host = HOSTS[args.environment]
    now = int(time.time())
    probes = {name: probe_http(host, path) for name, path in ROUTES.items()}
    database = sample_database(args.environment, args.db_options)
    observe = runpy.run_path(str(Path(__file__).with_name("observe-vps.py")))
    samples = read_samples(args.state, now)[1 - MAX_SAMPLES:]
    sample = {
        "at": now, "http": probes, "databaseReady": database.get("ready") is True,
        "databaseMs": database.get("probe_round_trip_ms") if database.get("ready") is True else None,
    }
    prior_alerts = samples[-1].get("alerts") if samples else None
    previous = {code for code in ALERT_ACTIONS if isinstance(prior_alerts, list) and code in prior_alerts}
    samples.append(sample)
    alerts = active_alerts(samples, database)
    if database.get("scheduler_expected_active") and database.get("ready") is not True:
        alerts = sorted(set(alerts) | (previous & WORKER_ALERTS))
    sample["alerts"] = alerts
    save_samples(args.state, samples)
    opened = sorted(set(alerts) - previous)
    result = {
        "event": "goalhint-vps-watch", "environment": args.environment,
        "at": datetime.fromtimestamp(now, timezone.utc).isoformat(),
        "http": probes, "past24h": summarize(samples), "database": database,
        "host": observe["collect_host"](1, "eth0", "sda") if args.environment == "production" else None,
        "accessLog": log_window(observe, host, now),
        "alerts": {"active": alerts, "opened": opened, "resolved": sorted(previous - set(alerts)),
                   "actions": {code: ALERT_ACTIONS[code] for code in opened}},
    }
    print(("<4>" if opened else "") + json.dumps(result, separators=(",", ":"), allow_nan=False))


if __name__ == "__main__":
    main()
