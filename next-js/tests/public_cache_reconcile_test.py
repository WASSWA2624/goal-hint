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

    def test_all_uses_one_service_process_for_the_whole_backlog(self):
        result, service = self.run_command(["1000", "--all"], [{"acknowledged": 1000, "removed": 2}])
        self.assertEqual(result, {"acknowledged": 1000, "removed": 2})
        service.assert_called_once_with("cache-reconcile", {"limit": 1000, "all": True}, timeout=600)

    def test_invalid_batch_never_reaches_database(self):
        for value in ["0", "1001", "9999", "-1", "1.5", "secret", "\u0661"]:
            with self.subTest(value=value), patch.object(cache, "service") as service, redirect_stdout(io.StringIO()):
                with self.assertRaises(cache.CommandError):
                    cache.main([value])
                service.assert_not_called()

    def test_unknown_arguments_do_not_expose_private_values(self):
        with patch.object(cache, "service") as service:
            with self.assertRaises(cache.CommandError) as failure:
                cache.main(["--private-sentinel"])
        service.assert_not_called()
        self.assertNotIn("private-sentinel", str(failure.exception))

    def test_failure_stops_further_passes_without_reporting_success(self):
        output = io.StringIO()
        with patch.object(cache, "service", side_effect=cache.CommandError("unavailable")) as service, redirect_stdout(output):
            with self.assertRaises(cache.CommandError):
                cache.main(["--all"])
        service.assert_called_once()
        self.assertEqual(output.getvalue(), "")

if __name__ == "__main__":
    unittest.main()
