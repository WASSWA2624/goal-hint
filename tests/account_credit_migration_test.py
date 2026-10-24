"""Static checks for the account credit migration and its MariaDB overlay.

The overlay must make exactly what the migration makes (the same DDL statements and the same three trigger bodies), guard
before changing anything, verify before recording, and record the committed migration's SHA-256 once.
"""
import hashlib
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
NAME = "20261024210000_account_credit"
PREVIOUS = "20261024200000_payment_screenshot_amount"
TRIGGER = re.compile(r"CREATE (?:OR REPLACE )?TRIGGER (\w+) (BEFORE|AFTER) (INSERT|UPDATE|DELETE) ON (\w+) FOR EACH ROW\n(.*?\nEND)(?:;| //)", re.S)
DDL = re.compile(r"(?ms)^((?:ALTER TABLE|CREATE TABLE|CREATE (?:UNIQUE )?INDEX) .*?;)\s*$")


def committed_text(path):
    """The file as git stores it: LF line endings, whatever the checkout uses."""
    return path.read_bytes().decode("utf-8").replace("\r\n", "\n")


def statements(sql):
    """Each DDL statement, without comments and with whitespace collapsed."""
    code = "\n".join(line for line in sql.split("\n") if not line.lstrip().startswith("--"))
    return [re.sub(r"\s+", " ", statement) for statement in DDL.findall(code)]


class AccountCreditMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.migration = committed_text(ROOT / "prisma/migrations" / NAME / "migration.sql")
        cls.overlay = committed_text(ROOT / "prisma/mariadb" / f"{NAME}.sql")

    def test_overlay_applies_the_same_schema(self):
        migration, overlay = statements(self.migration), statements(self.overlay)
        self.assertGreater(len(migration), 10)
        self.assertEqual(overlay, migration)
        self.assertIn("ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin", self.overlay)
        self.assertFalse([statement for statement in migration if "DROP CHECK" in statement], "DROP CONSTRAINT works on MySQL and MariaDB")

    def test_overlay_recreates_the_same_triggers(self):
        migration = {name: rest for name, *rest in TRIGGER.findall(self.migration)}
        overlay = {name: rest for name, *rest in TRIGGER.findall(self.overlay)}
        self.assertEqual(set(migration), {"WalletEntry_no_update", "WalletEntry_no_delete", "WalletEntry_links", "AccountMove_no_update", "AccountMove_no_delete"})
        self.assertEqual(overlay, migration)
        self.assertEqual(len(re.findall(r"(?m)^CREATE OR REPLACE TRIGGER ", self.overlay)), 5)

    def test_overlay_guards_first_and_records_only_after_verifying(self):
        guard = self.overlay.index("BEGIN NOT ATOMIC")
        first_change = self.overlay.index("ALTER TABLE")
        verification = self.overlay.index("BEGIN NOT ATOMIC", guard + 1)
        record = self.overlay.index("INSERT INTO _prisma_migrations")
        closing = self.overlay.index("-- 6. Closing check")
        self.assertLess(guard, first_change)
        self.assertLess(self.overlay.index("CREATE OR REPLACE TRIGGER"), verification)
        self.assertLess(verification, record)
        self.assertLess(record, closing)
        self.assertIn(f"migration_name = '{PREVIOUS}'", self.overlay[guard:first_change])
        self.assertIn(f"migration_name = '{NAME}'", self.overlay[guard:first_change])
        self.assertEqual(self.overlay.count("DELIMITER //"), 2)
        self.assertEqual(self.overlay.count("DELIMITER ;"), 2)

    def test_overlay_records_the_committed_checksum_once(self):
        checksum = hashlib.sha256(self.migration.encode("utf-8")).hexdigest()
        self.assertIn(f"''{checksum}''", self.overlay, "the record carries the SHA-256 of the committed migration.sql")
        self.assertEqual(self.overlay.count(f"''{NAME}''"), 2, "the insert names the migration and skips a second run")


if __name__ == "__main__":
    unittest.main()
