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

    def test_personal_storage_removed_and_presets_preserved(self):
        schema = (ROOT / "prisma/schema.prisma").read_text(encoding="utf-8")
        self.assertEqual(schema, (ROOT / "prisma/schema.snapshot.prisma").read_text(encoding="utf-8"))
        self.assertNotIn("model SavedSlip {", schema)
        self.assertNotIn("model SavedSlipFixture {", schema)
        self.assertIn("model SlipConfiguration {", schema)
        sql = (ROOT / "prisma/migrations/20261103120000_transient_slips_and_odds_bands/migration.sql").read_text()
        self.assertIn("DROP TABLE `SavedSlip`", sql)
        self.assertNotIn("DROP TABLE `SlipConfiguration`", sql)
        self.assertNotIn("DELETE FROM SharedSlip", sql)
        self.assertNotIn("DROP COLUMN snapshotJson", sql)


if __name__ == "__main__":
    unittest.main()
