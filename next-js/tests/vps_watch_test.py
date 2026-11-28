import json
from pathlib import Path
import runpy
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch


SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
with patch.object(sys, "path", [str(SCRIPTS), *sys.path]):
    watch = runpy.run_path(str(SCRIPTS / "vps-watch.py"))


def sample(at, status=200, duration=50, db_ready=True):
    return {"at": at, "databaseReady": db_ready, "databaseMs": 12 if db_ready else None,
            "http": {route: {"status": status, "ttfbMs": duration - 5, "completeMs": duration}
                     for route in watch["ROUTES"]}}


class VpsWatchTest(unittest.TestCase):
    def test_probes_use_the_verified_hostname_without_redirect_or_proxy(self):
        with patch.object(subprocess, "run", return_value=subprocess.CompletedProcess(
                [], 0, stdout="200 0.0205 0.021", stderr="private detail")) as run:
            result = watch["probe_http"]("test.goalhint.com", "/api/account/session")
        self.assertEqual(result, {"status": 200, "ttfbMs": 20.5, "completeMs": 21.0})
        command = run.call_args.args[0]
        self.assertEqual(command[1], "--disable")
        self.assertEqual(command[-1], "https://test.goalhint.com/api/account/session")
        self.assertIn("--noproxy", command)
        self.assertNotIn("--insecure", command)
        self.assertNotIn("--location", command)

    def test_rolling_percentiles_count_failures_separately(self):
        samples = [sample(i, duration=i * 10) for i in range(1, 101)]
        samples.append(sample(101, status=503, db_ready=False))
        summary = watch["summarize"](samples)
        for route in summary["originHttps"].values():
            self.assertEqual(route["attempts"], 101)
            self.assertEqual(route["failed"], 1)
            self.assertEqual(route["completeMs"], {"samples": 100, "p50": 500, "p95": 950, "p99": 990})
        self.assertEqual(summary["databaseProbeRoundTripMs"]["samples"], 100)

    def test_alerts_wait_for_repeated_readiness_failures_and_respect_scheduler(self):
        unhealthy = sample(1, status=503, db_ready=False)
        database = {"scheduler_expected_active": False, "attempts_5m": {"failed": 2},
                    "queue": {"expired_leases": 1}}
        self.assertEqual(watch["active_alerts"]([unhealthy], database), [])
        self.assertEqual(watch["active_alerts"]([unhealthy, unhealthy], database),
                         ["matches-read-unavailable", "guest-session-unavailable", "database-unavailable"])
        database["scheduler_expected_active"] = True
        self.assertEqual(watch["active_alerts"]([sample(2, duration=2000), sample(3, duration=2500)], database),
                         ["matches-read-slow", "guest-session-slow", "worker-deadlines-at-risk",
                          "worker-attempt-failures"])

    def test_history_is_atomic_bounded_and_recovers_from_bad_data(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "observations.json"
            path.write_text('{"invalid": true}', encoding="utf-8")
            self.assertEqual(watch["read_samples"](path, 500), [])
            source = [sample(i) for i in range(500)]
            watch["save_samples"](path, source)
            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), source)
            self.assertEqual(watch["read_samples"](path, 500), source[-288:])
            self.assertEqual(watch["read_samples"](path, 90_000), [])
            self.assertEqual(list(Path(directory).iterdir()), [path])


if __name__ == "__main__":
    unittest.main()
