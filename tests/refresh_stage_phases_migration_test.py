"""Static checks for the refresh stage phases migration and its MariaDB overlay.

The overlay must make exactly what the migration makes (the same single ALTER that swaps the stage check for its superset),
use DROP CONSTRAINT rather than the MySQL-only DROP CHECK, guard before changing anything, verify before recording, and
record the committed migration's SHA-256 once.
"""
import hashlib
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
NAME = "20261025200000_refresh_stage_phases"
PREVIOUS = "20261009153335_prediction_refresh_worker"
DDL = re.compile(r"(?ms)^(ALTER TABLE .*?;)\s*$")
PHASES = ("preparation", "evidence", "evidence-empty", "ai", "fallback", "observation")


def committed_text(path):
    """The file as git stores it: LF line endings, whatever the checkout uses."""
    return path.read_bytes().decode("utf-8").replace("\r\n", "\n")


def statements(sql):
    """Each DDL statement, without comments and with whitespace collapsed."""
    code = "\n".join(line for line in sql.split("\n") if not line.lstrip().startswith("--"))
    return [re.sub(r"\s+", " ", statement) for statement in DDL.findall(code)]


class RefreshStagePhasesMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.migration = committed_text(ROOT / "prisma/migrations" / NAME / "migration.sql")
        cls.overlay = committed_text(ROOT / "prisma/mariadb" / f"{NAME}.sql")
        cls.original = committed_text(ROOT / "prisma/migrations" / PREVIOUS / "migration.sql")

    def test_overlay_applies_the_same_single_alter(self):
        migration, overlay = statements(self.migration), statements(self.overlay)
        self.assertEqual(len(migration), 1)
        self.assertEqual(overlay, migration)
        self.assertIn("DROP CONSTRAINT PredictionRefreshStage_shape,", migration[0])
        self.assertIn("ADD CONSTRAINT PredictionRefreshStage_shape_v2 CHECK", migration[0])
        self.assertNotIn("DROP CHECK", self.migration + self.overlay, "DROP CONSTRAINT works on MySQL and MariaDB")

    def test_check_is_a_superset_that_keeps_every_original_binding(self):
        phases = re.search(r"phase IN \(([^)]*)\)", self.migration).group(1)
        self.assertEqual(tuple(re.findall(r"'([^']+)'", phases)), PHASES)
        original = re.search(r"PredictionRefreshStage_shape CHECK \(COALESCE\((.*?), FALSE\) = TRUE\);", self.original, re.S).group(1)
        for binding in re.findall(r"AND (.*)", original):
            self.assertIn(binding.strip(), self.migration)
        self.assertIn("kind IN ('started','completed')", self.migration)

    def test_overlay_guards_first_and_records_only_after_verifying(self):
        guard = self.overlay.index("BEGIN NOT ATOMIC")
        first_change = self.overlay.index("ALTER TABLE")
        verification = self.overlay.index("BEGIN NOT ATOMIC", guard + 1)
        record = self.overlay.index("INSERT INTO _prisma_migrations")
        closing = self.overlay.index("-- 5. Closing check")
        self.assertLess(guard, first_change)
        self.assertLess(first_change, verification)
        self.assertLess(verification, record)
        self.assertLess(record, closing)
        self.assertIn(f"migration_name = '{PREVIOUS}'", self.overlay[guard:first_change])
        self.assertIn(f"migration_name = '{NAME}'", self.overlay[guard:first_change])
        self.assertIn("CONSTRAINT_NAME = 'PredictionRefreshStage_shape'", self.overlay[guard:first_change])
        self.assertIn("CHECK_CLAUSE LIKE '%evidence-empty%'", self.overlay[verification:record])
        self.assertEqual(self.overlay.count("DELIMITER //"), 2)
        self.assertEqual(self.overlay.count("DELIMITER ;"), 2)

    def test_overlay_records_the_committed_checksum_once(self):
        checksum = hashlib.sha256(self.migration.encode("utf-8")).hexdigest()
        self.assertIn(f"''{checksum}''", self.overlay, "the record carries the SHA-256 of the committed migration.sql")
        self.assertEqual(self.overlay.count(f"''{NAME}''"), 2, "the insert names the migration and skips a second run")


if __name__ == "__main__":
    unittest.main()
