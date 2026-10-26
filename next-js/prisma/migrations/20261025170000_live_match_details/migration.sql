-- A stable account lease and bounded current/final occurrence snapshot. No per-minute archive.
CREATE TABLE LiveMatchPollerLease (
  accountKey CHAR(64) NOT NULL, ownerId CHAR(64) NULL,
  fence BIGINT UNSIGNED NOT NULL DEFAULT 0, leaseUntil DATETIME(3) NOT NULL,
  PRIMARY KEY (accountKey),
  CONSTRAINT LiveMatchPollerLease_key_check CHECK (accountKey REGEXP '^[a-f0-9]{64}$'),
  CONSTRAINT LiveMatchPollerLease_owner_check CHECK (ownerId IS NULL OR ownerId REGEXP '^[a-f0-9]{64}$')
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE LiveMatchSnapshot (
  id CHAR(64) NOT NULL, fixtureId CHAR(36) NOT NULL, cycleId CHAR(36) NULL,
  kickoffAt DATETIME(3) NULL, homeTeamId CHAR(36) NOT NULL, awayTeamId CHAR(36) NOT NULL,
  receivedAt DATETIME(3) NULL, bodyJson JSON NULL, integrity CHAR(64) NULL,
  attemptedAt DATETIME(3) NOT NULL, nextPollAt DATETIME(3) NOT NULL,
  firstFinalAt DATETIME(3) NULL, failures INTEGER UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  INDEX LiveMatchSnapshot_occurrence_idx (fixtureId, cycleId, kickoffAt),
  INDEX LiveMatchSnapshot_cycleId_fixtureId_idx (cycleId, fixtureId),
  INDEX LiveMatchSnapshot_nextPollAt_attemptedAt_fixtureId_idx (nextPollAt, attemptedAt, fixtureId),
  CONSTRAINT LiveMatchSnapshot_fixtureId_fkey FOREIGN KEY (fixtureId) REFERENCES FootballFixture(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT LiveMatchSnapshot_cycleId_fixtureId_fkey FOREIGN KEY (cycleId, fixtureId) REFERENCES PredictionCycle(id, fixtureId) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT LiveMatchSnapshot_id_check CHECK (id REGEXP '^[a-f0-9]{64}$'),
  CONSTRAINT LiveMatchSnapshot_participant_check CHECK (homeTeamId <> awayTeamId),
  CONSTRAINT LiveMatchSnapshot_schedule_check CHECK (nextPollAt >= attemptedAt),
  CONSTRAINT LiveMatchSnapshot_body_check CHECK (
    (bodyJson IS NULL AND receivedAt IS NULL AND integrity IS NULL) OR
    (bodyJson IS NOT NULL AND receivedAt IS NOT NULL AND integrity IS NOT NULL
      AND JSON_TYPE(bodyJson) = 'OBJECT' AND OCTET_LENGTH(CAST(bodyJson AS CHAR)) <= 300000
      AND integrity REGEXP '^[a-f0-9]{64}$'))
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TRIGGER LiveMatchSnapshot_insert_check BEFORE INSERT ON LiveMatchSnapshot FOR EACH ROW
BEGIN
  IF NEW.bodyJson IS NOT NULL AND NEW.integrity <> SHA2(CAST(NEW.bodyJson AS CHAR), 256) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid live match snapshot integrity';
  END IF;
END;

CREATE TRIGGER LiveMatchSnapshot_update_check BEFORE UPDATE ON LiveMatchSnapshot FOR EACH ROW
BEGIN
  IF NEW.id <> OLD.id OR NEW.fixtureId <> OLD.fixtureId OR NOT (NEW.cycleId <=> OLD.cycleId)
    OR NOT (NEW.kickoffAt <=> OLD.kickoffAt) OR NEW.homeTeamId <> OLD.homeTeamId OR NEW.awayTeamId <> OLD.awayTeamId
    OR (OLD.receivedAt IS NOT NULL AND (NEW.receivedAt IS NULL OR NEW.receivedAt < OLD.receivedAt))
    OR (NEW.receivedAt = OLD.receivedAt AND NOT (NEW.integrity <=> OLD.integrity))
    OR (OLD.firstFinalAt IS NOT NULL AND NOT (NEW.firstFinalAt <=> OLD.firstFinalAt)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Live match occurrence identity and clock are protected';
  END IF;
  IF NEW.bodyJson IS NOT NULL AND NEW.integrity <> SHA2(CAST(NEW.bodyJson AS CHAR), 256) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid live match snapshot integrity';
  END IF;
END;

-- Every public cache hit verifies this durable generation. No minute-by-minute invalidation journal is needed.
CREATE TRIGGER PublicCache_LiveMatchSnapshot_insert AFTER INSERT ON LiveMatchSnapshot FOR EACH ROW
BEGIN
  IF NEW.bodyJson IS NOT NULL THEN
    INSERT INTO PublicCacheTag (tag, generation) VALUES (CONCAT('fixture:', LOWER(NEW.fixtureId)), 1)
      ON DUPLICATE KEY UPDATE generation = PublicCacheTag.generation + 1;
  END IF;
END;

CREATE TRIGGER PublicCache_LiveMatchSnapshot_update AFTER UPDATE ON LiveMatchSnapshot FOR EACH ROW
BEGIN
  IF NOT (NEW.integrity <=> OLD.integrity) THEN
    INSERT INTO PublicCacheTag (tag, generation) VALUES (CONCAT('fixture:', LOWER(NEW.fixtureId)), 1)
      ON DUPLICATE KEY UPDATE generation = PublicCacheTag.generation + 1;
  END IF;
END;
