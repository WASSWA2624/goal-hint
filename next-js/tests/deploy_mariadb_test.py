"""Hosted migration inventory, safety, and pre-activation exit behavior."""

from contextlib import redirect_stdout
import io
from pathlib import Path
import runpy
import unittest


ROOT = Path(__file__).resolve().parents[1]
HOSTED = runpy.run_path(str(ROOT / "scripts/deploy-mariadb.py"))
MigrationError = HOSTED["MigrationError"]


class MigrationDatabase:
    def __init__(self, rows=(), fail=None):
        self.rows = list(rows)
        self.fail = fail
        self.applied = []

    def verify_target(self):
        pass

    def ledger(self):
        return self.rows

    def apply(self, migration):
        self.applied.append(migration.name)
        if self.fail != migration.name:
            self.rows.append(ledger_entry(migration))


def ledger_entry(migration):
    return f"{migration.name}\t{migration.checksum}\t1\t0"


class DeployMariaDbTests(unittest.TestCase):
    def setUp(self):
        self.migrations, self.adopted = HOSTED["release_migrations"](ROOT / "prisma")

    def test_release_overlays_verify_original_migration_checksums(self):
        self.assertGreater(len(self.migrations), 2)
        self.assertGreater(sum(row.overlay is not None for row in self.migrations), 1)
        durable = next(row for row in self.migrations if row.name == HOSTED["FOLLOWUP"])
        self.assertIn(b"DROP CONSTRAINT", durable.followup)
        sql = b"ALTER TABLE `Foo` DROP CHECK `old`;\nALTER TABLE `Bar`\n  DROP CHECK named,\n  ADD CONSTRAINT untouched CHECK (1);"
        result = HOSTED["canonical_sql"](sql)
        self.assertIn(b"ALTER TABLE `Foo` DROP CONSTRAINT `old`;", result)
        self.assertIn(b"DROP CONSTRAINT named", result)
        self.assertIn(b"ADD CONSTRAINT untouched CHECK (1)", result)

    def test_ledger_rejects_gaps_incomplete_duplicate_and_edited_migrations(self):
        first, second = self.migrations[:2]
        cases = [[ledger_entry(second)], [ledger_entry(first)] * 2,
                 [f"{first.name}\t{first.checksum}\t0\t0"], [f"{first.name}\t{'0' * 64}\t1\t0"]]
        for entries in cases:
            with self.subTest(entries=entries), self.assertRaises(MigrationError):
                HOSTED["pending_migrations"](entries, self.migrations, self.adopted)

    def test_recognized_adopted_history_does_not_replace_canonical_adoption(self):
        name, (digest, adoption) = next(iter(self.adopted.items()))
        pending = HOSTED["pending_migrations"]([f"{name}\t{digest}\t1\t0"], self.migrations, self.adopted)
        self.assertIn(adoption, [row.name for row in pending])

    def test_status_and_apply_respect_target_ledger(self):
        first, second = self.migrations[-2:]
        current = [ledger_entry(row) for row in self.migrations[:-2]]
        db = MigrationDatabase(current)
        with redirect_stdout(io.StringIO()) as output:
            self.assertEqual(HOSTED["migrate"](db, self.migrations, self.adopted, True), 2)
        self.assertIn(f"Pending {first.name}", output.getvalue())
        self.assertEqual(db.applied, [])
        with redirect_stdout(io.StringIO()):
            self.assertEqual(HOSTED["migrate"](db, self.migrations, self.adopted, False), 0)
            self.assertEqual(HOSTED["migrate"](db, self.migrations, self.adopted, True), 0)
        self.assertEqual(db.applied, [first.name, second.name])

    def test_first_unrecorded_migration_stops_release(self):
        current = [ledger_entry(row) for row in self.migrations[:-2]]
        first = self.migrations[-2]
        db = MigrationDatabase(current, fail=first.name)
        with self.assertRaises(MigrationError):
            HOSTED["migrate"](db, self.migrations, self.adopted, False)
        self.assertEqual(db.applied, [first.name])

    def test_rejects_cross_environment_schema_before_opening_credentials(self):
        for environment, database in [("production", "ghstage_localcopy"), ("staging", "ghprod_prod"), ("staging", "ghstage_x;SQL")]:
            with self.subTest(environment=environment, database=database), self.assertRaisesRegex(MigrationError, "selected environment"):
                HOSTED["target_options"](environment, database, Path("missing.cnf"))


if __name__ == "__main__":
    unittest.main()
