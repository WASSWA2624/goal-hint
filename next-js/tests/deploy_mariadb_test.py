"""Hosted migration inventory, safety, and pre-activation exit behavior."""

from contextlib import redirect_stdout
from dataclasses import replace
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

    def test_local_goal_extension_overlay_preserves_the_seal_and_validates_models(self):
        name = "20261120140000_local_goal_extension_shape"
        migration = next(row for row in self.migrations if row.name == name)
        sql = migration.sql.replace(b"\r\n", b"\n")
        overlay = migration.overlay.replace(b"\r\n", b"\n")
        self.assertIn(sql, overlay)
        alter = overlay.index(b"ALTER TABLE GoalMarketExtension")
        guard = overlay[:alter]
        verification = overlay[alter + len(sql):]
        self.assertIn(b"20261113140000_expand_local_goal_markets", guard)
        self.assertIn(b"GoalMarketExtension_shape_v2", guard)
        self.assertNotIn(b"DROP CONSTRAINT GoalMarketExtension_seal", sql)
        self.assertIn(b"GoalMarketExtension_seal", verification)
        self.assertLess(verification.index(b"SIGNAL SQLSTATE"), verification.index(b"INSERT INTO _prisma_migrations"))
        self.assertIn(migration.checksum.encode(), verification)
        for name in (b"scoreDistribution", b"localPoisson"):
            self.assertIn(b"JSON_TYPE(JSON_EXTRACT(body, '$." + name + b"')) = 'OBJECT'", sql)
            self.assertIn(b"JSON_CONTAINS_PATH(body, 'one', '$." + name + b"') = 0", sql)

    def test_ledger_rejects_gaps_incomplete_duplicate_and_edited_migrations(self):
        first, second = self.migrations[:2]
        cases = [[ledger_entry(second)], [ledger_entry(first)] * 2,
                 [f"{first.name}\t{first.checksum}\t0\t0"], [f"{first.name}\t{'0' * 64}\t1\t0"]]
        for entries in cases:
            with self.subTest(entries=entries), self.assertRaises(MigrationError):
                HOSTED["pending_migrations"](entries, self.migrations, self.adopted)

    def test_hosted_histories_apply_only_checksum_pinned_missing_migrations(self):
        checkout = HOSTED["FLUTTERWAVE_CHECKOUT"][0]
        hourly = HOSTED["HOURLY_FIXTURE_RECHECK"][0]
        freshness = HOSTED["VERIFIED_RESULT_FRESHNESS"][0]
        inventory = [migration for migration in self.migrations if migration.name <= freshness]
        baseline = [migration for migration in inventory if migration.name < checkout]
        by_name = {migration.name: migration for migration in inventory}
        histories = [
            ("staging", [checkout, freshness], [hourly]),
            ("production", [checkout, hourly, freshness], []),
            ("prior production", [hourly], [checkout, freshness]),
        ]
        for environment, completed, expected in histories:
            with self.subTest(environment=environment), redirect_stdout(io.StringIO()):
                existing = [ledger_entry(migration) for migration in baseline]
                existing.extend(ledger_entry(by_name[name]) for name in completed)
                database = MigrationDatabase(existing)
                self.assertEqual(HOSTED["migrate"](database, inventory, self.adopted, False), 0)
                self.assertEqual(database.applied, expected)
                self.assertEqual(database.ledger(), existing + [ledger_entry(by_name[name]) for name in expected])

    def test_hosted_gap_still_rejects_edited_inventory_and_other_gaps(self):
        checkout = HOSTED["FLUTTERWAVE_CHECKOUT"][0]
        hourly = HOSTED["HOURLY_FIXTURE_RECHECK"][0]
        freshness = HOSTED["VERIFIED_RESULT_FRESHNESS"][0]
        baseline = [migration for migration in self.migrations if migration.name < checkout]
        historical = {migration.name: migration for migration in self.migrations if checkout <= migration.name <= freshness}
        original = [*baseline, historical[checkout], historical[hourly], historical[freshness]]
        edited_checkout = replace(historical[checkout], checksum="0" * 64, compatible_checksums=frozenset({"0" * 64}))
        edited = [*baseline, edited_checkout, historical[hourly], historical[freshness]]
        completed = [ledger_entry(migration) for migration in baseline]
        hourly_entry, freshness_entry = ledger_entry(historical[hourly]), ledger_entry(historical[freshness])
        cases = [
            (completed[1:] + [hourly_entry], original),
            (completed + [hourly_entry, freshness_entry], original),
            (completed + [hourly_entry], edited),
        ]
        for ledger, migrations in cases:
            with self.subTest(ledger=ledger[-2:]), self.assertRaisesRegex(MigrationError, "gap before"):
                HOSTED["pending_migrations"](ledger, migrations, self.adopted)

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
