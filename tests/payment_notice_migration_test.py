"""The account-update SMS outbox stores delivery state only, and its migration stays portable between MySQL and MariaDB."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "prisma/migrations/20261025175119_payment_notice_outbox/migration.sql"


class PaymentNoticeMigrationTests(unittest.TestCase):
    def setUp(self):
        self.sql = MIGRATION.read_text(encoding="utf-8")

    def test_no_triggers_or_mysql_only_syntax(self):
        statements = " ".join(line for line in self.sql.splitlines() if not line.lstrip().startswith("--")).upper()
        for forbidden in ("DELIMITER", "TRIGGER", "DROP CHECK"):
            self.assertNotIn(forbidden, statements)

    def test_table_holds_no_phone_number_or_message_text(self):
        table = re.search(r"CREATE TABLE `PaymentNotice` \((.*?)\n\) (.*?);", self.sql, re.S)
        self.assertIsNotNone(table)
        columns = re.findall(r"^\s+`(\w+)` ", table.group(1), re.M)
        self.assertIn("accountId", columns)
        for column in columns:
            self.assertNotRegex(column.lower(), r"phone|message|text|body")
        self.assertEqual(table.group(2), "ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin")

    def test_check_names_every_state_kind_and_error_class_but_never_the_cascading_key(self):
        check = re.search(r"ADD CONSTRAINT `PaymentNotice_shape_check` CHECK \((.*?)\);", self.sql, re.S)
        self.assertIsNotNone(check)
        body = check.group(1)
        for value in ("approved", "rejected", "credited", "renewed", "pending", "sending", "accepted", "failed", "uncertain", "skipped",
                      "configuration", "unavailable", "unsupported", "invalid", "expired"):
            self.assertIn(f"'{value}'", body)
        self.assertNotIn("accountId", body)
        self.assertIn("ON DELETE CASCADE ON UPDATE RESTRICT", self.sql)

    def test_schema_model_matches_the_snapshot_and_has_no_text_columns(self):
        schema = (ROOT / "prisma/schema.prisma").read_text(encoding="utf-8")
        self.assertEqual(schema, (ROOT / "prisma/schema.snapshot.prisma").read_text(encoding="utf-8"))
        model = schema.split("model PaymentNotice {", 1)[1].split("\n}", 1)[0]
        self.assertIn("@@unique([targetId, kind])", model)
        self.assertNotRegex(model, r"(?i)\b\w*(phone|message|text)\w*\s+String")


if __name__ == "__main__":
    unittest.main()
