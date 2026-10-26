"""Static checks for the append-only trigger repair and its MariaDB overlay.

Prisma applies a migration as one multi-statement script, so MySQL stores a single-statement trigger body with its
closing `;`. mysqldump then writes `/*!50003 ... ; */;;`, which the mysql client rejects (ERROR 1064), so a backup of
the database cannot be restored. Trigger bodies must be BEGIN ... END blocks, which end at END.
"""
import hashlib
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
ORIGINAL = "20261012153531_goal_market_extension"
REPAIR = "20261019174619_append_only_trigger_blocks"
# The body starts after any whitespace, so a single-line `... FOR EACH ROW SIGNAL ...;` is caught as well as a
# body on the next line. Names may be backquoted.
TRIGGER = re.compile(r"CREATE (?:OR REPLACE )?TRIGGER `?(\w+)`? (BEFORE|AFTER) (INSERT|UPDATE|DELETE) ON `?(\w+)`? FOR EACH ROW\s+(.*?)(?=\nCREATE |\nDROP |\n\n|\Z)", re.S)
# Every CREATE TRIGGER statement, however it is written; TRIGGER must parse each one.
STATEMENT = re.compile(r"(?im)^[ \t]*CREATE\s+(?:OR\s+REPLACE\s+)?(?:DEFINER\s*=\s*\S+\s+)?TRIGGER\b")
BLOCK = re.compile(r"BEGIN\n  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '([^']+)';\nEND(?:;| //)")


def committed_text(path):
    """The file as git stores it: LF line endings, whatever the checkout uses."""
    return path.read_bytes().decode("utf-8").replace("\r\n", "\n")


def triggers(sql):
    return {name: (timing, event, table, body.strip()) for name, timing, event, table, body in TRIGGER.findall(sql)}


def migrations():
    return sorted((ROOT / "prisma/migrations").glob("*/migration.sql"))


class AppendOnlyTriggerMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original = committed_text(ROOT / "prisma/migrations" / ORIGINAL / "migration.sql")
        cls.migration = committed_text(ROOT / "prisma/migrations" / REPAIR / "migration.sql")
        cls.overlay = committed_text(ROOT / "prisma/mariadb" / f"{REPAIR}.sql")

    def test_the_repair_recreates_every_original_trigger_as_a_block(self):
        original = triggers(self.original)
        self.assertEqual(len(original), 10)
        repaired = triggers(self.migration)
        self.assertEqual(repaired.keys(), original.keys())
        for name, (timing, event, table, body) in original.items():
            message = re.fullmatch(r"SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '([^']+)';", body)[1]
            self.assertEqual(repaired[name][:3], (timing, event, table), name)
            self.assertEqual(BLOCK.fullmatch(repaired[name][3])[1], message, name)
            drop = self.migration.index(f"DROP TRIGGER IF EXISTS {name};\nCREATE TRIGGER {name} ")
            self.assertEqual(self.migration.count(f"DROP TRIGGER IF EXISTS {name};"), 1, name)
            self.assertLess(drop, self.migration.index(f"CREATE TRIGGER {name} "), name)
        self.assertNotRegex(self.migration, r"(?im)^\s*(ALTER|DELETE|TRUNCATE|RENAME|UPDATE|INSERT|CREATE TABLE)\b")

    def test_the_parser_sees_every_migration_trigger(self):
        seen = 0
        for path in migrations():
            sql = committed_text(path)
            self.assertEqual(len(TRIGGER.findall(sql)), len(STATEMENT.findall(sql)), path.parent.name)
            seen += len(STATEMENT.findall(sql))
        self.assertGreaterEqual(seen, 77)

    def test_no_later_migration_creates_a_single_statement_trigger(self):
        for path in migrations():
            if path.parent.name == ORIGINAL:
                continue
            for name, _, _, _, body in TRIGGER.findall(committed_text(path)):
                self.assertRegex(body.strip(), r"\ABEGIN\n[\s\S]*\nEND;\Z", f"{path.parent.name} {name}")

    def test_overlay_matches_the_migration_it_records(self):
        migration, overlay = triggers(self.migration), triggers(self.overlay)
        self.assertEqual(overlay.keys(), migration.keys())
        for name, (timing, event, table, body) in migration.items():
            self.assertEqual(overlay[name], (timing, event, table, body.removesuffix(";") + " //"), name)
        self.assertEqual(len(re.findall(r"(?m)^CREATE OR REPLACE TRIGGER ", self.overlay)), 10)
        checksum = hashlib.sha256(self.migration.encode("utf-8")).hexdigest()
        self.assertIn(f"''{checksum}''", self.overlay, "the record carries the SHA-256 of the committed migration.sql")
        self.assertEqual(self.overlay.count(f"''{REPAIR}''"), 2, "the insert names the migration and skips a second run")

    def test_overlay_guards_first_and_records_only_after_verifying(self):
        guard = self.overlay.index("BEGIN NOT ATOMIC")
        first_trigger = re.search(r"(?m)^CREATE OR REPLACE TRIGGER", self.overlay).start()
        verification = self.overlay.index("BEGIN NOT ATOMIC", guard + 1)
        record = self.overlay.index("INSERT INTO _prisma_migrations")
        closing = self.overlay.index("-- 5. Closing check")
        self.assertLess(guard, first_trigger)
        self.assertLess(first_trigger, verification)
        self.assertLess(verification, record)
        self.assertLess(record, closing)
        self.assertEqual(self.overlay.count("DELIMITER //"), 1)
        self.assertEqual(self.overlay.count("DELIMITER ;"), 1)
        self.assertLess(self.overlay.index("DELIMITER //"), guard)
        self.assertLess(verification, self.overlay.index("DELIMITER ;"))
        self.assertIn(f"migration_name = '{ORIGINAL}'", self.overlay[guard:first_trigger])
        self.assertIn("<> 10 THEN", self.overlay[verification:record])
        self.assertNotRegex(self.overlay, r"(?im)^\s*(DROP|ALTER|DELETE|TRUNCATE|RENAME|UPDATE|CREATE TABLE)\b", "it only replaces triggers")


if __name__ == "__main__":
    unittest.main()
