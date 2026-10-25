-- Production (MariaDB 11.4) apply script for migration 20261025180538_prediction_quotes.
-- Adds PredictionQuote: the original public price beside each available family of a published revision, written once
-- in that revision's publication transaction. It makes the same table, keys, checks and triggers as the committed
-- migration.sql, which uses no MySQL-only syntax but needs the client's block delimiter for its triggers. Creating the
-- foreign key reads PredictionSet's key index only; no existing table is rebuilt. The importing account becomes the
-- triggers' definer; keep it while the triggers are in use.
-- Take and verify a private backup first, then import this file with the migration account, with phpMyAdmin or:
--   mariadb <database> < this-file
-- Every step that fails stops the import before the migration is recorded. MariaDB DDL is not transactional: if a step
-- fails after the guard, restore the backup rather than importing again. Apply the PredictionQuote grant afterwards, and
-- only then enable provider odds display (docs/provider-odds.md#application-grants).

-- 1. Guard: the provider workload budget migration is applied, this one is not, and PredictionSet is InnoDB.
DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261025171000_provider_workload_budget'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Apply 20261025171000_provider_workload_budget first; nothing was imported.';
  END IF;
  IF (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261025180538_prediction_quotes') <> 0
    OR (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PredictionQuote') <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Prediction quotes are already applied or partly applied; nothing was imported.';
  END IF;
  IF (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND ENGINE = 'InnoDB'
      AND TABLE_NAME = 'PredictionSet') <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'PredictionSet is missing or not InnoDB; nothing was imported.';
  END IF;
END //
DELIMITER ;

-- 2. The schema, as in migration.sql.
CREATE TABLE `PredictionQuote` (
    `revisionId` CHAR(36) NOT NULL,
    `cycleId` CHAR(36) NOT NULL,
    `fixtureId` CHAR(36) NOT NULL,
    `family` VARCHAR(32) NOT NULL,
    `selection` VARCHAR(32) NOT NULL,
    `state` VARCHAR(16) NOT NULL,
    `reason` VARCHAR(32) NULL,
    `snapshotId` CHAR(64) NULL,
    `displayHundredths` INTEGER UNSIGNED NULL,
    `quotedAt` DATETIME(3) NULL,
    `recordedAt` DATETIME(3) NOT NULL,
    `integrity` CHAR(64) NOT NULL,
    `body` JSON NOT NULL,

    INDEX `PredictionQuote_revisionId_cycleId_fixtureId_idx`(`revisionId`, `cycleId`, `fixtureId`),
    PRIMARY KEY (`revisionId`, `family`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

ALTER TABLE `PredictionQuote` ADD CONSTRAINT `PredictionQuote_prediction_fkey` FOREIGN KEY (`revisionId`, `cycleId`, `fixtureId`) REFERENCES `PredictionSet`(`id`, `cycleId`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE PredictionQuote ADD CONSTRAINT PredictionQuote_identity_check CHECK (COALESCE(
  (family = 'match-result' AND selection IN ('home-win', 'draw', 'away-win'))
  OR (family = 'double-chance' AND selection IN ('home-or-draw', 'away-or-draw', 'home-or-away'))
  OR (family = 'total-goals' AND selection IN ('over-2.5', 'under-2.5'))
  OR (family = 'both-teams-to-score' AND selection IN ('yes', 'no')), FALSE) = TRUE);
ALTER TABLE PredictionQuote ADD CONSTRAINT PredictionQuote_state_check CHECK (COALESCE(
  (state = 'quoted' AND reason IS NULL AND snapshotId REGEXP '^[a-f0-9]{64}$' AND displayHundredths BETWEEN 101 AND 100000
    AND quotedAt IS NOT NULL AND quotedAt <= recordedAt)
  OR (state = 'unavailable' AND reason IN ('no-public-price', 'price-state-expired', 'unsupported-price-basis', 'invalid-public-price')
    AND snapshotId IS NULL AND displayHundredths IS NULL AND quotedAt IS NULL), FALSE) = TRUE);
ALTER TABLE PredictionQuote ADD CONSTRAINT PredictionQuote_body_check CHECK (COALESCE(
  JSON_TYPE(body) = 'OBJECT' AND JSON_EXTRACT(body, '$.version') = 1
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.revisionId')) = revisionId AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.cycleId')) = cycleId
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.fixtureId')) = fixtureId AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.family')) = family
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.selection')) = selection AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.state')) = state
  AND TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00', recordedAt) DIV 1000 = JSON_EXTRACT(body, '$.recordedAt')
  AND integrity = SHA2(CAST(body AS CHAR), 256), FALSE) = TRUE);

-- 3. The triggers. With the block delimiter the semicolons inside each body stay in it, and the statement ends at END.
DELIMITER //
CREATE OR REPLACE TRIGGER PredictionQuote_no_update BEFORE UPDATE ON PredictionQuote FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Prediction quotes are append-only';
END //
CREATE OR REPLACE TRIGGER PredictionQuote_no_delete BEFORE DELETE ON PredictionQuote FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Prediction quotes are append-only';
END //

-- 4. Verification: stop before recording unless the table, its foreign key, the three checks and the two triggers exist.
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PredictionQuote'
      AND ENGINE = 'InnoDB' AND TABLE_COLLATION = 'utf8mb4_bin') <> 1
    OR (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_NAME = 'PredictionQuote_prediction_fkey' AND REFERENCED_TABLE_NAME = 'PredictionSet') <> 1
    OR (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'CHECK'
      AND CONSTRAINT_NAME IN ('PredictionQuote_identity_check', 'PredictionQuote_state_check', 'PredictionQuote_body_check')) <> 3
    OR (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE() AND EVENT_OBJECT_TABLE = 'PredictionQuote'
      AND TRIGGER_NAME IN ('PredictionQuote_no_update', 'PredictionQuote_no_delete')
      AND ACTION_TIMING = 'BEFORE' AND ACTION_STATEMENT LIKE 'BEGIN%' AND ACTION_STATEMENT LIKE '%END') <> 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Prediction quotes do not match the reviewed migration; it was not recorded.';
  END IF;
END //
DELIMITER ;

-- 5. Record the migration (checksum = SHA-256 of the committed migration.sql), once.
SET @record := 'INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
  SELECT UUID(), ''00845040765668ab09a1c5807a2c841a98d77d3a96e7714f03efc882505f2802'', NOW(3), ''20261025180538_prediction_quotes'', NULL, NULL, NOW(3), 1 FROM DUAL
  WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = ''20261025180538_prediction_quotes'')';
PREPARE record_migration FROM @record;
EXECUTE record_migration;
DEALLOCATE PREPARE record_migration;

-- 6. Closing check. Expect one migration row with finished_at set, and the two PredictionQuote triggers.
SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name = '20261025180538_prediction_quotes';
SELECT TRIGGER_NAME, ACTION_TIMING, EVENT_MANIPULATION FROM information_schema.TRIGGERS
  WHERE TRIGGER_SCHEMA = DATABASE() AND EVENT_OBJECT_TABLE = 'PredictionQuote' ORDER BY TRIGGER_NAME;
