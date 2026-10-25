"""Private storage histories remain bounded, atomic and independent of real database access."""
import argparse
from contextlib import redirect_stdout
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("database_storage", ROOT / "scripts/database-storage.py")
storage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(storage)


def args(**overrides):
    return argparse.Namespace(target="synthetic", record=True, sample_rows=100, max_allocated_bytes=None,
                              max_growth_bytes_per_day=None, **overrides)


def report(measured=1, allocation=False, growth=False, rate=10):
    return {"status": "measured", "measurement": {"version": 1, "measuredAt": measured, "allocatedBytes": 100},
            "comparison": {"growthBytesPerDay": rate}, "alerts": {"allocation": allocation, "growth": growth}}


class StorageHistoryTests(unittest.TestCase):
    def test_record_saves_private_baseline_and_passes_previous_measurement_to_shared_service(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "history.json"
            with patch.object(storage, "history_path", return_value=path), patch.object(storage, "service", return_value=report()) as service, redirect_stdout(io.StringIO()):
                self.assertEqual(storage.run(args()), 0)
            self.assertEqual(json.loads(path.read_text()), [{"version": 1, "measuredAt": 1, "allocatedBytes": 100}])
            self.assertIsNone(service.call_args[0][1]["previous"])
            with patch.object(storage, "history_path", return_value=path), patch.object(storage, "service", return_value=report(2)) as service, redirect_stdout(io.StringIO()):
                self.assertEqual(storage.run(args()), 0)
            self.assertEqual(service.call_args[0][1]["previous"], {"version": 1, "measuredAt": 1, "allocatedBytes": 100})
            self.assertEqual(len(json.loads(path.read_text())), 2)
            self.assertFalse(path.with_suffix(".lock").exists())
            self.assertEqual(list(path.parent.glob("*.tmp")), [])

    def test_threshold_exceedance_and_missing_growth_baseline_have_distinct_nonzero_status(self):
        for response, maximum_growth, code in [(report(allocation=True), None, 2), (report(growth=True), 10, 2),
                                                (report(rate=None, growth=None), 10, 3), ({"status": "disabled"}, None, 1)]:
            with self.subTest(code=code), tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "history.json"
                options = args(); options.max_growth_bytes_per_day = maximum_growth
                with patch.object(storage, "history_path", return_value=path), patch.object(storage, "service", return_value=response), redirect_stdout(io.StringIO()):
                    self.assertEqual(storage.run(options), code)
                self.assertFalse(path.with_suffix(".lock").exists())
                self.assertEqual(path.exists(), response["status"] == "measured")

    def test_read_only_inspection_keeps_history_and_failures_release_only_owned_lock(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "history.json"
            original = json.dumps([{"version": 1, "measuredAt": 0}]); path.write_text(original)
            options = args(); options.record = False
            with patch.object(storage, "history_path", return_value=path), patch.object(storage, "service", return_value=report()), redirect_stdout(io.StringIO()):
                self.assertEqual(storage.run(options), 0)
            self.assertEqual(path.read_text(), original)
            with patch.object(storage, "history_path", return_value=path), patch.object(storage, "service", side_effect=storage.CommandError("unavailable")):
                with self.assertRaises(storage.CommandError): storage.run(options)
            self.assertFalse(path.with_suffix(".lock").exists())
            lock = path.with_suffix(".lock"); lock.write_text("owned by another process")
            with patch.object(storage, "history_path", return_value=path), patch.object(storage, "service") as service:
                with self.assertRaises(storage.CommandError): storage.run(options)
            service.assert_not_called(); self.assertTrue(lock.exists())

    def test_unknown_allocation_cannot_pass_a_requested_capacity_check(self):
        with tempfile.TemporaryDirectory() as directory:
            value = report(allocation=None); value["measurement"]["allocatedBytes"] = None
            options = args(); options.max_allocated_bytes = 100
            with patch.object(storage, "history_path", return_value=Path(directory) / "history.json"), patch.object(storage, "service", return_value=value), redirect_stdout(io.StringIO()):
                self.assertEqual(storage.run(options), 3)

    def test_invalid_oversized_history_is_preserved_and_retention_keeps_only_last_thirty(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "history.json"
            for text in ["not json", "{}", json.dumps([0]), json.dumps([{}] * 31)]:
                path.write_text(text)
                with self.assertRaises(storage.CommandError): storage.load_history(path)
                self.assertEqual(path.read_text(), text)
            path.write_text(" " * (storage.MAX_HISTORY_BYTES + 1))
            with self.assertRaises(storage.CommandError): storage.load_history(path)
            rows = [{"measuredAt": index} for index in range(30)]
            storage.save_history(path, rows, report(30))
            value = json.loads(path.read_text()); self.assertEqual(len(value), 30)
            self.assertEqual(value[0]["measuredAt"], 1); self.assertEqual(value[-1]["measuredAt"], 30)

    def test_targets_cannot_escape_private_history_namespace(self):
        for target in ["../other", "/absolute", "C:\\private", "a/b", "", "secret?token=x"]:
            with self.subTest(target=target), self.assertRaises(storage.CommandError): storage.history_path(target)
        for value in ["0", "-1", "1.5", "9007199254740992", "secret"]:
            with self.assertRaises(argparse.ArgumentTypeError): storage.positive(value)


if __name__ == "__main__":
    unittest.main()
