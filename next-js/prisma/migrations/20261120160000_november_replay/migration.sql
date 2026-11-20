-- Private retrospective evidence and action history. Only the separate, compact
-- pointer can affect display. Original publication and settlement rows stay intact.
CREATE TABLE NovemberReplayRevision (
  id CHAR(64) NOT NULL,
  fixtureId CHAR(36) NOT NULL,
  kickoffAt DATETIME(3) NULL,
  cycleId CHAR(36) NULL,
  scheduleVersion INT UNSIGNED NULL,
  sourceRevisionId CHAR(36) NULL,
  evidenceCutoffAt DATETIME(3) NULL,
  evidenceHash CHAR(64) NOT NULL,
  generatedAt DATETIME(3) NOT NULL,
  stagedAt DATETIME(3) NOT NULL,
  status VARCHAR(16) NOT NULL,
  integrity CHAR(64) NOT NULL,
  body JSON NOT NULL,
  PRIMARY KEY (id),
  UNIQUE INDEX NovemberReplayRevision_id_fixtureId_key (id, fixtureId),
  INDEX NovemberReplayRevision_fixtureId_kickoffAt_idx (fixtureId, kickoffAt),
  INDEX NovemberReplayRevision_cycle_idx (cycleId, fixtureId),
  INDEX NovemberReplayRevision_source_idx (sourceRevisionId, cycleId, fixtureId),
  CONSTRAINT NovemberReplayRevision_fixtureId_fkey FOREIGN KEY (fixtureId)
    REFERENCES FootballFixture(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT NovemberReplayRevision_cycle_fkey FOREIGN KEY (cycleId, fixtureId)
    REFERENCES PredictionCycle(id, fixtureId) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT NovemberReplayRevision_source_fkey FOREIGN KEY (sourceRevisionId, cycleId, fixtureId)
    REFERENCES PredictionSet(id, cycleId, fixtureId) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT NovemberReplayRevision_body_check CHECK (COALESCE(
    id REGEXP '^[a-f0-9]{64}$' AND evidenceHash REGEXP '^[a-f0-9]{64}$'
    AND integrity=SHA2(CAST(body AS CHAR CHARACTER SET utf8mb4),256) AND JSON_TYPE(JSON_EXTRACT(body, '$.canonicalBody'))='STRING'
    AND stagedAt>=generatedAt AND status IN ('estimated','abstained')
    AND (kickoffAt IS NULL OR (kickoffAt>='2026-10-31 21:00:00.000' AND kickoffAt<'2026-11-30 21:00:00.000'))
    AND (evidenceCutoffAt IS NULL OR (kickoffAt IS NOT NULL AND evidenceCutoffAt<kickoffAt AND evidenceCutoffAt<=generatedAt))
    AND (scheduleVersion IS NULL OR (cycleId IS NOT NULL AND scheduleVersion>0))
    AND (sourceRevisionId IS NULL OR cycleId IS NOT NULL)
    AND (status='abstained' OR (kickoffAt IS NOT NULL AND evidenceCutoffAt IS NOT NULL AND generatedAt>=kickoffAt)), FALSE) = TRUE)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE NovemberReplayProjection (
  fixtureId CHAR(36) NOT NULL,
  revisionId CHAR(64) NULL,
  sourceRevisionId CHAR(36) NULL,
  cycleId CHAR(36) NULL,
  scheduleVersion INT UNSIGNED NULL,
  kickoffAt DATETIME(3) NULL,
  evidenceCutoffAt DATETIME(3) NULL,
  activationOperationId VARCHAR(128) NULL,
  changedAt DATETIME(3) NOT NULL,
  integrity CHAR(64) NULL,
  body JSON NULL,
  PRIMARY KEY (fixtureId),
  INDEX NovemberReplayProjection_revision_idx (revisionId, fixtureId),
  CONSTRAINT NovemberReplayProjection_fixtureId_fkey FOREIGN KEY (fixtureId)
    REFERENCES FootballFixture(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT NovemberReplayProjection_revision_fkey FOREIGN KEY (revisionId, fixtureId)
    REFERENCES NovemberReplayRevision(id, fixtureId) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT NovemberReplayProjection_body_check CHECK (COALESCE(
    (revisionId IS NULL AND sourceRevisionId IS NULL AND cycleId IS NULL AND scheduleVersion IS NULL
      AND kickoffAt IS NULL AND evidenceCutoffAt IS NULL AND activationOperationId IS NULL AND integrity IS NULL AND body IS NULL)
    OR
    (revisionId IS NOT NULL AND sourceRevisionId IS NOT NULL AND cycleId IS NOT NULL AND scheduleVersion>0
      AND kickoffAt>='2026-10-31 21:00:00.000' AND kickoffAt<'2026-11-30 21:00:00.000' AND evidenceCutoffAt<kickoffAt
      AND changedAt>=kickoffAt AND activationOperationId IS NOT NULL AND integrity=SHA2(CAST(body AS CHAR CHARACTER SET utf8mb4),256)
      AND JSON_TYPE(JSON_EXTRACT(body, '$.canonicalBody'))='STRING'), FALSE) = TRUE)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE NovemberReplayAction (
  id CHAR(64) NOT NULL,
  fixtureId CHAR(36) NOT NULL,
  operationId VARCHAR(128) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  activationOperationId VARCHAR(128) NOT NULL,
  revisionId CHAR(64) NOT NULL,
  at DATETIME(3) NOT NULL,
  integrity CHAR(64) NOT NULL,
  body JSON NOT NULL,
  PRIMARY KEY (id),
  UNIQUE INDEX NovemberReplayAction_operationId_fixtureId_key (operationId, fixtureId),
  INDEX NovemberReplayAction_revision_idx (revisionId, fixtureId),
  CONSTRAINT NovemberReplayAction_revision_fkey FOREIGN KEY (revisionId, fixtureId)
    REFERENCES NovemberReplayRevision(id, fixtureId) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT NovemberReplayAction_body_check CHECK (COALESCE(
    id REGEXP '^[a-f0-9]{64}$' AND integrity=SHA2(CAST(body AS CHAR CHARACTER SET utf8mb4),256)
    AND JSON_TYPE(JSON_EXTRACT(body, '$.canonicalBody'))='STRING'
    AND ((kind='activate' AND operationId=activationOperationId) OR (kind='rollback' AND operationId<>activationOperationId)), FALSE) = TRUE)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TRIGGER NovemberReplayRevision_no_update BEFORE UPDATE ON NovemberReplayRevision FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retrospective revision is append-only';
CREATE TRIGGER NovemberReplayRevision_no_delete BEFORE DELETE ON NovemberReplayRevision FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retrospective revision is append-only';
CREATE TRIGGER NovemberReplayAction_no_update BEFORE UPDATE ON NovemberReplayAction FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retrospective action is append-only';
CREATE TRIGGER NovemberReplayAction_no_delete BEFORE DELETE ON NovemberReplayAction FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retrospective action is append-only';

CREATE TRIGGER NovemberReplayProjection_no_delete BEFORE DELETE ON NovemberReplayProjection FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Retrospective projection is cleared by a reviewed rollback';

-- The existing catalog generation covers every browsing timezone. Revision
-- staging and no-op retries never touch it.
CREATE TRIGGER PublicCache_NovemberReplayProjection_update AFTER UPDATE ON NovemberReplayProjection FOR EACH ROW
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT 'global:catalog',1 FROM DUAL WHERE NOT (OLD.revisionId <=> NEW.revisionId)
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;

CREATE TRIGGER PublicCache_NovemberReplayProjection_log AFTER UPDATE ON NovemberReplayProjection FOR EACH ROW
  FOLLOWS PublicCache_NovemberReplayProjection_update
  INSERT INTO PublicCacheInvalidation (tag,generation,at)
    SELECT tag,generation,UTC_TIMESTAMP(3) FROM PublicCacheTag
    WHERE tag='global:catalog' AND NOT (OLD.revisionId <=> NEW.revisionId);
