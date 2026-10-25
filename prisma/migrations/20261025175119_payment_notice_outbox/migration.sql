-- Account-update SMS outbox (B04). Each committed payment approval, rejection, credit top-up approval and auto-renewal inserts
-- one PaymentNotice row in that decision's own transaction; a dispatcher (the members worker's notify step or an owner page
-- load) sends the one fixed account-update notice under a fenced lease and records the gateway's answer. The table holds no
-- phone number and no message text: the dispatcher reads the registered number under the account lock. accepted means the
-- gateway accepted the message, never handset receipt; an uncertain send is never resent automatically.
-- The application role needs SELECT, INSERT, UPDATE and DELETE on PaymentNotice (deploy/manual-account-grants.sql): the purge
-- and erasure delete rows, and permanent deletion removes them by the foreign-key cascade. Apply this migration with its grant
-- before deploying the code, because decisions insert into this table in their own transaction. No triggers or MySQL-only
-- syntax, so the file runs unchanged on MySQL and MariaDB.

-- CreateTable
CREATE TABLE `PaymentNotice` (
    `id` CHAR(36) NOT NULL,
    `accountId` CHAR(36) NOT NULL,
    `kind` VARCHAR(12) NOT NULL,
    `targetId` CHAR(36) NOT NULL,
    `state` VARCHAR(12) NOT NULL,
    `attempts` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `availableAt` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `leaseOwner` CHAR(36) NULL,
    `leaseUntil` DATETIME(3) NULL,
    `lastError` VARCHAR(16) NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `attemptedAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,

    INDEX `PaymentNotice_state_availableAt_idx`(`state`, `availableAt`),
    INDEX `PaymentNotice_accountId_idx`(`accountId`),
    INDEX `PaymentNotice_closedAt_idx`(`closedAt`),
    UNIQUE INDEX `PaymentNotice_targetId_kind_key`(`targetId`, `kind`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- The CHECK cannot name accountId (cascading FK; MySQL error 3823). lastError is an enumerated class, never provider text.
ALTER TABLE `PaymentNotice` ADD CONSTRAINT `PaymentNotice_shape_check` CHECK (
  `kind` IN ('approved','rejected','credited','renewed')
  AND `state` IN ('pending','sending','accepted','failed','uncertain','skipped')
  AND (`state` = 'sending') = (`leaseUntil` IS NOT NULL) AND (`state` <> 'sending' OR `leaseOwner` IS NOT NULL)
  AND (`state` IN ('pending','sending')) = (`closedAt` IS NULL)
  AND `attempts` <= 8 AND `expiresAt` > `createdAt`
  AND (`lastError` IS NULL OR `lastError` IN ('configuration','rejected','uncertain','unavailable','unsupported','invalid','expired')));

-- AddForeignKey
ALTER TABLE `PaymentNotice` ADD CONSTRAINT `PaymentNotice_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `MemberAccount`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;
