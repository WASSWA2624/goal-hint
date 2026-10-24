-- Production (MariaDB 11.4) apply script for migration 20261024210000_account_credit.
-- Adds account credit: MemberAccount's cached balance and auto-renewal, top-up reports on PaymentSubmission, credit and
-- renewal access periods, and the append-only WalletEntry ledger and AccountMove history with their checks and five triggers. It makes the same
-- tables, keys, checks and triggers as the committed migration.sql, which uses no MySQL-only syntax but needs the client's
-- block delimiter for its triggers. ADD COLUMN, CREATE TABLE and the CHECK rebuilds lock and copy MemberAccount,
-- PaymentSubmission and AccessCode, so stop the app and worker writes while this runs. The importing account becomes the
-- triggers' definer; keep it while the triggers are in use.
-- Take and verify a private backup first, then import this file with the migration account, with phpMyAdmin or:
--   mariadb <database> < this-file
-- Every step that fails stops the import before the migration is recorded. MariaDB DDL is not transactional: if a step
-- fails after the guard, restore the backup rather than importing again.

-- 1. Guard: the payment screenshot amount migration is applied, this one is not, and the tables it changes are InnoDB.
DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261024200000_payment_screenshot_amount'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Apply 20261024200000_payment_screenshot_amount first; nothing was imported.';
  END IF;
  IF (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261024210000_account_credit') <> 0
    OR (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('WalletEntry', 'AccountMove')) <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Account credit is already applied or partly applied; nothing was imported.';
  END IF;
  IF (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND ENGINE = 'InnoDB'
      AND TABLE_NAME IN ('MemberAccount', 'PaymentSubmission', 'AccessCode', 'SubscriptionPlan')) <> 4 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A member table is missing or not InnoDB; nothing was imported.';
  END IF;
END //
DELIMITER ;

-- 2. The schema, as in migration.sql.
ALTER TABLE `MemberAccount` ADD COLUMN `autoRenew` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `autoRenewPlanId` CHAR(36) NULL,
    ADD COLUMN `autoRenewTermsVersion` VARCHAR(16) NULL,
    ADD COLUMN `creditUgx` INTEGER NOT NULL DEFAULT 0;

ALTER TABLE `PaymentSubmission` ADD COLUMN `purpose` VARCHAR(8) NOT NULL DEFAULT 'plan',
    MODIFY `planId` CHAR(36) NULL,
    MODIFY `durationDays` SMALLINT UNSIGNED NULL;

CREATE TABLE `WalletEntry` (
    `id` CHAR(36) NOT NULL,
    `accountId` CHAR(36) NOT NULL,
    `entryNumber` INTEGER UNSIGNED NOT NULL,
    `kind` VARCHAR(12) NOT NULL,
    `amountUgx` INTEGER NOT NULL,
    `balanceAfter` INTEGER NOT NULL,
    `paymentSubmissionId` CHAR(36) NULL,
    `accessCodeId` CHAR(36) NULL,
    `requestKey` VARCHAR(80) NULL,
    `actor` VARCHAR(8) NOT NULL,
    `note` VARCHAR(200) NULL,
    `createdAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WalletEntry_requestKey_key`(`requestKey`),
    INDEX `WalletEntry_accountId_createdAt_idx`(`accountId`, `createdAt`),
    UNIQUE INDEX `WalletEntry_accountId_entryNumber_key`(`accountId`, `entryNumber`),
    UNIQUE INDEX `WalletEntry_paymentSubmissionId_accountId_kind_key`(`paymentSubmissionId`, `accountId`, `kind`),
    UNIQUE INDEX `WalletEntry_accessCodeId_accountId_key`(`accessCodeId`, `accountId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE `AccountMove` (
    `sequence` BIGINT NOT NULL AUTO_INCREMENT,
    `fromAccountId` CHAR(36) NOT NULL,
    `toAccountId` CHAR(36) NOT NULL,
    `fromEntryNumber` INTEGER UNSIGNED NOT NULL,
    `movedAt` DATETIME(3) NOT NULL,

    INDEX `AccountMove_fromAccountId_sequence_idx`(`fromAccountId`, `sequence`),
    INDEX `AccountMove_toAccountId_idx`(`toAccountId`),
    PRIMARY KEY (`sequence`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE INDEX `MemberAccount_autoRenew_idx` ON `MemberAccount`(`autoRenew`);
CREATE INDEX `MemberAccount_autoRenewPlanId_idx` ON `MemberAccount`(`autoRenewPlanId`);
CREATE UNIQUE INDEX `PaymentSubmission_id_accountId_key` ON `PaymentSubmission`(`id`, `accountId`);

ALTER TABLE `MemberAccount` ADD CONSTRAINT `MemberAccount_autoRenewPlanId_fkey` FOREIGN KEY (`autoRenewPlanId`) REFERENCES `SubscriptionPlan`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `WalletEntry` ADD CONSTRAINT `WalletEntry_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `MemberAccount`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `WalletEntry` ADD CONSTRAINT `WalletEntry_paymentSubmission_fkey` FOREIGN KEY (`paymentSubmissionId`, `accountId`) REFERENCES `PaymentSubmission`(`id`, `accountId`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `AccountMove` ADD CONSTRAINT `AccountMove_fromAccountId_fkey` FOREIGN KEY (`fromAccountId`) REFERENCES `MemberAccount`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `AccountMove` ADD CONSTRAINT `AccountMove_toAccountId_fkey` FOREIGN KEY (`toAccountId`) REFERENCES `MemberAccount`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `WalletEntry` ADD CONSTRAINT `WalletEntry_accessCode_fkey` FOREIGN KEY (`accessCodeId`, `accountId`) REFERENCES `AccessCode`(`id`, `accountId`) ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE `WalletEntry`
    ADD CONSTRAINT `WalletEntry_kind_check` CHECK (
        `kind` IN ('topup', 'overpayment', 'purchase', 'renewal', 'reversal', 'adjustment', 'transfer') AND `entryNumber` >= 1
    ),
    ADD CONSTRAINT `WalletEntry_amount_check` CHECK (
        (`kind` = 'topup' AND `amountUgx` BETWEEN 1000 AND 500000)
        OR (`kind` = 'overpayment' AND `amountUgx` BETWEEN 1 AND 500000)
        OR (`kind` IN ('purchase', 'renewal') AND `amountUgx` BETWEEN -10000000 AND -100)
        OR (`kind` = 'reversal' AND `amountUgx` BETWEEN -10000000 AND -1)
        OR (`kind` IN ('adjustment', 'transfer') AND `amountUgx` <> 0 AND `amountUgx` BETWEEN -10000000 AND 10000000)
    ),
    ADD CONSTRAINT `WalletEntry_balance_check` CHECK (
        `balanceAfter` BETWEEN -10000000 AND 10000000
        AND (`amountUgx` > 0 OR `kind` IN ('reversal', 'transfer') OR `balanceAfter` >= 0)
        AND (`entryNumber` <> 1 OR `balanceAfter` = `amountUgx`)
    ),
    ADD CONSTRAINT `WalletEntry_actor_check` CHECK (
        (`kind` = 'purchase' AND `actor` = 'member') OR (`kind` = 'renewal' AND `actor` = 'system')
        OR (`kind` IN ('topup', 'overpayment', 'reversal', 'adjustment', 'transfer') AND `actor` = 'admin')
    ),
    ADD CONSTRAINT `WalletEntry_note_check` CHECK (
        (`kind` NOT IN ('adjustment', 'transfer') OR `note` IS NOT NULL)
        AND (`note` IS NULL OR (CHAR_LENGTH(`note`) > 0 AND `note` = TRIM(`note`) AND NOT `note` REGEXP '[0-9]([-. ()+]*[0-9]){8,}'))
    );

ALTER TABLE `MemberAccount`
    ADD CONSTRAINT `MemberAccount_credit_check` CHECK (
        `creditUgx` BETWEEN -10000000 AND 10000000
        AND (`autoRenew` = FALSE OR (`erasedAt` IS NULL AND `autoRenewPlanId` IS NOT NULL AND `autoRenewTermsVersion` IS NOT NULL))
    );

ALTER TABLE `PaymentSubmission`
    ADD CONSTRAINT `PaymentSubmission_purpose_check` CHECK (
        (`purpose` = 'plan' AND `planId` IS NOT NULL AND `durationDays` IS NOT NULL)
        OR (`purpose` = 'topup' AND `planId` IS NULL AND `durationDays` IS NULL
            AND `priceUgx` BETWEEN 1000 AND 500000 AND `claimedAmountUgx` = `priceUgx`)
    );

ALTER TABLE `AccessCode` DROP CONSTRAINT `AccessCode_shape_check`;
ALTER TABLE `AccessCode`
    ADD CONSTRAINT `AccessCode_shape_check` CHECK (
        `source` IN ('payment', 'manual', 'reissue', 'number-change', 'trial', 'credit', 'renewal')
        AND (`source` = 'payment') = (`paymentSubmissionId` IS NOT NULL)
        AND `durationDays` BETWEEN 1 AND 366
        AND `endsAt` > `startsAt`
        AND (`source` NOT IN ('credit', 'renewal')
            OR (`planId` IS NOT NULL AND `priceUgx` BETWEEN 100 AND 10000000 AND `amountReceivedUgx` IS NULL))
    );

-- 3. The triggers. With the block delimiter the semicolons inside each body stay in it, and the statement ends at END.
DELIMITER //
CREATE OR REPLACE TRIGGER WalletEntry_no_update BEFORE UPDATE ON WalletEntry FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Wallet entries are append-only';
END //
CREATE OR REPLACE TRIGGER WalletEntry_no_delete BEFORE DELETE ON WalletEntry FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Wallet entries are append-only';
END //
CREATE OR REPLACE TRIGGER AccountMove_no_update BEFORE UPDATE ON AccountMove FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Account moves are append-only';
END //
CREATE OR REPLACE TRIGGER AccountMove_no_delete BEFORE DELETE ON AccountMove FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Account moves are append-only';
END //
CREATE OR REPLACE TRIGGER WalletEntry_links BEFORE INSERT ON WalletEntry FOR EACH ROW
BEGIN
  IF (NEW.kind IN ('topup', 'overpayment', 'reversal')) <> (NEW.paymentSubmissionId IS NOT NULL)
    OR (NEW.kind IN ('purchase', 'renewal')) <> (NEW.accessCodeId IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A wallet entry links exactly the payment or period its kind names';
  END IF;
END //

-- 4. Verification: stop before recording unless both tables, the columns and keys, the eight checks and the five triggers exist.
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('WalletEntry', 'AccountMove')
      AND ENGINE = 'InnoDB' AND TABLE_COLLATION = 'utf8mb4_bin') <> 2
    OR (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND ((TABLE_NAME = 'MemberAccount' AND COLUMN_NAME IN ('creditUgx', 'autoRenew', 'autoRenewPlanId', 'autoRenewTermsVersion'))
        OR (TABLE_NAME = 'PaymentSubmission' AND COLUMN_NAME = 'purpose'))) <> 5
    OR (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_NAME IN ('MemberAccount_autoRenewPlanId_fkey', 'AccountMove_fromAccountId_fkey', 'AccountMove_toAccountId_fkey',
        'WalletEntry_accountId_fkey', 'WalletEntry_paymentSubmission_fkey', 'WalletEntry_accessCode_fkey')) <> 6
    OR (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'CHECK'
      AND CONSTRAINT_NAME IN ('WalletEntry_kind_check', 'WalletEntry_amount_check', 'WalletEntry_balance_check', 'WalletEntry_actor_check',
        'WalletEntry_note_check', 'MemberAccount_credit_check', 'PaymentSubmission_purpose_check', 'AccessCode_shape_check')) <> 8
    OR (SELECT COUNT(*) FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_NAME = 'AccessCode_shape_check' AND CHECK_CLAUSE LIKE '%renewal%') <> 1
    OR (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE() AND EVENT_OBJECT_TABLE IN ('WalletEntry', 'AccountMove')
      AND TRIGGER_NAME IN ('WalletEntry_no_update', 'WalletEntry_no_delete', 'WalletEntry_links', 'AccountMove_no_update', 'AccountMove_no_delete')
      AND ACTION_TIMING = 'BEFORE' AND ACTION_STATEMENT LIKE 'BEGIN%' AND ACTION_STATEMENT LIKE '%END') <> 5 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Account credit does not match the reviewed migration; it was not recorded.';
  END IF;
END //
DELIMITER ;

-- 5. Record the migration (checksum = SHA-256 of the committed migration.sql), once.
SET @record := 'INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
  SELECT UUID(), ''701fab58859ba61fe99296d060bcbc773364b869da9af3d2f68cbfca57acfff9'', NOW(3), ''20261024210000_account_credit'', NULL, NULL, NOW(3), 1 FROM DUAL
  WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = ''20261024210000_account_credit'')';
PREPARE record_migration FROM @record;
EXECUTE record_migration;
DEALLOCATE PREPARE record_migration;

-- 6. Closing check. Expect one migration row with finished_at set, and five triggers (three on WalletEntry, two on AccountMove).
SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name = '20261024210000_account_credit';
SELECT TRIGGER_NAME, ACTION_TIMING, EVENT_MANIPULATION FROM information_schema.TRIGGERS
  WHERE TRIGGER_SCHEMA = DATABASE() AND EVENT_OBJECT_TABLE IN ('WalletEntry', 'AccountMove') ORDER BY TRIGGER_NAME;
