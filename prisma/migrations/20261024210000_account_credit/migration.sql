-- Account credit: plan-only, non-refundable credit an account holds after owner-approved top-ups or overpayments, spent on
-- plans at once (no approval) and optionally on auto-renewal. WalletEntry is an append-only ledger: the application role
-- gets SELECT and INSERT only, triggers refuse every UPDATE and DELETE, and permanent deletion removes rows through the
-- foreign-key cascades below, which fire no triggers and need no DELETE privilege. MemberAccount.creditUgx caches the
-- newest balanceAfter. AccountMove records each number change, append-only the same way; an account with moves can be erased
-- but never deleted (RESTRICT), so a reversal can always follow where a payment's credit went. The CHECKs cannot name the cascading key columns (MySQL error 3823), so the link rules are a
-- BEFORE INSERT trigger. DROP CONSTRAINT (not MySQL-only DROP CHECK) keeps the file valid on MariaDB too; on MariaDB
-- import prisma/mariadb/20261024210000_account_credit.sql instead. Adding CHECKs rebuilds AccessCode and PaymentSubmission,
-- so pause writers while this runs.

-- AlterTable
ALTER TABLE `MemberAccount` ADD COLUMN `autoRenew` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `autoRenewPlanId` CHAR(36) NULL,
    ADD COLUMN `autoRenewTermsVersion` VARCHAR(16) NULL,
    ADD COLUMN `creditUgx` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `PaymentSubmission` ADD COLUMN `purpose` VARCHAR(8) NOT NULL DEFAULT 'plan',
    MODIFY `planId` CHAR(36) NULL,
    MODIFY `durationDays` SMALLINT UNSIGNED NULL;

-- CreateTable
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

-- CreateTable
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

-- CreateIndex
CREATE INDEX `MemberAccount_autoRenew_idx` ON `MemberAccount`(`autoRenew`);

-- CreateIndex
CREATE INDEX `MemberAccount_autoRenewPlanId_idx` ON `MemberAccount`(`autoRenewPlanId`);

-- CreateIndex
CREATE UNIQUE INDEX `PaymentSubmission_id_accountId_key` ON `PaymentSubmission`(`id`, `accountId`);

-- AddForeignKey
ALTER TABLE `MemberAccount` ADD CONSTRAINT `MemberAccount_autoRenewPlanId_fkey` FOREIGN KEY (`autoRenewPlanId`) REFERENCES `SubscriptionPlan`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `WalletEntry` ADD CONSTRAINT `WalletEntry_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `MemberAccount`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `WalletEntry` ADD CONSTRAINT `WalletEntry_paymentSubmission_fkey` FOREIGN KEY (`paymentSubmissionId`, `accountId`) REFERENCES `PaymentSubmission`(`id`, `accountId`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `AccountMove` ADD CONSTRAINT `AccountMove_fromAccountId_fkey` FOREIGN KEY (`fromAccountId`) REFERENCES `MemberAccount`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `AccountMove` ADD CONSTRAINT `AccountMove_toAccountId_fkey` FOREIGN KEY (`toAccountId`) REFERENCES `MemberAccount`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `WalletEntry` ADD CONSTRAINT `WalletEntry_accessCode_fkey` FOREIGN KEY (`accessCodeId`, `accountId`) REFERENCES `AccessCode`(`id`, `accountId`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- The ledger's money rules. Credit only ever comes from the owner (every positive kind is actor admin); only a reversal or a
-- transferred debt takes a balance below zero; each account's ledger starts at zero; a top-up is UGX 1,000-500,000.
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

-- An erased account never renews, and auto-renewal always names its plan and the terms version accepted for it.
ALTER TABLE `MemberAccount`
    ADD CONSTRAINT `MemberAccount_credit_check` CHECK (
        `creditUgx` BETWEEN -10000000 AND 10000000
        AND (`autoRenew` = FALSE OR (`erasedAt` IS NULL AND `autoRenewPlanId` IS NOT NULL AND `autoRenewTermsVersion` IS NOT NULL))
    );

-- A plan report carries its plan; a top-up carries none and claims exactly the amount the member chose to add.
ALTER TABLE `PaymentSubmission`
    ADD CONSTRAINT `PaymentSubmission_purpose_check` CHECK (
        (`purpose` = 'plan' AND `planId` IS NOT NULL AND `durationDays` IS NOT NULL)
        OR (`purpose` = 'topup' AND `planId` IS NULL AND `durationDays` IS NULL
            AND `priceUgx` BETWEEN 1000 AND 500000 AND `claimedAmountUgx` = `priceUgx`)
    );

-- Periods bought with credit (`credit`) or renewed from it (`renewal`) carry their plan and price, never cash received.
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

-- Append-only, and each entry links exactly the payment or period its kind names.
CREATE TRIGGER WalletEntry_no_update BEFORE UPDATE ON WalletEntry FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Wallet entries are append-only';
END;
CREATE TRIGGER WalletEntry_no_delete BEFORE DELETE ON WalletEntry FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Wallet entries are append-only';
END;
CREATE TRIGGER AccountMove_no_update BEFORE UPDATE ON AccountMove FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Account moves are append-only';
END;
CREATE TRIGGER AccountMove_no_delete BEFORE DELETE ON AccountMove FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Account moves are append-only';
END;
CREATE TRIGGER WalletEntry_links BEFORE INSERT ON WalletEntry FOR EACH ROW
BEGIN
  IF (NEW.kind IN ('topup', 'overpayment', 'reversal')) <> (NEW.paymentSubmissionId IS NOT NULL)
    OR (NEW.kind IN ('purchase', 'renewal')) <> (NEW.accessCodeId IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A wallet entry links exactly the payment or period its kind names';
  END IF;
END;
