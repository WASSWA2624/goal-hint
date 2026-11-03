"""Readable references preserve legacy identities and transport leading zeros as strings."""
import hashlib
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
NAME = "20261103160000_readable_slip_and_referral_codes"


class ReadableCodeMigrationTests(unittest.TestCase):
    def test_migration_and_overlay_preserve_original_links(self):
        sql = (ROOT / "prisma/migrations" / NAME / "migration.sql").read_text(encoding="utf-8")
        overlay = (ROOT / "prisma/mariadb" / f"{NAME}.sql").read_text(encoding="utf-8")
        self.assertIn("legacyReferralCode=referralCode", sql)
        self.assertIn("UNIQUE INDEX MemberAccount_legacyReferralCode_key", sql)
        self.assertIn("NEW.number < 1 OR NEW.number > 99999999", sql)
        self.assertIn("CREATE TRIGGER SlipNumber_capacity AFTER INSERT", sql)
        self.assertIn("UNIQUE INDEX SlipNumber_fingerprint_key", sql)
        self.assertIn("ENGINE=InnoDB", sql)
        self.assertIn(hashlib.sha256(sql.encode("utf-8")).hexdigest(), overlay)
        for field in ("accountId", "snapshotJson", "selections"):
            self.assertNotIn(field, sql.split("CREATE TABLE SlipNumber", 1)[1])
        transient = (ROOT / "prisma/migrations/20261103120000_transient_slips_and_odds_bands/migration.sql").read_text(encoding="utf-8")
        self.assertNotIn("DELETE FROM SharedSlip", transient)
        self.assertNotIn("DROP COLUMN snapshotJson", transient)
        self.assertNotIn("DROP TRIGGER IF EXISTS SharedSlip_no_delete", transient)
