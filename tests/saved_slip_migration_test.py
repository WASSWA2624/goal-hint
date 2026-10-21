"""Saved-slip storage must match the existing InnoDB/binary-identity fixture tables."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class SavedSlipMigrationTests(unittest.TestCase):
    def test_storage_engine_and_collation_match_foreign_key_parents(self):
        sql = (ROOT / "prisma/migrations/20261021110000_saved_slips/migration.sql").read_text()
        tables = re.findall(r"CREATE TABLE `(\w+)` \((.*?)\n(\).*?;)", sql, re.S)
        self.assertEqual([table for table, _, _ in tables], ["SavedSlip", "SavedSlipFixture"])
        for table, _, options in tables:
            self.assertEqual(options, ") ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;", table)
        self.assertIn("REFERENCES `FootballFixture` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT", sql)
        self.assertIn("REFERENCES `SavedSlip` (`id`) ON DELETE CASCADE", sql)

    def test_snapshot_and_link_models_preserve_private_account_identity(self):
        schema = (ROOT / "prisma/schema.prisma").read_text()
        self.assertEqual(schema, (ROOT / "prisma/schema.snapshot.prisma").read_text())
        model = schema.split("model SavedSlip {", 1)[1].split("\n}", 1)[0]
        self.assertIn("@@unique([accountId, fingerprint])", model)
        self.assertIn("snapshotJson Json", model)


if __name__ == "__main__":
    unittest.main()
