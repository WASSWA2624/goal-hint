"""Private configuration storage must share member identity and default constraints."""
import hashlib
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = "20261031040514_saved_slip_configurations"


class SlipConfigurationMigrationTests(unittest.TestCase):
    def test_account_identity_default_uniqueness_and_deletion(self):
        sql = (ROOT / "prisma/migrations" / MIGRATION / "migration.sql").read_text()
        self.assertIn("ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin", sql)
        self.assertIn("`isDefault` BOOLEAN NULL", sql)
        self.assertIn("`SlipConfiguration_accountId_isDefault_key`(`accountId`, `isDefault`)", sql)
        self.assertIn("CHECK (`isDefault` IS NULL OR `isDefault` = TRUE)", sql)
        self.assertIn("REFERENCES `MemberAccount`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT", sql)
        schema = (ROOT / "prisma/schema.prisma").read_text()
        self.assertEqual(schema, (ROOT / "prisma/schema.snapshot.prisma").read_text())

    def test_mariadb_overlay_records_the_exact_mysql_migration(self):
        source = (ROOT / "prisma/migrations" / MIGRATION / "migration.sql").read_bytes()
        overlay = (ROOT / "prisma/mariadb" / (MIGRATION + ".sql")).read_text()
        self.assertIn(hashlib.sha256(source).hexdigest(), overlay)
        self.assertIn(source.decode(), overlay)
        self.assertIn("TABLE_NAME='SlipConfiguration') <> 9", overlay)
        self.assertRegex(overlay, r"already or partly installed")


if __name__ == "__main__":
    unittest.main()
