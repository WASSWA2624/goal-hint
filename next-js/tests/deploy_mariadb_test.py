"""Hosted migration inventory, safety, and pre-activation exit behavior."""

from contextlib import redirect_stderr, redirect_stdout
from dataclasses import replace
import io
from pathlib import Path
import runpy
import unittest
from unittest.mock import patch


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
        self.hosted_branch_migrations = [
            migration for migration in self.migrations
            if HOSTED["FLUTTERWAVE_CHECKOUT"][0] <= migration.name <= HOSTED["VERIFIED_RESULT_FRESHNESS"][0]
        ]
        self.hosted_branch_baseline = [
            migration for migration in self.migrations if migration.name < HOSTED["FLUTTERWAVE_CHECKOUT"][0]
        ]

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

    def test_hosted_branches_apply_only_each_others_missing_migrations(self):
        flutterwave, hourly, freshness = self.hosted_branch_migrations
        inventory = self.hosted_branch_baseline + self.hosted_branch_migrations
        baseline = [ledger_entry(migration) for migration in self.hosted_branch_baseline]
        histories = [
            ("production", [hourly], [flutterwave, freshness]),
            ("staging", [flutterwave, freshness], [hourly]),
        ]
        for environment, completed, expected in histories:
            with self.subTest(environment=environment), redirect_stdout(io.StringIO()):
                starting_ledger = baseline + [ledger_entry(migration) for migration in completed]
                db = MigrationDatabase(starting_ledger)
                self.assertEqual(HOSTED["pending_migrations"](db.ledger(), inventory, self.adopted), expected)
                self.assertEqual(HOSTED["migrate"](db, inventory, self.adopted, False), 0)
                self.assertEqual(db.applied, [migration.name for migration in expected])
                self.assertEqual(db.ledger(), starting_ledger + [ledger_entry(migration) for migration in expected])

    def test_hosted_branch_exception_rejects_other_gaps_and_edited_inventory(self):
        flutterwave, hourly, freshness = self.hosted_branch_migrations
        inventory = self.hosted_branch_baseline + self.hosted_branch_migrations
        baseline = [ledger_entry(migration) for migration in self.hosted_branch_baseline]
        edited = replace(flutterwave, checksum="0" * 64, compatible_checksums=frozenset({"0" * 64}))
        cases = [
            (baseline[1:] + [ledger_entry(hourly)], inventory),
            (baseline + [ledger_entry(hourly), ledger_entry(freshness)], inventory),
            (baseline + [ledger_entry(hourly)], [*self.hosted_branch_baseline, edited, hourly, freshness]),
        ]
        for ledger, migrations in cases:
            with self.subTest(ledger=ledger[-2:]), self.assertRaisesRegex(MigrationError, "gap before"):
                HOSTED["pending_migrations"](ledger, migrations, self.adopted)

    def test_lock_wait_timeout_precedes_migration_sql_on_same_connection(self):
        flutterwave, _, freshness = self.hosted_branch_migrations
        MariaDb = HOSTED["MariaDb"]
        with patch("shutil.which", return_value="mariadb"):
            db = MariaDb(Path("options.cnf"), "ghprod_prod", 3306, lock_wait_timeout=5)
        with patch.object(db, "execute") as execute:
            db.apply(flutterwave)
            execute.assert_called_once_with(b"SET SESSION lock_wait_timeout = 5;\n" + flutterwave.overlay, flutterwave.name)
            execute.reset_mock()
            db.apply(freshness)
            execute.assert_called_once()
            sql, label = execute.call_args.args
            self.assertTrue(sql.startswith(b"SET SESSION lock_wait_timeout = 5;\nINSERT INTO _prisma_migrations"))
            self.assertEqual(label, freshness.name)

    def test_lock_wait_timeout_is_bounded(self):
        for timeout in ("-1", "0", "61"):
            with self.subTest(timeout=timeout), redirect_stderr(io.StringIO()) as output:
                self.assertEqual(HOSTED["main"]([
                    "--environment", "production", "--database", "ghprod_prod", "--defaults-file", "missing.cnf",
                    "--lock-wait-timeout", timeout,
                ]), 1)
                self.assertIn("Migration lock wait must be between 1 and 60 seconds.", output.getvalue())

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
