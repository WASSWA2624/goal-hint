"""Adoption preserves recorded history while rejecting unknown, edited or incomplete required migrations."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from lib.mysql_backup import compatible_migration_history, migration_history_matches, repository_migrations
from lib.backup_contract import sha256


class MigrationHistoryTests(unittest.TestCase):
    def test_exact_adoption_does_not_relax_required_checks(self):
        required = [{"name": "adoption", "checksum": "current"}]
        legacy = {"name": "legacy", "checksum": "original", "adoptedBy": "adoption"}
        self.assertTrue(migration_history_matches(required + [legacy], required, [legacy]))
        for actual in ([], required * 2, required + [{**legacy, "checksum": "changed"}], required + [{"name": "unknown", "checksum": "original"}]):
            self.assertFalse(migration_history_matches(actual, required, [legacy]))

    def test_checkout_line_endings_preserve_original_checksum(self):
        actual = repository_migrations()
        row = next(row for row in actual if row["name"] == "20261014131920_first_party_analytics")
        text = (Path("prisma/migrations") / row["name"] / "migration.sql").read_bytes().replace(b"\r\n", b"\n")
        row["checksum"] = sha256(text)
        self.assertTrue(compatible_migration_history(actual))
        row["checksum"] = "0" * 64
        self.assertFalse(compatible_migration_history(actual))
