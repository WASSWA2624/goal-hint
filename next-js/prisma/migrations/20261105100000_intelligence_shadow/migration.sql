-- Additive, disabled-by-default shadow persistence. Public prediction tables are untouched.
CREATE TABLE IntelligenceShadowState (
  fixtureId CHAR(36) NOT NULL,
  latestRevisionId CHAR(64) NULL,
  latestEligibleRevisionId CHAR(64) NULL,
  lastCheckedAt DATETIME(3) NOT NULL,
  checks BIGINT UNSIGNED NOT NULL DEFAULT 0,
  lastObservationJson JSON NULL,
  lastObservationHash CHAR(64) NULL,
  availability VARCHAR(24) NOT NULL,
  PRIMARY KEY (fixtureId),
  UNIQUE KEY IntelligenceShadowState_latestRevisionId_key (latestRevisionId),
  UNIQUE KEY IntelligenceShadowState_latestEligibleRevisionId_key (latestEligibleRevisionId),
  CONSTRAINT IntelligenceShadowState_fixtureId_fkey FOREIGN KEY (fixtureId) REFERENCES FootballFixture(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE IntelligenceShadowRevision (
  id CHAR(64) NOT NULL,
  fixtureId CHAR(36) NOT NULL,
  sequence INT UNSIGNED NOT NULL,
  semanticHash CHAR(64) NOT NULL,
  modelVersion VARCHAR(128) NOT NULL,
  createdAt DATETIME(3) NOT NULL,
  eligible BOOLEAN NOT NULL,
  bodyJson JSON NOT NULL,
  integrity CHAR(64) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY IntelligenceShadowRevision_fixtureId_sequence_key (fixtureId, sequence),
  KEY IntelligenceShadowRevision_fixtureId_createdAt_idx (fixtureId, createdAt),
  KEY IntelligenceShadowRevision_modelVersion_createdAt_idx (modelVersion, createdAt),
  CONSTRAINT IntelligenceShadowRevision_fixtureId_fkey FOREIGN KEY (fixtureId) REFERENCES IntelligenceShadowState(fixtureId) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT IntelligenceShadowRevision_shadow_only CHECK (COALESCE(JSON_UNQUOTE(JSON_EXTRACT(bodyJson, '$.forecast.mode')) = 'shadow' AND JSON_EXTRACT(bodyJson, '$.forecast.publish') = FALSE, FALSE) = TRUE)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

ALTER TABLE IntelligenceShadowState
  ADD CONSTRAINT IntelligenceShadowState_latestRevisionId_fkey FOREIGN KEY (latestRevisionId) REFERENCES IntelligenceShadowRevision(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT IntelligenceShadowState_latestEligibleRevisionId_fkey FOREIGN KEY (latestEligibleRevisionId) REFERENCES IntelligenceShadowRevision(id) ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE IntelligenceShadowCheck (
  id CHAR(64) NOT NULL,
  fixtureId CHAR(36) NOT NULL,
  checkedAt DATETIME(3) NOT NULL,
  requestHash CHAR(64) NOT NULL,
  outcome VARCHAR(24) NOT NULL,
  revisionId CHAR(64) NULL,
  PRIMARY KEY (id),
  KEY IntelligenceShadowCheck_fixtureId_checkedAt_idx (fixtureId, checkedAt),
  CONSTRAINT IntelligenceShadowCheck_fixtureId_fkey FOREIGN KEY (fixtureId) REFERENCES IntelligenceShadowState(fixtureId) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT IntelligenceShadowCheck_revisionId_fkey FOREIGN KEY (revisionId) REFERENCES IntelligenceShadowRevision(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TRIGGER IntelligenceShadowRevision_no_update BEFORE UPDATE ON IntelligenceShadowRevision FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Shadow forecast evidence is immutable.';
END;
CREATE TRIGGER IntelligenceShadowRevision_no_delete BEFORE DELETE ON IntelligenceShadowRevision FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Shadow forecast evidence is retained for evaluation.';
END;
