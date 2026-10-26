CREATE TABLE `OperationsMonitorState` (
  `id` TINYINT UNSIGNED NOT NULL,
  `stateJson` JSON NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `OperationsMonitorState_singleton` CHECK (`id` = 1)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

INSERT INTO `OperationsMonitorState` (`id`, `stateJson`)
VALUES (1, '{"version":1,"policyHash":null,"at":0,"observedAt":0,"sequence":0,"slots":[]}');

CREATE INDEX `DailyRunImport_finishedAt_idx` ON `DailyRunImport` (`finishedAt`);
CREATE INDEX `PredictionSet_publishedAt_idx` ON `PredictionSet` (`publishedAt`);
CREATE INDEX `RecoveryAudit_at_idx` ON `RecoveryAudit` (`at`);
CREATE INDEX `DurableJob_updatedAt_idx` ON `DurableJob` (`updatedAt`);
CREATE INDEX `DurableJob_finishedAt_idx` ON `DurableJob` (`finishedAt`);
CREATE INDEX `PredictionRefreshResult_at_idx` ON `PredictionRefreshResult` (`at`);
CREATE INDEX `DurableJobAttempt_finishedAt_idx` ON `DurableJobAttempt` (`finishedAt`);
