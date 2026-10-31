-- MariaDB 11.4 overlay; apply once after backup, stopping on errors.
DELIMITER //
BEGIN NOT ATOMIC
  IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('ReferralReviewCase','ReferralReviewEvidence','ReferralReviewEvent','ReferralGrantReversal'))
    OR EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name='20261031135652_referral_review') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Referral review storage is already or partly installed; stop.';
  END IF;
END //
DELIMITER ;
-- CreateTable
CREATE TABLE `ReferralReviewCase` (
    `id` CHAR(36) NOT NULL,
    `grantId` CHAR(36) NOT NULL,
    `referralId` CHAR(36) NOT NULL,
    `accountId` CHAR(36) NOT NULL,
    `reason` VARCHAR(24) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'open',
    `revision` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    `openedAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `closedAt` DATETIME(3) NULL,

    INDEX `ReferralReviewCase_status_updatedAt_id_idx`(`status`, `updatedAt`, `id`),
    INDEX `ReferralReviewCase_accountId_updatedAt_idx`(`accountId`, `updatedAt`),
    INDEX `ReferralReviewCase_grantId_idx`(`grantId`),
    INDEX `ReferralReviewCase_closedAt_idx`(`closedAt`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ReferralReviewEvidence` (
    `caseId` CHAR(36) NOT NULL,
    `summary` VARCHAR(300) NULL,
    `evidenceRef` VARCHAR(160) NULL,
    `appealStatement` VARCHAR(500) NULL,
    `purgedAt` DATETIME(3) NULL,

    PRIMARY KEY (`caseId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ReferralReviewEvent` (
    `id` CHAR(36) NOT NULL,
    `caseId` CHAR(36) NOT NULL,
    `action` VARCHAR(24) NOT NULL,
    `actor` VARCHAR(64) NOT NULL,
    `at` DATETIME(3) NOT NULL,
    `beforeMs` INTEGER UNSIGNED NULL,
    `afterMs` INTEGER UNSIGNED NULL,

    INDEX `ReferralReviewEvent_caseId_at_id_idx`(`caseId`, `at`, `id`),
    UNIQUE INDEX `ReferralReviewEvent_caseId_action_key`(`caseId`, `action`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ReferralGrantReversal` (
    `grantId` CHAR(36) NOT NULL,
    `caseId` CHAR(36) NOT NULL,
    `accountId` CHAR(36) NOT NULL,
    `holderAccountId` CHAR(36) NOT NULL,
    `reversedMs` INTEGER UNSIGNED NOT NULL,
    `appliedAt` DATETIME(3) NOT NULL,
    `restoredGrantId` CHAR(36) NULL,
    `restoredAt` DATETIME(3) NULL,

    UNIQUE INDEX `ReferralGrantReversal_caseId_key`(`caseId`),
    UNIQUE INDEX `ReferralGrantReversal_restoredGrantId_key`(`restoredGrantId`),
    INDEX `ReferralGrantReversal_accountId_idx`(`accountId`),
    INDEX `ReferralGrantReversal_holderAccountId_idx`(`holderAccountId`),
    PRIMARY KEY (`grantId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- AddForeignKey
ALTER TABLE `ReferralReviewEvidence` ADD CONSTRAINT `ReferralReviewEvidence_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `ReferralReviewCase`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ReferralReviewEvent` ADD CONSTRAINT `ReferralReviewEvent_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `ReferralReviewCase`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ReferralGrantReversal` ADD CONSTRAINT `ReferralGrantReversal_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `ReferralReviewCase`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE ReferralReviewCase ADD CONSTRAINT ReferralReviewCase_shape_check CHECK (
  reason IN ('duplicate-award','proven-self-referral','verified-abuse')
  AND status IN ('open','no-action','reversed','appealed','upheld','restored') AND revision > 0
  AND updatedAt >= openedAt AND (closedAt IS NULL OR closedAt >= openedAt)
  AND ((status IN ('no-action','reversed','upheld','restored')) = (closedAt IS NOT NULL))
);
ALTER TABLE ReferralReviewEvidence ADD CONSTRAINT ReferralReviewEvidence_shape_check CHECK (
  purgedAt IS NULL OR (summary IS NULL AND evidenceRef IS NULL AND appealStatement IS NULL)
);
ALTER TABLE ReferralReviewEvent ADD CONSTRAINT ReferralReviewEvent_shape_check CHECK (
  action IN ('requested','confirmed','no-action','reversed','appealed','appeal-restored','appeal-upheld','restored')
  AND (beforeMs IS NULL OR beforeMs <= 86400000) AND (afterMs IS NULL OR afterMs <= 86400000)
);
ALTER TABLE ReferralGrantReversal ADD CONSTRAINT ReferralGrantReversal_shape_check CHECK (
  reversedMs BETWEEN 1 AND 86400000 AND ((restoredGrantId IS NULL) = (restoredAt IS NULL))
  AND (restoredAt IS NULL OR restoredAt >= appliedAt)
);

ALTER TABLE MemberNotification DROP CONSTRAINT MemberNotification_shape_check;
ALTER TABLE MemberNotification ADD CONSTRAINT MemberNotification_shape_check CHECK (
  kind IN ('payment-approved','payment-rejected','access-activated','access-expiring','access-expired','referral-earned',
    'referral-reviewed','referral-reversed','referral-restored')
  AND CHAR_LENGTH(eventKey) BETWEEN 1 AND 96 AND createdAt >= occurredAt
  AND (readAt IS NULL OR readAt >= occurredAt) AND (dismissedAt IS NULL OR dismissedAt >= occurredAt)
  AND (withdrawnAt IS NULL OR withdrawnAt >= occurredAt)
  AND ((kind IN ('access-expiring','access-expired')) = (expiresAt IS NOT NULL))
);

DELIMITER //
CREATE TRIGGER ReferralReviewCase_insert BEFORE INSERT ON ReferralReviewCase FOR EACH ROW
BEGIN
  IF NEW.status <> 'open' OR NEW.revision <> 1 OR NEW.closedAt IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Review requests precede decisions';
  END IF;
END //
CREATE TRIGGER ReferralReviewCase_identity BEFORE UPDATE ON ReferralReviewCase FOR EACH ROW
BEGIN
  IF NOT (NEW.id <=> OLD.id) OR NOT (NEW.grantId <=> OLD.grantId) OR NOT (NEW.referralId <=> OLD.referralId)
    OR NOT (NEW.accountId <=> OLD.accountId) OR NOT (NEW.reason <=> OLD.reason) OR NOT (NEW.openedAt <=> OLD.openedAt)
    OR NEW.revision <> OLD.revision + 1 OR NEW.updatedAt < OLD.updatedAt
    OR NOT ((OLD.status='open' AND NEW.status IN ('no-action','reversed'))
      OR (OLD.status='reversed' AND NEW.status='appealed') OR (OLD.status='appealed' AND NEW.status IN ('upheld','restored'))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Review identity and completed decisions are immutable';
  END IF;
  IF NEW.status IN ('reversed','appealed','upheld','restored') AND NOT EXISTS (
    SELECT 1 FROM ReferralGrantReversal r WHERE r.caseId=NEW.id AND r.grantId=NEW.grantId
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='A financial review state needs its exact reversal ledger';
  END IF;
  IF NEW.status='restored' AND NOT EXISTS (SELECT 1 FROM ReferralGrantReversal r WHERE r.caseId=NEW.id AND r.restoredGrantId IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Restored reviews need their compensating grant';
  END IF;
END //
CREATE TRIGGER ReferralReviewCase_no_delete BEFORE DELETE ON ReferralReviewCase FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Review accounting history cannot be deleted';
END //
CREATE TRIGGER ReferralReviewEvent_no_update BEFORE UPDATE ON ReferralReviewEvent FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Review events are append-only';
END //
CREATE TRIGGER ReferralReviewEvent_no_delete BEFORE DELETE ON ReferralReviewEvent FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Review events are append-only';
END //
CREATE TRIGGER ReferralGrantReversal_insert BEFORE INSERT ON ReferralGrantReversal FOR EACH ROW
BEGIN
  IF NEW.restoredGrantId IS NOT NULL OR NEW.restoredAt IS NOT NULL OR NEW.holderAccountId <> NEW.accountId
    OR NOT EXISTS (SELECT 1 FROM ReferralReviewCase r JOIN AccessCode c ON c.id=r.grantId
      WHERE r.id=NEW.caseId AND r.grantId=NEW.grantId AND r.status='open' AND c.source='referral'
      AND c.accountId=NEW.accountId AND c.revokedAt IS NULL
      AND TIMESTAMPDIFF(MICROSECOND,GREATEST(c.startsAt,NEW.appliedAt),c.endsAt) DIV 1000=NEW.reversedMs) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Reversals must match exact unused earned access';
  END IF;
END //
CREATE TRIGGER ReferralGrantReversal_identity BEFORE UPDATE ON ReferralGrantReversal FOR EACH ROW
BEGIN
  IF NOT (NEW.grantId <=> OLD.grantId) OR NOT (NEW.caseId <=> OLD.caseId) OR NOT (NEW.accountId <=> OLD.accountId)
    OR NOT (NEW.reversedMs <=> OLD.reversedMs) OR NOT (NEW.appliedAt <=> OLD.appliedAt)
    OR (OLD.restoredGrantId IS NOT NULL AND (NOT (NEW.restoredGrantId <=> OLD.restoredGrantId) OR NOT (NEW.restoredAt <=> OLD.restoredAt))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Reversal amounts and completed restoration are immutable';
  END IF;
  IF NEW.holderAccountId <> OLD.holderAccountId AND (NOT (NEW.restoredGrantId <=> OLD.restoredGrantId)
    OR NOT EXISTS (SELECT 1 FROM AccountMove m WHERE m.fromAccountId=OLD.holderAccountId AND m.toAccountId=NEW.holderAccountId AND m.movedAt>=OLD.appliedAt)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Appeal claims move only with an audited number transfer';
  END IF;
  IF OLD.restoredGrantId IS NULL AND NEW.restoredGrantId IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM AccessCode c JOIN ReferralReviewCase r ON r.id=NEW.caseId
    WHERE c.id=NEW.restoredGrantId AND c.accountId=NEW.holderAccountId AND c.source='referral' AND r.status='appealed'
      AND c.createdAt=NEW.restoredAt AND TIMESTAMPDIFF(MICROSECOND,c.startsAt,c.endsAt) DIV 1000=NEW.reversedMs
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Appeals restore exactly the amount actually reversed';
  END IF;
END //
CREATE TRIGGER ReferralGrantReversal_no_delete BEFORE DELETE ON ReferralGrantReversal FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Reversal accounting history cannot be deleted';
END //


DELIMITER ;

DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('ReferralReviewCase','ReferralReviewEvidence','ReferralReviewEvent','ReferralGrantReversal')) <> 4
    OR (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME LIKE 'ReferralReview%' OR TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME LIKE 'ReferralGrantReversal%') <> 8
    OR (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ReferralGrantReversal') <> 8 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Referral review storage differs; migration was not recorded.';
  END IF;
END //
DELIMITER ;
INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,logs,rolled_back_at,started_at,applied_steps_count)
VALUES (UUID(),'8e108b5ab45c1c61e837bb56cd813122efd9bcd2435b28060395b0beb1d1d2e8',NOW(3),'20261031135652_referral_review',NULL,NULL,NOW(3),1);
