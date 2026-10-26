-- AlterTable
ALTER TABLE `FootballFixture` ADD COLUMN `activeCycleId` CHAR(36) NULL;

-- CreateTable
CREATE TABLE `DailyRun` (
    `id` CHAR(36) NOT NULL,
    `sequence` BIGINT UNSIGNED NOT NULL,
    `eatDate` DATE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DailyRun_sequence_key`(`sequence`),
    UNIQUE INDEX `DailyRun_eatDate_key`(`eatDate`),
    UNIQUE INDEX `DailyRun_id_sequence_key`(`id`, `sequence`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PredictionCycle` (
    `id` CHAR(36) NOT NULL,
    `fixtureId` CHAR(36) NOT NULL,
    `creationKey` CHAR(64) NOT NULL,
    `creationHash` CHAR(64) NOT NULL,
    `ordinal` INTEGER UNSIGNED NOT NULL,
    `version` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    `scheduleVersion` INTEGER UNSIGNED NOT NULL,
    `kickoffAt` DATETIME(3) NOT NULL,
    `cutoffAt` DATETIME(3) NOT NULL,
    `openedAt` DATETIME(3) NOT NULL,
    `state` VARCHAR(16) NOT NULL DEFAULT 'open',
    `currentSetId` CHAR(36) NULL,
    `lockedSetId` CHAR(36) NULL,
    `closedAt` DATETIME(3) NULL,
    `lockedAt` DATETIME(3) NULL,
    `voidedAt` DATETIME(3) NULL,
    `voidReason` VARCHAR(2000) NULL,

    INDEX `PredictionCycle_state_cutoffAt_idx`(`state`, `cutoffAt`),
    INDEX `PredictionCycle_current_idx`(`currentSetId`, `id`, `fixtureId`),
    INDEX `PredictionCycle_locked_idx`(`lockedSetId`, `id`, `fixtureId`),
    UNIQUE INDEX `PredictionCycle_id_fixtureId_key`(`id`, `fixtureId`),
    UNIQUE INDEX `PredictionCycle_fixtureId_creationKey_key`(`fixtureId`, `creationKey`),
    UNIQUE INDEX `PredictionCycle_fixtureId_ordinal_key`(`fixtureId`, `ordinal`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PredictionSchedule` (
    `id` CHAR(36) NOT NULL,
    `fixtureId` CHAR(36) NOT NULL,
    `cycleId` CHAR(36) NOT NULL,
    `version` INTEGER UNSIGNED NOT NULL,
    `kickoffAt` DATETIME(3) NOT NULL,
    `cutoffAt` DATETIME(3) NOT NULL,
    `observedAt` DATETIME(3) NOT NULL,
    `providerObservedAt` DATETIME(3) NULL,
    `actualStartedAt` DATETIME(3) NULL,
    `actor` VARCHAR(128) NOT NULL,
    `reason` VARCHAR(2000) NOT NULL,
    `evidenceRef` VARCHAR(512) NOT NULL,

    INDEX `PredictionSchedule_fixtureId_observedAt_idx`(`fixtureId`, `observedAt`),
    UNIQUE INDEX `PredictionSchedule_cycleId_version_key`(`cycleId`, `version`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PredictionSet` (
    `id` CHAR(36) NOT NULL,
    `fixtureId` CHAR(36) NOT NULL,
    `fixtureVersion` BIGINT UNSIGNED NOT NULL,
    `cycleId` CHAR(36) NOT NULL,
    `runId` CHAR(36) NOT NULL,
    `runSequence` BIGINT UNSIGNED NOT NULL,
    `jobId` CHAR(64) NOT NULL,
    `fixtureRevision` INTEGER UNSIGNED NOT NULL,
    `cycleRevision` INTEGER UNSIGNED NOT NULL,
    `predecessorId` CHAR(36) NULL,
    `scheduleVersion` INTEGER UNSIGNED NOT NULL,
    `modelVersionId` CHAR(64) NULL,
    `evidenceSnapshotId` CHAR(64) NOT NULL,
    `evidenceHash` CHAR(64) NOT NULL,
    `evidenceCutoffAt` DATETIME(3) NOT NULL,
    `generationCompletedAt` DATETIME(3) NOT NULL,
    `publishedAt` DATETIME(3) NOT NULL,
    `recordedAt` DATETIME(3) NOT NULL,
    `ruleVersion` VARCHAR(64) NOT NULL,
    `requestHash` CHAR(64) NOT NULL,
    `integrity` CHAR(64) NOT NULL,
    `candidateJson` JSON NOT NULL,

    INDEX `PredictionSet_cycleId_runSequence_idx`(`cycleId`, `runSequence`),
    INDEX `PredictionSet_fixtureId_runSequence_fixtureRevision_idx`(`fixtureId`, `runSequence`, `fixtureRevision`),
    INDEX `PredictionSet_predecessor_idx`(`predecessorId`, `cycleId`, `fixtureId`),
    UNIQUE INDEX `PredictionSet_id_cycleId_fixtureId_key`(`id`, `cycleId`, `fixtureId`),
    UNIQUE INDEX `PredictionSet_refresh_key`(`runId`, `fixtureId`, `cycleId`),
    UNIQUE INDEX `PredictionSet_fixtureId_fixtureRevision_key`(`fixtureId`, `fixtureRevision`),
    UNIQUE INDEX `PredictionSet_cycleId_cycleRevision_key`(`cycleId`, `cycleRevision`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `MarketPrediction` (
    `setId` CHAR(36) NOT NULL,
    `family` VARCHAR(32) NOT NULL,
    `available` BOOLEAN NOT NULL,
    `source` VARCHAR(16) NULL,
    `selection` VARCHAR(32) NULL,
    `selectedProbability` DOUBLE NULL,
    `probability1` DOUBLE NULL,
    `probability2` DOUBLE NULL,
    `probability3` DOUBLE NULL,
    `unavailableReason` VARCHAR(32) NULL,
    `generatedAt` DATETIME(3) NULL,
    `retrievedAt` DATETIME(3) NULL,
    `providerUpdatedAt` DATETIME(3) NULL,
    `integrity` CHAR(64) NOT NULL,
    `payloadJson` JSON NOT NULL,

    INDEX `MarketPrediction_family_source_idx`(`family`, `source`),
    PRIMARY KEY (`setId`, `family`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PredictionAudit` (
    `id` CHAR(36) NOT NULL,
    `fixtureId` CHAR(36) NOT NULL,
    `cycleId` CHAR(36) NOT NULL,
    `version` INTEGER UNSIGNED NOT NULL,
    `eventKey` CHAR(64) NOT NULL,
    `requestHash` CHAR(64) NOT NULL,
    `kind` VARCHAR(32) NOT NULL,
    `recordedAt` DATETIME(3) NOT NULL,
    `actor` VARCHAR(128) NOT NULL,
    `reason` VARCHAR(2000) NOT NULL,
    `evidenceRef` VARCHAR(512) NOT NULL,
    `beforeJson` JSON NULL,
    `afterJson` JSON NOT NULL,
    `integrity` CHAR(64) NOT NULL,

    INDEX `PredictionAudit_fixtureId_recordedAt_idx`(`fixtureId`, `recordedAt`),
    UNIQUE INDEX `PredictionAudit_cycleId_version_key`(`cycleId`, `version`),
    UNIQUE INDEX `PredictionAudit_cycleId_eventKey_key`(`cycleId`, `eventKey`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateIndex
CREATE UNIQUE INDEX `Evidence_prediction_binding_key` ON `FixtureEvidenceSnapshot`(`requestId`, `fixtureId`, `cycleId`, `runId`, `fixtureVersion`, `contentHash`);

-- AddForeignKey
ALTER TABLE `FootballFixture` ADD CONSTRAINT `FootballFixture_activeCycleId_id_fkey` FOREIGN KEY (`activeCycleId`, `id`) REFERENCES `PredictionCycle`(`id`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PredictionCycle` ADD CONSTRAINT `PredictionCycle_fixtureId_fkey` FOREIGN KEY (`fixtureId`) REFERENCES `FootballFixture`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PredictionCycle` ADD CONSTRAINT `PredictionCycle_currentSetId_id_fixtureId_fkey` FOREIGN KEY (`currentSetId`, `id`, `fixtureId`) REFERENCES `PredictionSet`(`id`, `cycleId`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PredictionCycle` ADD CONSTRAINT `PredictionCycle_lockedSetId_id_fixtureId_fkey` FOREIGN KEY (`lockedSetId`, `id`, `fixtureId`) REFERENCES `PredictionSet`(`id`, `cycleId`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PredictionSchedule` ADD CONSTRAINT `PredictionSchedule_cycleId_fixtureId_fkey` FOREIGN KEY (`cycleId`, `fixtureId`) REFERENCES `PredictionCycle`(`id`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PredictionSet` ADD CONSTRAINT `PredictionSet_fixtureId_fkey` FOREIGN KEY (`fixtureId`) REFERENCES `FootballFixture`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PredictionSet` ADD CONSTRAINT `PredictionSet_cycleId_fixtureId_fkey` FOREIGN KEY (`cycleId`, `fixtureId`) REFERENCES `PredictionCycle`(`id`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PredictionSet` ADD CONSTRAINT `PredictionSet_runId_runSequence_fkey` FOREIGN KEY (`runId`, `runSequence`) REFERENCES `DailyRun`(`id`, `sequence`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PredictionSet` ADD CONSTRAINT `PredictionSet_cycleId_scheduleVersion_fkey` FOREIGN KEY (`cycleId`, `scheduleVersion`) REFERENCES `PredictionSchedule`(`cycleId`, `version`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PredictionSet` ADD CONSTRAINT `PredictionSet_evidence_fkey` FOREIGN KEY (`evidenceSnapshotId`, `fixtureId`, `cycleId`, `runId`, `fixtureVersion`, `evidenceHash`) REFERENCES `FixtureEvidenceSnapshot`(`requestId`, `fixtureId`, `cycleId`, `runId`, `fixtureVersion`, `contentHash`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PredictionSet` ADD CONSTRAINT `PredictionSet_modelVersionId_fkey` FOREIGN KEY (`modelVersionId`) REFERENCES `ModelVersion`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PredictionSet` ADD CONSTRAINT `PredictionSet_predecessorId_cycleId_fixtureId_fkey` FOREIGN KEY (`predecessorId`, `cycleId`, `fixtureId`) REFERENCES `PredictionSet`(`id`, `cycleId`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `MarketPrediction` ADD CONSTRAINT `MarketPrediction_setId_fkey` FOREIGN KEY (`setId`) REFERENCES `PredictionSet`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PredictionAudit` ADD CONSTRAINT `PredictionAudit_cycleId_fixtureId_fkey` FOREIGN KEY (`cycleId`, `fixtureId`) REFERENCES `PredictionCycle`(`id`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Storage invariants supplement the shared exact market validator. Application
-- grants are SELECT/INSERT on immutable tables, with column-scoped cycle updates.
ALTER TABLE DailyRun ADD CONSTRAINT DailyRun_order_check CHECK (
  sequence = YEAR(eatDate) * 10000 + MONTH(eatDate) * 100 + DAY(eatDate) AND YEAR(eatDate) >= 1000
);
ALTER TABLE PredictionCycle
  ADD CONSTRAINT PredictionCycle_identity_check CHECK (ordinal > 0 AND version > 0 AND scheduleVersion > 0
    AND creationKey REGEXP '^[a-f0-9]{64}$' AND creationHash REGEXP '^[a-f0-9]{64}$'),
  ADD CONSTRAINT PredictionCycle_cutoff_check CHECK (TIMESTAMPDIFF(MICROSECOND, cutoffAt, kickoffAt) = 300000000),
  ADD CONSTRAINT PredictionCycle_state_check CHECK (COALESCE(
    (lockedSetId IS NULL) = (lockedAt IS NULL) AND
    ((state = 'open' AND closedAt IS NULL AND lockedSetId IS NULL AND voidedAt IS NULL AND voidReason IS NULL) OR
     (state IN ('closed', 'void') AND closedAt IS NOT NULL AND closedAt >= openedAt
      AND (lockedAt IS NULL OR lockedAt >= closedAt) AND
      ((state = 'closed' AND voidedAt IS NULL AND voidReason IS NULL) OR
       (state = 'void' AND voidedAt IS NOT NULL AND voidedAt >= closedAt AND CHAR_LENGTH(TRIM(voidReason)) > 0)))), FALSE) = TRUE);
ALTER TABLE PredictionSchedule
  ADD CONSTRAINT PredictionSchedule_version_check CHECK (version > 0),
  ADD CONSTRAINT PredictionSchedule_time_check CHECK (TIMESTAMPDIFF(MICROSECOND, cutoffAt, kickoffAt) = 300000000
    AND (providerObservedAt IS NULL OR providerObservedAt <= observedAt)
    AND (actualStartedAt IS NULL OR actualStartedAt <= observedAt));
ALTER TABLE PredictionSet
  ADD CONSTRAINT PredictionSet_identity_check CHECK (fixtureVersion > 0 AND runSequence > 0 AND fixtureRevision > 0
    AND cycleRevision > 0 AND scheduleVersion > 0 AND ruleVersion = 'regulation-markets-v1'
    AND requestHash REGEXP '^[a-f0-9]{64}$' AND jobId REGEXP '^[a-f0-9]{64}$'
    AND ((cycleRevision = 1 AND predecessorId IS NULL) OR (cycleRevision > 1 AND predecessorId IS NOT NULL AND predecessorId <> id))),
  ADD CONSTRAINT PredictionSet_time_check CHECK (evidenceCutoffAt <= generationCompletedAt
    AND generationCompletedAt <= publishedAt AND publishedAt <= recordedAt),
  ADD CONSTRAINT PredictionSet_integrity_check CHECK (integrity = SHA2(CONCAT(id, ':', requestHash, ':', CAST(candidateJson AS CHAR)), 256)),
  ADD CONSTRAINT PredictionSet_projection_check CHECK (COALESCE(
    JSON_TYPE(candidateJson) = 'OBJECT' AND JSON_LENGTH(candidateJson) = 6
    AND JSON_TYPE(JSON_EXTRACT(candidateJson, '$.markets')) = 'OBJECT' AND JSON_LENGTH(JSON_EXTRACT(candidateJson, '$.markets')) = 4
    AND fixtureId = JSON_UNQUOTE(JSON_EXTRACT(candidateJson, '$.context.context.fixtureId'))
    AND cycleId = JSON_UNQUOTE(JSON_EXTRACT(candidateJson, '$.context.context.cycleId'))
    AND runId = JSON_UNQUOTE(JSON_EXTRACT(candidateJson, '$.context.context.runId'))
    AND fixtureVersion = CAST(JSON_UNQUOTE(JSON_EXTRACT(candidateJson, '$.context.context.fixtureVersion.$evidenceInteger')) AS UNSIGNED)
    AND jobId = JSON_UNQUOTE(JSON_EXTRACT(candidateJson, '$.context.jobId'))
    AND evidenceHash = JSON_UNQUOTE(JSON_EXTRACT(candidateJson, '$.context.evidenceHash'))
    AND TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00', evidenceCutoffAt) DIV 1000 = JSON_EXTRACT(candidateJson, '$.context.context.cutoffAt')
    AND ((modelVersionId IS NULL AND JSON_TYPE(JSON_EXTRACT(candidateJson, '$.context.pin')) = 'NULL') OR
      modelVersionId = JSON_UNQUOTE(JSON_EXTRACT(candidateJson, '$.context.pin.modelVersionId'))), FALSE) = TRUE);
ALTER TABLE MarketPrediction
  ADD CONSTRAINT MarketPrediction_family_check CHECK (family IN ('match-result', 'double-chance', 'total-goals', 'both-teams-to-score')),
  ADD CONSTRAINT MarketPrediction_integrity_check CHECK (integrity = SHA2(CAST(payloadJson AS CHAR), 256)),
  ADD CONSTRAINT MarketPrediction_time_check CHECK ((generatedAt IS NULL OR generatedAt <= retrievedAt)
    AND (providerUpdatedAt IS NULL OR providerUpdatedAt <= retrievedAt)),
  ADD CONSTRAINT MarketPrediction_payload_check CHECK (COALESCE(
    JSON_TYPE(payloadJson) = 'OBJECT' AND JSON_TYPE(JSON_EXTRACT(payloadJson, '$.available')) = 'BOOLEAN'
    AND ((available = 0 AND JSON_LENGTH(payloadJson) = 2 AND JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.available')) = 'false'
      AND unavailableReason = JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.reason')) AND CHAR_LENGTH(unavailableReason) > 0
      AND source IS NULL AND selection IS NULL AND selectedProbability IS NULL
      AND probability1 IS NULL AND probability2 IS NULL AND probability3 IS NULL
      AND generatedAt IS NULL AND retrievedAt IS NULL AND providerUpdatedAt IS NULL) OR
    (available = 1 AND JSON_LENGTH(payloadJson) = 6 AND JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.available')) = 'true'
      AND unavailableReason IS NULL AND source IN ('ai', 'api-football') AND selection IS NOT NULL
      AND source = JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.market.source'))
      AND source = JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.provenance.kind'))
      AND family = JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.market.family'))
      AND selection = JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.market.selection'))
      AND selectedProbability = CAST(JSON_EXTRACT(payloadJson, '$.market.selectedProbability') AS DOUBLE)
      AND JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.market.ruleVersion')) = 'regulation-markets-v1'
      AND JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.market.period')) = 'regulation-including-stoppage-time'
      AND probability1 > 0 AND probability1 < 1 AND probability2 > 0 AND probability2 < 1
      AND (probability3 IS NULL OR (probability3 > 0 AND probability3 < 1))
      AND retrievedAt IS NOT NULL
      AND TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00', retrievedAt) DIV 1000 = JSON_EXTRACT(payloadJson, '$.timestamps.retrievedAt')
      AND ((generatedAt IS NULL AND JSON_TYPE(JSON_EXTRACT(payloadJson, '$.timestamps.generatedAt')) = 'NULL') OR
        TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00', generatedAt) DIV 1000 = JSON_EXTRACT(payloadJson, '$.timestamps.generatedAt'))
      AND ((providerUpdatedAt IS NULL AND JSON_TYPE(JSON_EXTRACT(payloadJson, '$.timestamps.providerUpdatedAt')) = 'NULL') OR
        TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00', providerUpdatedAt) DIV 1000 = JSON_EXTRACT(payloadJson, '$.timestamps.providerUpdatedAt'))
      AND (source <> 'ai' OR JSON_TYPE(JSON_EXTRACT(payloadJson, '$.fallback')) = 'NULL')
      AND (source <> 'api-football' OR JSON_TYPE(JSON_EXTRACT(payloadJson, '$.fallback')) = 'OBJECT')
      AND (
        (family = 'match-result'
          AND JSON_LENGTH(JSON_EXTRACT(payloadJson, '$.market.probabilities')) = 3
          AND probability1 = CAST(JSON_EXTRACT(payloadJson, '$.market.probabilities."home-win"') AS DOUBLE)
          AND probability2 = CAST(JSON_EXTRACT(payloadJson, '$.market.probabilities."draw"') AS DOUBLE)
          AND probability3 = CAST(JSON_EXTRACT(payloadJson, '$.market.probabilities."away-win"') AS DOUBLE)
          AND ABS(probability1 + probability2 + probability3 - 1) <= 0.0010000000000002
          AND selectedProbability = GREATEST(probability1, probability2, probability3)
          AND selection = CASE WHEN probability1 = GREATEST(probability1, probability2, probability3) THEN 'home-win' WHEN probability2 = GREATEST(probability1, probability2, probability3) THEN 'draw' ELSE 'away-win' END)
        OR
        (family = 'double-chance'
          AND JSON_LENGTH(JSON_EXTRACT(payloadJson, '$.market.probabilities')) = 3
          AND probability1 = CAST(JSON_EXTRACT(payloadJson, '$.market.probabilities."home-or-draw"') AS DOUBLE)
          AND probability2 = CAST(JSON_EXTRACT(payloadJson, '$.market.probabilities."away-or-draw"') AS DOUBLE)
          AND probability3 = CAST(JSON_EXTRACT(payloadJson, '$.market.probabilities."home-or-away"') AS DOUBLE)
          AND JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.market.derivedFrom')) = 'match-result'
          AND selectedProbability = GREATEST(probability1, probability2, probability3)
          AND selection = CASE WHEN probability1 = GREATEST(probability1, probability2, probability3) THEN 'home-or-draw' WHEN probability2 = GREATEST(probability1, probability2, probability3) THEN 'away-or-draw' ELSE 'home-or-away' END)
        OR
        (family = 'total-goals'
          AND JSON_LENGTH(JSON_EXTRACT(payloadJson, '$.market.probabilities')) = 2
          AND probability1 = CAST(JSON_EXTRACT(payloadJson, '$.market.probabilities."over-2.5"') AS DOUBLE)
          AND probability2 = CAST(JSON_EXTRACT(payloadJson, '$.market.probabilities."under-2.5"') AS DOUBLE)
          AND probability3 IS NULL
          AND ABS(probability1 + probability2 - 1) <= 0.0010000000000002
          AND JSON_EXTRACT(payloadJson, '$.market.line') = 2.5
          AND selectedProbability = GREATEST(probability1, probability2)
          AND selection = CASE WHEN probability1 = GREATEST(probability1, probability2) THEN 'over-2.5' ELSE 'under-2.5' END)
        OR
        (family = 'both-teams-to-score'
          AND JSON_LENGTH(JSON_EXTRACT(payloadJson, '$.market.probabilities')) = 2
          AND probability1 = CAST(JSON_EXTRACT(payloadJson, '$.market.probabilities."yes"') AS DOUBLE)
          AND probability2 = CAST(JSON_EXTRACT(payloadJson, '$.market.probabilities."no"') AS DOUBLE)
          AND probability3 IS NULL
          AND ABS(probability1 + probability2 - 1) <= 0.0010000000000002
          AND selectedProbability = GREATEST(probability1, probability2)
          AND selection = CASE WHEN probability1 = GREATEST(probability1, probability2) THEN 'yes' ELSE 'no' END)
      ))), FALSE) = TRUE);
ALTER TABLE PredictionAudit
  ADD CONSTRAINT PredictionAudit_event_check CHECK (version > 0 AND kind IN ('cycle-created', 'cycle-changed', 'revision-recorded')
    AND eventKey REGEXP '^[a-f0-9]{64}$' AND requestHash REGEXP '^[a-f0-9]{64}$'
    AND CHAR_LENGTH(TRIM(actor)) > 0 AND CHAR_LENGTH(TRIM(reason)) > 0 AND CHAR_LENGTH(TRIM(evidenceRef)) > 0),
  ADD CONSTRAINT PredictionAudit_integrity_check CHECK (integrity = SHA2(CONCAT(eventKey, ':', requestHash, ':',
    COALESCE(CAST(beforeJson AS CHAR), 'null'), ':', CAST(afterJson AS CHAR)), 256));
