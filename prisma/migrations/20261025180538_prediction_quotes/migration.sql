-- Original public quote beside each available family of a published revision (A04/T02). Rows are written once, in that
-- revision's own publication transaction, only while provider odds display is enabled and rights are verified. The
-- application role gets SELECT and INSERT only; triggers refuse every UPDATE and DELETE. There is deliberately no foreign
-- key to ProviderOddsSnapshot: snapshotId is a provenance hash, so a future reviewed snapshot purge is not blocked.

-- CreateTable
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

-- AddForeignKey
ALTER TABLE `PredictionQuote` ADD CONSTRAINT `PredictionQuote_prediction_fkey` FOREIGN KEY (`revisionId`, `cycleId`, `fixtureId`) REFERENCES `PredictionSet`(`id`, `cycleId`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Reviewed hand-written constraints. Quotes are written once, in the revision's publication transaction.
-- Every CHECK is NULL-safe: MySQL accepts a CHECK that evaluates to NULL, so each is COALESCE(..., FALSE) = TRUE.
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
CREATE TRIGGER PredictionQuote_no_update BEFORE UPDATE ON PredictionQuote FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Prediction quotes are append-only';
END;
CREATE TRIGGER PredictionQuote_no_delete BEFORE DELETE ON PredictionQuote FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Prediction quotes are append-only';
END;
