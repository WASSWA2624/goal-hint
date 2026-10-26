"""The consolidated account-update outbox stores no recipient or message payload."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "prisma/migrations/20261025230000_payment_notification_outbox/migration.sql"


class PaymentNoticeMigrationTests(unittest.TestCase):
    def setUp(self):
        self.sql = MIGRATION.read_text(encoding="utf-8")

    def test_portable_transactional_table_without_triggers(self):
        self.assertNotRegex(self.sql.upper(), r"\b(DELIMITER|TRIGGER|DROP CHECK)\b")
        self.assertIn("ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin", self.sql)
        self.assertIn("ON DELETE CASCADE ON UPDATE RESTRICT", self.sql)

    def test_no_recipient_or_message_columns(self):
        columns = re.findall(r"^\s+`(\w+)` ", self.sql, re.M)
        self.assertIn("accountId", columns)
        for column in columns:
            self.assertNotRegex(column.lower(), r"phone|message|text|body")

    def test_decisions_and_attempt_states_are_checked(self):
        for value in ("approved", "rejected", "credited", "renewed", "queued", "dispatching", "sent", "failed", "uncertain", "unsupported", "unavailable", "cancelled"):
            self.assertIn(f"'{value}'", self.sql)
        self.assertIn("`PaymentNotificationOutbox_state_check` CHECK", self.sql)
        self.assertIn("`PaymentNotificationOutbox_targetType_targetId_decision_key`", self.sql)

    def test_one_canonical_model_and_matching_snapshot(self):
        schema = (ROOT / "prisma/schema.prisma").read_text(encoding="utf-8")
        self.assertEqual(schema, (ROOT / "prisma/schema.snapshot.prisma").read_text(encoding="utf-8"))
        self.assertIn("model PaymentNotificationOutbox {", schema)
        self.assertNotIn("model PaymentNotice {", schema)
        self.assertFalse((ROOT / "prisma/migrations/20261025175119_payment_notice_outbox/migration.sql").exists())


if __name__ == "__main__":
    unittest.main()
