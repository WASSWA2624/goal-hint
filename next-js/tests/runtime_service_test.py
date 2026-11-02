"""Private command startup failures give safe, actionable dependency diagnostics."""
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from lib import runtime


class RuntimeServiceTests(unittest.TestCase):
    def run_service(self, result):
        with patch.object(runtime, "node_binary", return_value="node"), patch.object(runtime.subprocess, "run", return_value=result):
            return runtime.service("cache-reconcile", {"limit": 100})

    def test_missing_static_dependency_reports_recovery_without_private_paths(self):
        result = subprocess.CompletedProcess([], 1, "", "Error [ERR_MODULE_NOT_FOUND]: private-sentinel/path")
        with self.assertRaises(runtime.CommandError) as failure:
            self.run_service(result)
        self.assertIn("npm ci from next-js/", str(failure.exception))
        self.assertNotIn("private-sentinel", str(failure.exception))

    def test_other_startup_failures_keep_private_diagnostics_hidden(self):
        result = subprocess.CompletedProcess([], 1, "private-sentinel", "private-sentinel")
        with self.assertRaisesRegex(runtime.CommandError, "^Application service unavailable; private diagnostics are withheld\\.$"):
            self.run_service(result)

    def test_successful_protocol_response_is_unchanged(self):
        result = subprocess.CompletedProcess([], 0, '\x1e{"ok":true,"value":{"removed":3,"acknowledged":4}}', "")
        self.assertEqual(self.run_service(result), {"removed": 3, "acknowledged": 4})

    def test_structured_service_errors_keep_their_safe_message(self):
        result = subprocess.CompletedProcess([], 1, '\x1e{"ok":false,"error":"Cache maintenance unavailable."}', "private-sentinel")
        with self.assertRaisesRegex(runtime.CommandError, "^Cache maintenance unavailable\\.$"):
            self.run_service(result)


if __name__ == "__main__":
    unittest.main()
