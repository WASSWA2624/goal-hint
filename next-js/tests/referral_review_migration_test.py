"""Review history, exact ledger uniqueness and the controlled MariaDB overlay stay explicit."""
import hashlib
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
NAME = "20261031135652_referral_review"


class ReferralReviewMigrationTests(unittest.TestCase):
    def test_accounting_identity_and_history_guards(self):
        sql = (ROOT / "prisma/migrations" / NAME / "migration.sql").read_text()
        for table in ["ReferralReviewCase", "ReferralReviewEvidence", "ReferralReviewEvent", "ReferralGrantReversal"]:
            self.assertIn(f"CREATE TABLE `{table}`", sql)
        self.assertIn("PRIMARY KEY (`grantId`)", sql)
        self.assertIn("UNIQUE INDEX `ReferralGrantReversal_caseId_key`", sql)
        self.assertIn("UNIQUE INDEX `ReferralGrantReversal_restoredGrantId_key`", sql)
        self.assertIn("ReferralReviewEvent_no_update", sql)
        self.assertIn("ReferralReviewEvent_no_delete", sql)
        self.assertIn("ReferralGrantReversal_identity", sql)
        self.assertIn("TIMESTAMPDIFF(MICROSECOND,GREATEST(c.startsAt,NEW.appliedAt),c.endsAt)", sql)
        self.assertIn("c.accountId=NEW.holderAccountId", sql)
        self.assertIn("ReferralReviewEvidence_shape_check", sql)
        self.assertIn("ReferralReviewCase_closedAt_idx", sql)
        self.assertEqual((ROOT / "prisma/schema.prisma").read_text(), (ROOT / "prisma/schema.snapshot.prisma").read_text())

    def test_overlay_checksum_and_application_grants(self):
        source = (ROOT / "prisma/migrations" / NAME / "migration.sql").read_bytes()
        overlay = (ROOT / "prisma/mariadb" / f"{NAME}.sql").read_text()
        self.assertIn(hashlib.sha256(source).hexdigest(), overlay)
        self.assertIn("DROP CONSTRAINT MemberNotification_shape_check", overlay)
        self.assertIn("already or partly installed", overlay)
        self.assertIn("DELIMITER //", overlay)
        grants = (ROOT / "docs/deployment/referral-review-grants.sql").read_text()
        self.assertIn("GRANT SELECT, INSERT ON goal_hint.ReferralReviewEvent", grants)
        self.assertNotIn("DELETE", "\n".join(line for line in grants.splitlines() if not line.startswith("--")))


if __name__ == "__main__":
    unittest.main()
