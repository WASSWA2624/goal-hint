"""Verify database probes are bounded, target-checked and free of private output."""

import importlib.util
import json
from pathlib import Path
import stat
import subprocess
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "vps_watch_db.py"
SPEC = importlib.util.spec_from_file_location("vps_watch_db", SCRIPT)
WATCH_DB = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(WATCH_DB)
DEFAULTS = Path("/etc/goalhint-watch/staging.cnf")
REPORT = b"target\tghprod_test\t11.4.14-MariaDB\nSsl_cipher\tTLS_AES_256_GCM_SHA384\nattempts\t9\t2\t1\t7\nqueue\t5\t24\t2\t1\t0\t3\n"


class DatabaseWatchTest(unittest.TestCase):
    def setUp(self):
        metadata = patch.object(WATCH_DB, "_private_option_file", return_value=True)
        self.metadata = metadata.start()
        self.addCleanup(metadata.stop)

    def test_staging_probe_is_bound_to_its_schema_and_verified_tls(self):
        with patch.object(subprocess, "run", return_value=subprocess.CompletedProcess([], 0, REPORT, b"")) as run:
            report = WATCH_DB.sample_database("staging", DEFAULTS)
        command = run.call_args.args[0]
        self.assertEqual(command[:3], ["/usr/bin/mariadb", f"--defaults-file={DEFAULTS}", "--database=ghprod_test"])
        self.assertTrue({"--host=127.0.0.1", "--port=3306", "--protocol=tcp", "--ssl", "--ssl-verify-server-cert",
                         "--skip-reconnect", "--connect-timeout=2"}.issubset(command))
        self.assertEqual(run.call_args.kwargs["env"], {"LC_ALL": "C"})
        self.assertEqual(run.call_args.kwargs["timeout"], 8)
        sql = run.call_args.kwargs["input"]
        self.assertIn(b"max_statement_time = 2", sql)
        self.assertIn(b"WITH CONSISTENT SNAPSHOT, READ ONLY", sql)
        self.assertIn(b"finishedAt >= @sample_at - INTERVAL 5 MINUTE", sql)
        self.assertTrue(report["ready"])
        self.assertFalse(report["scheduler_expected_active"])
        self.assertGreaterEqual(report["probe_round_trip_ms"], 0)
        self.assertEqual(report["attempts_5m"], {"succeeded": 9, "failed": 2, "expired": 1, "retry": 7})
        self.assertEqual(report["queue"], {"due": 5, "oldest_due_seconds": 24, "running": 2, "expired_leases": 1,
                                           "expired_attempt_deadlines": 0, "unresolved_past_deadline": 3})

    def test_production_can_report_a_verified_empty_queue(self):
        output = REPORT.replace(b"ghprod_test", b"ghprod_prod").replace(b"queue\t5\t24\t2\t1\t0\t3", b"queue\t0\tNULL\t0\t0\t0\t0")
        with patch.object(subprocess, "run", return_value=subprocess.CompletedProcess([], 0, output, b"")):
            report = WATCH_DB.sample_database("production", DEFAULTS)
        self.assertTrue(report["ready"])
        self.assertTrue(report["scheduler_expected_active"])
        self.assertEqual(report["queue"]["due"], 0)
        self.assertIsNone(report["queue"]["oldest_due_seconds"])

    def test_wrong_schema_missing_tls_or_invalid_counters_are_unavailable(self):
        for output in [REPORT.replace(b"ghprod_test", b"ghprod_prod"), REPORT.replace(b"TLS_AES_256_GCM_SHA384", b""),
                       REPORT.replace(b"queue\t5\t24", b"queue\t0\t24"), REPORT.replace(b"attempts\t9", b"attempts\t-9"),
                       REPORT + b"private-unexpected-output\n"]:
            with self.subTest(output=output):
                with patch.object(subprocess, "run", return_value=subprocess.CompletedProcess([], 0, output, b"")):
                    report = WATCH_DB.sample_database("staging", DEFAULTS)
                self.assertFalse(report["ready"])
                self.assertEqual(report["error"], "response-invalid")
                self.assertNotIn("private-unexpected-output", json.dumps(report))

    def test_errors_exclude_raw_output_and_configuration_failures_skip_client(self):
        with patch.object(subprocess, "run") as run:
            self.assertEqual(WATCH_DB.sample_database("unexpected", DEFAULTS)["error"], "configuration-invalid")
            self.metadata.return_value = False
            self.assertEqual(WATCH_DB.sample_database("staging", DEFAULTS)["error"], "configuration-invalid")
        run.assert_not_called()
        self.metadata.return_value = True
        raw = b"private-username password=private-secret"
        with patch.object(subprocess, "run", return_value=subprocess.CompletedProcess([], 1, raw, raw)):
            self.assertEqual(WATCH_DB.sample_database("production", DEFAULTS)["error"], "query-failed")
        with patch.object(subprocess, "run", side_effect=subprocess.TimeoutExpired(CLIENT_COMMAND, 8, output=raw, stderr=raw)):
            report = WATCH_DB.sample_database("staging", DEFAULTS)
        self.assertEqual(report["error"], "timeout")
        self.assertNotIn("private-", json.dumps(report))


CLIENT_COMMAND = ["/usr/bin/mariadb"]


class DefaultsMetadataTest(unittest.TestCase):
    def test_root_provisioned_group_and_service_owned_files(self):
        path = Mock(spec=Path)
        path.is_absolute.return_value = True
        with (patch.object(WATCH_DB.os, "geteuid", return_value=1001, create=True),
              patch.object(WATCH_DB.os, "getegid", return_value=1001, create=True),
              patch.object(WATCH_DB.os, "getgroups", return_value=[1002], create=True)):
            for mode, uid, gid, allowed in [
                (stat.S_IFREG | 0o640, 0, 1002, True), (stat.S_IFREG | 0o600, 1001, 1001, True),
                (stat.S_IFREG | 0o640, 0, 4000, False), (stat.S_IFREG | 0o660, 0, 1001, False),
                (stat.S_IFREG | 0o644, 0, 1001, False), (stat.S_IFLNK | 0o600, 1001, 1001, False),
            ]:
                with self.subTest(mode=mode, uid=uid, gid=gid):
                    path.lstat.return_value = SimpleNamespace(st_mode=mode, st_uid=uid, st_gid=gid)
                    self.assertEqual(WATCH_DB._private_option_file(path), allowed)
