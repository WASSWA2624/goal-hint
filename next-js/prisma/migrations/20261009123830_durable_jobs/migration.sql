-- Control rows serialize first enqueue by hashed identity, without one global mutex.
CREATE TABLE DurableJobEnqueueLock (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  CONSTRAINT DurableJobEnqueueLock_range_check CHECK (id < 64)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
INSERT INTO DurableJobEnqueueLock (id) VALUES (0), (1), (2), (3), (4), (5), (6), (7), (8), (9), (10), (11), (12), (13), (14), (15), (16), (17), (18), (19), (20), (21), (22), (23), (24), (25), (26), (27), (28), (29), (30), (31), (32), (33), (34), (35), (36), (37), (38), (39), (40), (41), (42), (43), (44), (45), (46), (47), (48), (49), (50), (51), (52), (53), (54), (55), (56), (57), (58), (59), (60), (61), (62), (63);

-- CreateTable
CREATE TABLE `DurableJob` (
    `id` CHAR(64) NOT NULL,
    `type` VARCHAR(64) NOT NULL,
    `handlerVersion` INTEGER UNSIGNED NOT NULL,
    `idempotencyKey` CHAR(64) NOT NULL,
    `requestHash` CHAR(64) NOT NULL,
    `integrity` CHAR(64) NOT NULL,
    `envelopeJson` JSON NOT NULL,
    `refreshRunId` CHAR(36) NULL,
    `refreshFixtureId` CHAR(36) NULL,
    `refreshCycleId` CHAR(36) NULL,
    `state` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `version` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    `priority` INTEGER UNSIGNED NOT NULL,
    `availableAt` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `attemptCount` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `fence` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `ownerId` CHAR(64) NULL,
    `leaseExpiresAt` DATETIME(3) NULL,
    `attemptDeadlineAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `terminalReason` VARCHAR(32) NULL,

    INDEX `DurableJob_type_handlerVersion_state_availableAt_priority_idx`(`type`, `handlerVersion`, `state`, `availableAt`, `priority`),
    INDEX `DurableJob_type_handlerVersion_state_leaseExpiresAt_idx`(`type`, `handlerVersion`, `state`, `leaseExpiresAt`),
    UNIQUE INDEX `DurableJob_type_handlerVersion_idempotencyKey_key`(`type`, `handlerVersion`, `idempotencyKey`),
    UNIQUE INDEX `DurableJob_refresh_key`(`refreshRunId`, `refreshFixtureId`, `refreshCycleId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `DurableJobAttempt` (
    `id` CHAR(64) NOT NULL,
    `jobId` CHAR(64) NOT NULL,
    `number` INTEGER UNSIGNED NOT NULL,
    `fence` INTEGER UNSIGNED NOT NULL,
    `ownerId` CHAR(64) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `deadlineAt` DATETIME(3) NOT NULL,
    `finishedAt` DATETIME(3) NULL,
    `outcome` VARCHAR(16) NOT NULL,
    `reason` VARCHAR(32) NULL,

    UNIQUE INDEX `DurableJobAttempt_jobId_number_key`(`jobId`, `number`),
    UNIQUE INDEX `DurableJobAttempt_id_jobId_key`(`id`, `jobId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `DurableJobEvent` (
    `id` CHAR(36) NOT NULL,
    `jobId` CHAR(64) NOT NULL,
    `version` INTEGER UNSIGNED NOT NULL,
    `attemptId` CHAR(64) NULL,
    `kind` VARCHAR(32) NOT NULL,
    `reason` VARCHAR(32) NULL,
    `at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DurableJobEvent_jobId_version_key`(`jobId`, `version`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `DurableJobUsage` (
    `id` CHAR(64) NOT NULL,
    `jobId` CHAR(64) NOT NULL,
    `attemptId` CHAR(64) NOT NULL,
    `version` INTEGER UNSIGNED NOT NULL,
    `requestHash` CHAR(64) NOT NULL,
    `provider` VARCHAR(16) NOT NULL,
    `requestReference` CHAR(64) NOT NULL,
    `costReference` CHAR(64) NULL,
    `phase` VARCHAR(16) NOT NULL,
    `requests` INTEGER UNSIGNED NOT NULL,
    `durationMs` INTEGER UNSIGNED NULL,
    `recordedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DurableJobUsage_jobId_version_key`(`jobId`, `version`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- AddForeignKey
ALTER TABLE `DurableJob` ADD CONSTRAINT `DurableJob_refreshRunId_fkey` FOREIGN KEY (`refreshRunId`) REFERENCES `DailyRun`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DurableJob` ADD CONSTRAINT `DurableJob_refreshCycleId_refreshFixtureId_fkey` FOREIGN KEY (`refreshCycleId`, `refreshFixtureId`) REFERENCES `PredictionCycle`(`id`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DurableJobAttempt` ADD CONSTRAINT `DurableJobAttempt_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `DurableJob`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DurableJobEvent` ADD CONSTRAINT `DurableJobEvent_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `DurableJob`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DurableJobEvent` ADD CONSTRAINT `DurableJobEvent_attemptId_jobId_fkey` FOREIGN KEY (`attemptId`, `jobId`) REFERENCES `DurableJobAttempt`(`id`, `jobId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DurableJobUsage` ADD CONSTRAINT `DurableJobUsage_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `DurableJob`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DurableJobUsage` ADD CONSTRAINT `DurableJobUsage_attemptId_jobId_fkey` FOREIGN KEY (`attemptId`, `jobId`) REFERENCES `DurableJobAttempt`(`id`, `jobId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Native state, ownership and identity checks complement registry validation.
ALTER TABLE DurableJob
  ADD CONSTRAINT DurableJob_identity_check CHECK (id REGEXP '^[a-f0-9]{64}$'
    AND type REGEXP '^[a-z][a-z0-9.-]{0,63}$' AND handlerVersion > 0 AND version > 0
    AND idempotencyKey REGEXP '^[a-f0-9]{64}$' AND requestHash REGEXP '^[a-f0-9]{64}$'
    AND priority <= 255 AND attemptCount <= 16 AND fence = attemptCount
    AND ((refreshRunId IS NULL AND refreshFixtureId IS NULL AND refreshCycleId IS NULL)
      OR (refreshRunId IS NOT NULL AND refreshFixtureId IS NOT NULL AND refreshCycleId IS NOT NULL))),
  ADD CONSTRAINT DurableJob_integrity_check CHECK (integrity = SHA2(CONCAT(id, ':', requestHash, ':', CAST(envelopeJson AS CHAR)), 256)),
  ADD CONSTRAINT DurableJob_projection_check CHECK (COALESCE(
    JSON_TYPE(envelopeJson) = 'OBJECT' AND JSON_LENGTH(envelopeJson) = 14
    AND JSON_EXTRACT(envelopeJson, '$.version') = 1
    AND type = JSON_UNQUOTE(JSON_EXTRACT(envelopeJson, '$.type'))
    AND handlerVersion = JSON_EXTRACT(envelopeJson, '$.handlerVersion')
    AND idempotencyKey = JSON_UNQUOTE(JSON_EXTRACT(envelopeJson, '$.idempotencyKey'))
    AND priority = JSON_EXTRACT(envelopeJson, '$.priority')
    AND TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00', expiresAt) DIV 1000 = JSON_EXTRACT(envelopeJson, '$.expiresAt')
    AND JSON_EXTRACT(envelopeJson, '$.notBefore') < JSON_EXTRACT(envelopeJson, '$.expiresAt')
    AND JSON_EXTRACT(envelopeJson, '$.maxAttempts') BETWEEN 1 AND 16
    AND attemptCount <= JSON_EXTRACT(envelopeJson, '$.maxAttempts')
    AND JSON_EXTRACT(envelopeJson, '$.timeoutMs') BETWEEN 100 AND 3600000
    AND JSON_EXTRACT(envelopeJson, '$.leaseMs') BETWEEN 1000 AND 120000
    AND JSON_EXTRACT(envelopeJson, '$.fallbackReserveMs') >= 0
    AND JSON_EXTRACT(envelopeJson, '$.fallbackReserveMs') < JSON_EXTRACT(envelopeJson, '$.timeoutMs')
    AND JSON_EXTRACT(envelopeJson, '$.backoff.baseMs') BETWEEN 100 AND 60000
    AND JSON_EXTRACT(envelopeJson, '$.backoff.maxMs') BETWEEN JSON_EXTRACT(envelopeJson, '$.backoff.baseMs') AND 3600000
    AND ((refreshRunId IS NULL AND JSON_TYPE(JSON_EXTRACT(envelopeJson, '$.refresh')) = 'NULL')
      OR (refreshRunId = JSON_UNQUOTE(JSON_EXTRACT(envelopeJson, '$.refresh.runId'))
        AND refreshFixtureId = JSON_UNQUOTE(JSON_EXTRACT(envelopeJson, '$.refresh.fixtureId'))
        AND refreshCycleId = JSON_UNQUOTE(JSON_EXTRACT(envelopeJson, '$.refresh.cycleId')))), FALSE) = TRUE),
  ADD CONSTRAINT DurableJob_state_check CHECK (COALESCE(
    updatedAt >= createdAt AND
    ((state = 'running' AND attemptCount > 0 AND ownerId REGEXP '^[a-f0-9]{64}$'
      AND leaseExpiresAt IS NOT NULL AND attemptDeadlineAt IS NOT NULL
      AND leaseExpiresAt <= attemptDeadlineAt AND attemptDeadlineAt <= expiresAt
      AND finishedAt IS NULL AND terminalReason IS NULL) OR
     (state = 'pending' AND ownerId IS NULL AND leaseExpiresAt IS NULL AND attemptDeadlineAt IS NULL
      AND finishedAt IS NULL AND terminalReason IS NULL) OR
     (state IN ('succeeded','failed','expired') AND ownerId IS NULL AND leaseExpiresAt IS NULL AND attemptDeadlineAt IS NULL
      AND finishedAt IS NOT NULL AND finishedAt >= createdAt AND terminalReason IN ('completed','invalid-payload','unknown-handler','non-retryable','handler-failed','timeout','lease-expired','eligibility-expired','attempts-exhausted','worker-stopping','rate-limited','budget-exhausted','insufficient-evidence','invalid-output')
      AND ((state = 'succeeded' AND terminalReason = 'completed') OR
        (state = 'expired' AND terminalReason = 'eligibility-expired') OR
        (state = 'failed' AND terminalReason <> 'completed')))), FALSE) = TRUE);
ALTER TABLE DurableJobAttempt
  ADD CONSTRAINT DurableJobAttempt_identity_check CHECK (id REGEXP '^[a-f0-9]{64}$' AND ownerId REGEXP '^[a-f0-9]{64}$'
    AND number BETWEEN 1 AND 16 AND fence = number AND deadlineAt > startedAt),
  ADD CONSTRAINT DurableJobAttempt_state_check CHECK (COALESCE(
    (outcome = 'running' AND finishedAt IS NULL AND reason IS NULL) OR
    (outcome IN ('succeeded','retry','failed','expired') AND finishedAt IS NOT NULL AND finishedAt >= startedAt
      AND reason IN ('completed','invalid-payload','unknown-handler','non-retryable','handler-failed','timeout','lease-expired','eligibility-expired','attempts-exhausted','worker-stopping','rate-limited','budget-exhausted','insufficient-evidence','invalid-output') AND (outcome <> 'succeeded' OR reason = 'completed')), FALSE) = TRUE);
ALTER TABLE DurableJobEvent
  ADD CONSTRAINT DurableJobEvent_kind_check CHECK (version > 0
    AND kind IN ('enqueued','claimed','renewed','acknowledged','retry-scheduled','failed','expired','usage-recorded')
    AND (reason IS NULL OR reason IN ('completed','invalid-payload','unknown-handler','non-retryable','handler-failed','timeout','lease-expired','eligibility-expired','attempts-exhausted','worker-stopping','rate-limited','budget-exhausted','insufficient-evidence','invalid-output')));
ALTER TABLE DurableJobUsage
  ADD CONSTRAINT DurableJobUsage_content_check CHECK (version > 0 AND id REGEXP '^[a-f0-9]{64}$'
    AND requestHash REGEXP '^[a-f0-9]{64}$' AND requestReference REGEXP '^[a-f0-9]{64}$'
    AND (costReference IS NULL OR costReference REGEXP '^[a-f0-9]{64}$')
    AND provider IN ('football','research','ai','internal') AND phase IN ('dispatched','completed','uncertain')
    AND (durationMs IS NULL OR durationMs <= 3600000));
