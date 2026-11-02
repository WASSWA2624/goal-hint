"""Cache maintenance drains bounded batches without discarding durable records."""
from contextlib import redirect_stdout
import importlib.util
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("public_cache_reconcile", ROOT / "scripts/public-cache-reconcile.py")
cache = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cache)


class CacheReconcileTests(unittest.TestCase):
    def run_command(self, args, results):
        output = io.StringIO()
        with patch.object(cache, "service", side_effect=results) as service, redirect_stdout(output):
            cache.main(args)
        return json.loads(output.getvalue()), service

    def test_default_keeps_one_bounded_pass(self):
        result, service = self.run_command([], [{"acknowledged": 100, "removed": 3}])
        self.assertEqual(result, {"acknowledged": 100, "removed": 3})
        service.assert_called_once_with("cache-reconcile", {"limit": 100})

    def test_all_continues_when_only_one_kind_of_work_remains(self):
        result, service = self.run_command(["1000", "--all"], [
            {"acknowledged": 1000, "removed": 0},
            {"acknowledged": 0, "removed": 2},
            {"acknowledged": 0, "removed": 0},
        ])
        self.assertEqual(result, {"acknowledged": 1000, "removed": 2})
        self.assertEqual(service.call_count, 3)
        self.assertTrue(all(call.args == ("cache-reconcile", {"limit": 1000}) for call in service.call_args_list))

    def test_invalid_batch_never_reaches_database(self):
        for value in ["0", "1001", "9999", "-1", "1.5", "secret", "\u0661"]:
            with self.subTest(value=value), patch.object(cache, "service") as service, redirect_stdout(io.StringIO()):
                with self.assertRaises(SystemExit), patch("sys.stderr", new_callable=io.StringIO):
                    cache.main([value])
                service.assert_not_called()

    def test_failure_stops_further_passes_without_reporting_success(self):
        output = io.StringIO()
        with patch.object(cache, "service", side_effect=cache.CommandError("unavailable")) as service, redirect_stdout(output):
            with self.assertRaises(cache.CommandError):
                cache.main(["--all"])
        service.assert_called_once()
        self.assertEqual(output.getvalue(), "")

    def test_continuous_writes_have_a_finite_pass_limit(self):
        with patch.object(cache, "service", return_value={"acknowledged": 1, "removed": 0}) as service:
            with self.assertRaisesRegex(cache.CommandError, "1000 passes"):
                cache.main(["--all"])
        self.assertEqual(service.call_count, 1000)


if __name__ == "__main__":
    unittest.main()
