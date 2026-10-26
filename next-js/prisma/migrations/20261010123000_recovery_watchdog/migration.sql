CREATE TABLE `RecoveryAudit` (
  `id` CHAR(64) NOT NULL,
  `jobId` CHAR(64) NOT NULL,
  `actionId` CHAR(64) NOT NULL,
  `phase` VARCHAR(16) NOT NULL,
  `at` DATETIME(3) NOT NULL,
  `integrity` CHAR(64) NOT NULL,
  `body` JSON NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `RecoveryAudit_jobId_actionId_phase_key` (`jobId`, `actionId`, `phase`),
  INDEX `RecoveryAudit_jobId_at_idx` (`jobId`, `at`),
  CONSTRAINT `RecoveryAudit_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `DurableJob` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `RecoveryAudit_phase_check` CHECK (`phase` IN ('intent', 'outcome', 'failure'))
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE INDEX `DurableJob_state_leaseExpiresAt_id_idx` ON `DurableJob` (`state`, `leaseExpiresAt`, `id`);
CREATE INDEX `DurableJob_state_availableAt_id_idx` ON `DurableJob` (`state`, `availableAt`, `id`);
