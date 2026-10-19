"""Static checks for the paid-access migration and its MariaDB overlay (prompt 058).

The isolated MySQL used by integration tests starts with --no-defaults, so its default engine is always InnoDB and a
missing ENGINE clause would pass there. The production host can default to MyISAM, so every CREATE TABLE must say so.
"""
import hashlib
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
TABLES = ["MemberAccount", "MemberSession", "SubscriptionPlan", "PaymentSubmission", "PaymentScreenshot", "AccessCode",
          "SubscriptionSettings", "RateLimitBucket", "OwnerAuditEvent"]
TABLE_OPTIONS = ") ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;"


def committed_text(path):
    """The file as git stores it: LF line endings, whatever the checkout uses."""
    return path.read_bytes().decode("utf-8").replace("\r\n", "\n")


def create_tables(sql):
    """Each CREATE TABLE statement, from its name to the closing table options."""
    return re.findall(r"CREATE TABLE (?:IF NOT EXISTS )?`(\w+)` \((.*?)\n(\).*?;)", sql, re.S)


class SubscriptionMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        migrations = sorted((ROOT / "prisma/migrations").glob("*_subscriptions"))
        overlays = sorted((ROOT / "prisma/mariadb").glob("*_subscriptions.sql"))
        assert len(migrations) == 1 and len(overlays) == 1, "exactly one subscriptions migration and overlay"
        cls.name = migrations[0].name
        cls.migration = committed_text(migrations[0] / "migration.sql")
        cls.overlay = committed_text(overlays[0])
        cls.overlay_name = overlays[0].stem

    def test_every_create_table_states_innodb_and_binary_collation(self):
        for label, sql in (("migration", self.migration), ("overlay", self.overlay)):
            statements = create_tables(sql)
            self.assertEqual(len(re.findall(r"(?m)^CREATE TABLE", sql)), len(statements), label)
            self.assertEqual([name for name, _, _ in statements if name in TABLES], [name for name, _, _ in statements], label)
            self.assertEqual(sorted(name for name, _, _ in statements), sorted(TABLES), label)
            for name, _, options in statements:
                self.assertEqual(options, TABLE_OPTIONS, f"{label} {name}")
            self.assertNotRegex(sql, r"(?i)\bENGINE\s*=\s*'?(?!InnoDB\b)\w", label)

    def test_overlay_matches_the_migration_it_records(self):
        self.assertEqual(self.overlay_name, self.name)
        migration_tables = {name: body for name, body, _ in create_tables(self.migration)}
        for name, body, _ in create_tables(self.overlay):
            # The overlay keeps the migration's columns and keys line for line and adds the foreign keys and checks inline.
            self.assertTrue(body.startswith(migration_tables[name].rstrip()), name)
        for constraint in re.findall(r"ADD CONSTRAINT `(\w+)`", self.migration):
            self.assertEqual(self.overlay.count(f"CONSTRAINT `{constraint}`"), 1, constraint)
        checksum = hashlib.sha256(self.migration.encode("utf-8")).hexdigest()
        self.assertIn(f"''{checksum}''", self.overlay, "the record carries the SHA-256 of the committed migration.sql")
        self.assertEqual(self.overlay.count(f"''{self.name}''"), 2, "the insert names the migration and skips a second run")

    def test_overlay_runs_its_guard_first_and_records_only_after_verifying(self):
        guard = self.overlay.index("BEGIN NOT ATOMIC")
        first_table = re.search(r"(?m)^CREATE TABLE", self.overlay).start()
        verification = self.overlay.index("BEGIN NOT ATOMIC", guard + 1)
        record = self.overlay.index("INSERT INTO _prisma_migrations")
        closing = self.overlay.index("-- 5. Closing check")
        self.assertLess(guard, first_table)
        self.assertLess(first_table, verification)
        self.assertLess(verification, record)
        self.assertLess(record, closing)
        self.assertEqual(self.overlay.count("DELIMITER //"), 2)
        self.assertEqual(self.overlay.count("DELIMITER ;"), 2)
        self.assertEqual(self.overlay.count("SIGNAL SQLSTATE '45000'"), 2)
        guard_block = self.overlay[guard:first_table]
        self.assertIn("COALESCE(ENGINE, '') <> 'InnoDB'", guard_block)
        for table in TABLES:
            self.assertIn(f"'{table}'", guard_block, table)
        self.assertEqual(len(re.findall(r"(?m)^CREATE TABLE IF NOT EXISTS `", self.overlay)), len(TABLES))
        self.assertNotRegex(self.overlay, r"(?im)^\s*(DROP|ALTER|DELETE|TRUNCATE|RENAME|UPDATE)\b", "it touches no existing table")
        closing_check = self.overlay[closing:]
        for needle in ("ENGINE", "TABLE_COLLATION", "REFERENTIAL_CONSTRAINTS"):
            self.assertIn(needle, closing_check)
        foreign_keys = self.migration.count("FOREIGN KEY")
        self.assertEqual(self.overlay.count("FOREIGN KEY"), foreign_keys)
        self.assertIn(f"foreign_keys = {foreign_keys}", closing_check)
        self.assertIn(f"<> {foreign_keys}", self.overlay[verification:record])

    def test_every_paid_access_model_has_a_privacy_comment(self):
        schema = committed_text(ROOT / "prisma/schema.prisma")
        self.assertEqual(schema, committed_text(ROOT / "prisma/schema.snapshot.prisma"), "migration and snapshot are committed together")
        for table in TABLES:
            preceding = schema[:schema.index(f"\nmodel {table} {{")].rsplit("\n}", 1)[-1]
            self.assertRegex(preceding, r"\n// \S", table)


if __name__ == "__main__":
    unittest.main()
