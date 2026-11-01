import hashlib
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
NAME = "20261101120000_payment_checkout"

class CheckoutMigrationTest(unittest.TestCase):
    def test_mariadb_overlay_records_the_exact_canonical_checksum_after_verification(self):
        canonical = ROOT / "prisma" / "migrations" / NAME / "migration.sql"
        overlay = (ROOT / "prisma" / "mariadb" / f"{NAME}.sql").read_text(encoding="utf-8")
        self.assertIn(hashlib.sha256(canonical.read_bytes()).hexdigest(), overlay)
        self.assertLess(overlay.index("verification failed"), overlay.index("INSERT INTO _prisma_migrations"))
        self.assertIn("already or partly installed", overlay)

    def test_legacy_identity_evidence_and_offers_are_preserved(self):
        sql = (ROOT / "prisma" / "migrations" / NAME / "migration.sql").read_text(encoding="utf-8")
        self.assertIn("INSERT INTO PaymentReceiptClaim", sql)
        self.assertIn("COUNT(DISTINCT p.accountId) > 1", sql)
        self.assertIn("'legacy_import'", sql)
        self.assertNotIn("DROP TABLE", sql)
        self.assertNotIn("DELETE FROM MemberAccount", sql)
        self.assertNotRegex(sql, r"SET\s+(?:p\.)?(?:priceUgx|durationDays|reference)\s*=")

    def test_accounting_roles_are_append_only(self):
        grants = (ROOT / "docs" / "deployment" / "payment-checkout-grants.sql").read_text(encoding="utf-8")
        for table in ["ReferralCredit", "PaymentEvent"]:
            statement = next(line for line in grants.splitlines() if f"`{table}`" in line)
            self.assertIn("GRANT SELECT, INSERT ON", statement)
            self.assertNotIn("UPDATE", statement)
            self.assertNotIn("DELETE", statement)

if __name__ == "__main__":
    unittest.main()
