"""Capacity migration preserves original publication bindings and matches its MariaDB overlay."""
import hashlib
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
NAME = "20261028130000_daily_slip_capacity"


class DailySlipCapacityMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.migration = (ROOT / "prisma/migrations" / NAME / "migration.sql").read_text()
        cls.overlay = (ROOT / "prisma/mariadb" / f"{NAME}.sql").read_text()

    def test_checks_are_replaced_in_place_with_matching_overlays(self):
        statements = lambda source: [re.sub(r"\s+", " ", value) for value in re.findall(r"(?ms)^(ALTER TABLE .*?;)\s*$", source)]
        self.assertEqual(statements(self.migration), statements(self.overlay))
        self.assertEqual(len(statements(self.migration)), 2)
        for table, check in (("PublishedSlip", "rank"), ("DailySlipPublication", "body")):
            self.assertIn(f"DROP CONSTRAINT {table}_{check}_shape,", self.migration)
            self.assertIn(f"ADD CONSTRAINT {table}_{check}_shape_v2 CHECK", self.migration)
        self.assertEqual(self.migration.count("BETWEEN 1 AND 100"), 2)
        self.assertIn("JSON_EXTRACT(bodyJson, '$.version') = 1", self.migration)
        self.assertIn("JSON_UNQUOTE(JSON_EXTRACT(bodyJson, '$.model.id')) = modelId", self.migration)
        self.assertIn("FALSE) = TRUE", self.migration)
        self.assertNotRegex(self.migration, r"(?im)^\s*(UPDATE|DELETE|TRUNCATE|DROP TABLE|DROP TRIGGER)\b")

    def test_overlay_guards_then_verifies_before_recording_the_committed_checksum(self):
        guard = self.overlay.index("BEGIN NOT ATOMIC")
        change = self.overlay.index("ALTER TABLE")
        verification = self.overlay.index("BEGIN NOT ATOMIC", guard + 1)
        record = self.overlay.index("INSERT INTO _prisma_migrations")
        self.assertLess(guard, change)
        self.assertLess(change, verification)
        self.assertLess(verification, record)
        self.assertIn("20261025113516_daily_slip_publications", self.overlay[guard:change])
        self.assertIn("CHECK_CLAUSE LIKE '%100%'", self.overlay[verification:record])
        checksum = hashlib.sha256(self.migration.encode("utf-8")).hexdigest()
        self.assertIn(f"''{checksum}''", self.overlay)
        self.assertEqual(self.overlay.count(f"''{NAME}''"), 2)


if __name__ == "__main__":
    unittest.main()
