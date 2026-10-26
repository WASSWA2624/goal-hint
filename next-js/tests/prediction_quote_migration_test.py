"""Static checks for the prediction quote migration and its MariaDB overlay.

The overlay must make exactly what the migration makes (the same DDL statements and the same two trigger bodies), guard
before changing anything, verify before recording, and record the committed migration's SHA-256 once. The table has no
foreign key to the private odds snapshots, so a later reviewed snapshot purge is not blocked by captured quotes.
"""
import hashlib
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
NAME = "20261025180538_prediction_quotes"
PREVIOUS = "20261025171000_provider_workload_budget"
TRIGGER = re.compile(r"CREATE (?:OR REPLACE )?TRIGGER (\w+) (BEFORE|AFTER) (INSERT|UPDATE|DELETE) ON (\w+) FOR EACH ROW\n(.*?\nEND)(?:;| //)", re.S)
DDL = re.compile(r"(?ms)^((?:ALTER TABLE|CREATE TABLE|CREATE (?:UNIQUE )?INDEX) .*?;)\s*$")


def committed_text(path):
    """The file as git stores it: LF line endings, whatever the checkout uses."""
    return path.read_bytes().decode("utf-8").replace("\r\n", "\n")


def statements(sql):
    """Each DDL statement, without comments and with whitespace collapsed."""
    code = "\n".join(line for line in sql.split("\n") if not line.lstrip().startswith("--"))
    return [re.sub(r"\s+", " ", statement) for statement in DDL.findall(code)]


class PredictionQuoteMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.migration = committed_text(ROOT / "prisma/migrations" / NAME / "migration.sql")
        cls.overlay = committed_text(ROOT / "prisma/mariadb" / f"{NAME}.sql")

    def test_migration_follows_its_predecessor(self):
        names = sorted(path.parent.name for path in (ROOT / "prisma/migrations").glob("*/migration.sql"))
        self.assertIn(PREVIOUS, names)
        self.assertLess(names.index(PREVIOUS), names.index(NAME))

    def test_overlay_applies_the_same_schema(self):
        migration, overlay = statements(self.migration), statements(self.overlay)
        self.assertEqual(len(migration), 5, "one table, one foreign key and three checks")
        self.assertEqual(overlay, migration)
        self.assertIn("ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin", self.migration)
        self.assertIn("ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin", self.overlay)
        self.assertNotIn("ProviderOddsSnapshot", "\n".join(migration), "snapshotId is provenance only, never a foreign key")
        for name in ("PredictionQuote_identity_check", "PredictionQuote_state_check", "PredictionQuote_body_check"):
            check = next(statement for statement in migration if name in statement)
            self.assertRegex(check, r"CHECK \(COALESCE\(.*, FALSE\) = TRUE\);$", f"{name} is NULL-safe")

    def test_triggers_are_blocks_and_the_overlay_recreates_them(self):
        migration = {name: rest for name, *rest in TRIGGER.findall(self.migration)}
        overlay = {name: rest for name, *rest in TRIGGER.findall(self.overlay)}
        self.assertEqual(set(migration), {"PredictionQuote_no_update", "PredictionQuote_no_delete"})
        for timing, event, table, body in migration.values():
            self.assertEqual((timing, table), ("BEFORE", "PredictionQuote"))
            self.assertIn(event, ("UPDATE", "DELETE"))
            self.assertRegex(body, r"\ABEGIN\n  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Prediction quotes are append-only';\nEND\Z")
        self.assertEqual(overlay, migration)
        self.assertEqual(len(re.findall(r"(?m)^CREATE OR REPLACE TRIGGER ", self.overlay)), 2)

    def test_overlay_guards_first_and_records_only_after_verifying(self):
        guard = self.overlay.index("BEGIN NOT ATOMIC")
        first_change = self.overlay.index("CREATE TABLE")
        verification = self.overlay.index("BEGIN NOT ATOMIC", guard + 1)
        record = self.overlay.index("INSERT INTO _prisma_migrations")
        closing = self.overlay.index("-- 6. Closing check")
        self.assertLess(guard, first_change)
        self.assertLess(self.overlay.index("CREATE OR REPLACE TRIGGER"), verification)
        self.assertLess(verification, record)
        self.assertLess(record, closing)
        self.assertIn(f"migration_name = '{PREVIOUS}'", self.overlay[guard:first_change])
        self.assertIn(f"migration_name = '{NAME}'", self.overlay[guard:first_change])
        self.assertIn("<> 3", self.overlay[verification:record])
        self.assertIn("<> 2 THEN", self.overlay[verification:record])
        self.assertEqual(self.overlay.count("DELIMITER //"), 2)
        self.assertEqual(self.overlay.count("DELIMITER ;"), 2)
        self.assertNotRegex(self.overlay, r"(?im)^\s*(DROP|DELETE|TRUNCATE|RENAME|UPDATE)\b", "it only adds the new table")

    def test_overlay_records_the_committed_checksum_once(self):
        checksum = hashlib.sha256(self.migration.encode("utf-8")).hexdigest()
        self.assertIn(f"''{checksum}''", self.overlay, "the record carries the SHA-256 of the committed migration.sql")
        self.assertEqual(self.overlay.count(f"''{NAME}''"), 2, "the insert names the migration and skips a second run")


if __name__ == "__main__":
    unittest.main()
