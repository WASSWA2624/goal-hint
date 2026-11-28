"""The VPS collector emits bounded counters and suppresses raw request data."""

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import runpy
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/observe-vps.py"
OBSERVE = runpy.run_path(str(SCRIPT))
END = int(datetime(2026, 11, 28, 12, tzinfo=timezone.utc).timestamp())


def access(seconds_ago, path, status=200, method="GET"):
    stamp = datetime.fromtimestamp(END - seconds_ago, timezone(timedelta(hours=3)))
    return (f'198.51.100.27 - opaque-user [{stamp:%d/%b/%Y:%H:%M:%S %z}] '
            f'"{method} {path} HTTP/2.0" {status} 42 "private-referer" "private-agent"\n').encode()


class ObserveVpsTest(unittest.TestCase):
    def test_fixed_categories_and_nonoverlapping_windows_without_private_fields(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "private-log-name"
            path.write_bytes(b"".join([
                access(120, "/api/matches?q=private-search", 503),
                access(66, "/en/slips?code=private-builder"),
                access(60, "/api/matches?through=2&date=2026-11-28"),
                access(50, "/api/matches?page=2", 503),
                access(40, "/api/matches?through=1", 400),
                access(20, "/api/matches/12345/insights?section=private-section"),
                access(10, "/api/matches", method="POST"),
                access(0, "/api/account/session"),
            ]))
            result = OBSERVE["collect_access_log"](path, END, 60, 1_000_000)
        before, after = result["windows"]
        self.assertEqual((before["logRecords"], after["logRecords"]), (2, 5))
        self.assertTrue(all(window["seenAtOrBeforeStart"] and window["seenAtOrAfterEnd"] for window in (before, after)))
        self.assertEqual(before["routes"]["matches-initial-api"]["statuses"], {503: 1})
        self.assertEqual(before["routes"]["builder-page"]["statuses"], {200: 1})
        self.assertEqual(after["routes"]["matches-api"]["statuses"], {200: 1, 400: 1, 503: 1})
        self.assertEqual(after["routes"]["matches-continuation-api"]["statuses"], {200: 1, 503: 1})
        self.assertEqual(after["routes"]["match-insights-api"]["statuses"], {200: 1})
        self.assertEqual(after["routes"]["account-session-api"]["requests"], 0)
        for private in ("private-", "198.51.100.27", "opaque-user", "12345", "?", "/api/"):
            self.assertNotIn(private, json.dumps(result))

    def test_tail_budget_discards_partial_records_and_marks_coverage(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "log"
            first, complete, partial = access(100, "/en/matches"), access(20, "/en/matches"), access(10, "/en/matches")[:-3]
            path.write_bytes(first + complete + partial)
            result = OBSERVE["collect_access_log"](path, END, 60, len(complete + partial) + 20)
            missing = OBSERVE["collect_access_log"](path.with_name("missing"), END, 60, 1024)
        before, after = result["windows"]
        self.assertTrue(result["scanLimited"])
        self.assertEqual((result["unparsedLines"], result["incompleteTailLines"]), (0, 1))
        self.assertFalse(before["seenAtOrBeforeStart"])
        self.assertFalse(after["seenAtOrAfterEnd"])
        self.assertEqual((before["logRecords"], after["logRecords"]), (0, 1))
        self.assertEqual(missing, {"state": "unavailable"})

    def test_host_snapshot_reads_only_fixed_counters_and_selected_interfaces(self):
        with TemporaryDirectory() as directory:
            proc = Path(directory)
            (proc / "net").mkdir()
            (proc / "pressure").mkdir()
            (proc / "stat").write_text("cpu 1 2 3 4 5 6 7 8 9 10\n", encoding="ascii")
            (proc / "meminfo").write_text("MemTotal: 120 kB\nIgnored: 20 kB\n", encoding="ascii")
            (proc / "net/dev").write_text("lo: 23 2 3 4 5 6 7 8 50\neth0: 13 2 3 4 5 6 7 8 90\n", encoding="ascii")
            (proc / "diskstats").write_text("8 0 sda 11 12 13 14 15 16 17 18 19 20 21\n", encoding="ascii")
            (proc / "pressure/io").write_text("some avg10=0.01 total=123\nfull avg10=0.00 total=0\n", encoding="ascii")
            with patch.dict(OBSERVE["host_snapshot"].__globals__, {"PROC": proc}):
                snapshot = OBSERVE["host_snapshot"]("eth0", "sda")
                unavailable = OBSERVE["host_snapshot"]("missing", "missing")
        self.assertEqual(snapshot, ((1, 2, 3, 4, 5, 6, 7, 8), {"totalBytes": 120 * 1024},
                                    {("io", "some"): 123, ("io", "full"): 0}, (13, 90), (11, 13, 15, 17, 20)))
        self.assertEqual(unavailable[-2:], (None, None))

    def test_host_rates_use_deltas_and_leave_counter_resets_unknown(self):
        before = ((0,) * 8, {}, {("io", "some"): 1}, (50, 100), (1, 2, 3, 4, 5))
        after = ((2, 0, 1, 5, 1, 0, 0, 1), {"totalBytes": 120}, {("io", "some"): 40_001}, (42, 120), (3, 6, 9, 12, 45))
        host = OBSERVE["collect_host"]
        with patch.dict(host.__globals__, {"host_snapshot": lambda *_: next(snapshots)}), \
             patch("time.monotonic", side_effect=[0, 2]), patch("time.sleep"):
            snapshots = iter([before, after])
            result = host(2, "eth0", "sda")
        self.assertEqual(result["cpu"], {"busyPercent": 30, "ioWaitPercent": 10, "stealPercent": 10})
        self.assertEqual(result["pressureStallPercent"], {"cpu": None, "memory": None, "io": {"some": 2}})
        self.assertIsNone(result["network"])
        self.assertEqual(result["disk"], {"readsPerSecond": 1, "readBytesPerSecond": 1024, "writesPerSecond": 3,
                                          "writtenBytesPerSecond": 2048, "ioBusyPercent": 2})


if __name__ == "__main__":
    unittest.main()
