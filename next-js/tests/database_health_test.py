"""Private database health must fail clearly when connectivity hides account schema drift."""
from contextlib import redirect_stdout
import importlib.util
import io
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("database_health", ROOT / "scripts/database-health.py")
health = importlib.util.module_from_spec(spec)
spec.loader.exec_module(health)


class DatabaseHealthTests(unittest.TestCase):
    def test_missing_schema_fails_with_safe_migration_and_permission_guidance(self):
        output = io.StringIO()
        with patch.object(health, "service", return_value="schema-unavailable") as service, redirect_stdout(output):
            self.assertEqual(health.main(), 1)
        service.assert_called_once_with("database-health")
        self.assertEqual(output.getvalue(), "Database readiness: schema-unavailable.\n"
                         "Check pending migrations and application-role account-table permissions.\n")

    def test_existing_success_and_connectivity_statuses_keep_their_exit_codes(self):
        for status, code in (("ready", 0), ("disabled", 0), ("unavailable", 1)):
            with self.subTest(status=status), patch.object(health, "service", return_value=status), redirect_stdout(io.StringIO()) as output:
                self.assertEqual(health.main(), code)
                self.assertEqual(output.getvalue(), f"Database readiness: {status}.\n")


if __name__ == "__main__":
    unittest.main()
