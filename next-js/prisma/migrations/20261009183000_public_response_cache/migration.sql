-- Shared cache only; trigger failures roll back their source mutation.
CREATE TABLE PublicCacheTag (
  tag VARCHAR(64) NOT NULL, generation BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (tag), CONSTRAINT PublicCacheTag_generation_check CHECK (generation > 0)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci ENGINE=InnoDB;
CREATE TABLE PublicResponseCache (
  `key` CHAR(64) NOT NULL, generations JSON NOT NULL, body JSON NOT NULL,
  createdAt DATETIME(3) NOT NULL, expiresAt DATETIME(3) NOT NULL,
  PRIMARY KEY (`key`), INDEX PublicResponseCache_expiresAt_key_idx (expiresAt, `key`),
  CONSTRAINT PublicResponseCache_expiry_check CHECK (expiresAt > createdAt)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci ENGINE=InnoDB;
CREATE TABLE PublicCacheInvalidation (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, tag VARCHAR(64) NOT NULL,
  generation BIGINT UNSIGNED NOT NULL, at DATETIME(3) NOT NULL, acknowledgedAt DATETIME(3) NULL,
  PRIMARY KEY (id), INDEX PublicCacheInvalidation_acknowledgedAt_id_idx (acknowledgedAt, id),
  CONSTRAINT PublicCacheInvalidation_generation_check CHECK (generation > 0)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci ENGINE=InnoDB;

CREATE TRIGGER PublicCache_FootballFixture_insert AFTER INSERT ON FootballFixture FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT CONCAT('fixture:', LOWER(NEW.id)) AS tag UNION SELECT CONCAT('date:', DATE_FORMAT(DATE_ADD(NEW.kickoff, INTERVAL 3 HOUR), '%Y-%m-%d')) AS tag) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT CONCAT('fixture:', LOWER(NEW.id)) AS tag UNION SELECT CONCAT('date:', DATE_FORMAT(DATE_ADD(NEW.kickoff, INTERVAL 3 HOUR), '%Y-%m-%d')) AS tag) tags ON tags.tag=t.tag;
END;

CREATE TRIGGER PublicCache_FootballFixture_update AFTER UPDATE ON FootballFixture FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT CONCAT('fixture:', LOWER(NEW.id)) AS tag UNION SELECT CONCAT('date:', DATE_FORMAT(DATE_ADD(OLD.kickoff, INTERVAL 3 HOUR), '%Y-%m-%d')) AS tag UNION SELECT CONCAT('date:', DATE_FORMAT(DATE_ADD(NEW.kickoff, INTERVAL 3 HOUR), '%Y-%m-%d')) AS tag) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT CONCAT('fixture:', LOWER(NEW.id)) AS tag UNION SELECT CONCAT('date:', DATE_FORMAT(DATE_ADD(OLD.kickoff, INTERVAL 3 HOUR), '%Y-%m-%d')) AS tag UNION SELECT CONCAT('date:', DATE_FORMAT(DATE_ADD(NEW.kickoff, INTERVAL 3 HOUR), '%Y-%m-%d')) AS tag) tags ON tags.tag=t.tag;
END;

CREATE TRIGGER PublicCache_PredictionChangeEvent_insert AFTER INSERT ON PredictionChangeEvent FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT CONCAT('fixture:', LOWER(NEW.fixtureId)) AS tag UNION SELECT CONCAT('date:', DATE_FORMAT(DATE_ADD(f.kickoff, INTERVAL 3 HOUR), '%Y-%m-%d')) AS tag FROM FootballFixture f WHERE f.id=NEW.fixtureId UNION SELECT CONCAT('date:', DATE_FORMAT(DATE_ADD(c.kickoffAt, INTERVAL 3 HOUR), '%Y-%m-%d')) AS tag FROM PredictionCycle c WHERE c.fixtureId=NEW.fixtureId) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT CONCAT('fixture:', LOWER(NEW.fixtureId)) AS tag UNION SELECT CONCAT('date:', DATE_FORMAT(DATE_ADD(f.kickoff, INTERVAL 3 HOUR), '%Y-%m-%d')) AS tag FROM FootballFixture f WHERE f.id=NEW.fixtureId UNION SELECT CONCAT('date:', DATE_FORMAT(DATE_ADD(c.kickoffAt, INTERVAL 3 HOUR), '%Y-%m-%d')) AS tag FROM PredictionCycle c WHERE c.fixtureId=NEW.fixtureId) tags ON tags.tag=t.tag;
END;

CREATE TRIGGER PublicCache_PredictionCycle_insert AFTER INSERT ON PredictionCycle FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT CONCAT('fixture:', LOWER(NEW.fixtureId)) AS tag UNION SELECT CONCAT('date:', DATE_FORMAT(DATE_ADD(NEW.kickoffAt, INTERVAL 3 HOUR), '%Y-%m-%d')) AS tag) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT CONCAT('fixture:', LOWER(NEW.fixtureId)) AS tag UNION SELECT CONCAT('date:', DATE_FORMAT(DATE_ADD(NEW.kickoffAt, INTERVAL 3 HOUR), '%Y-%m-%d')) AS tag) tags ON tags.tag=t.tag;
END;

CREATE TRIGGER PublicCache_PredictionCycle_update AFTER UPDATE ON PredictionCycle FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT CONCAT('fixture:', LOWER(NEW.fixtureId)) AS tag UNION SELECT CONCAT('date:', DATE_FORMAT(DATE_ADD(NEW.kickoffAt, INTERVAL 3 HOUR), '%Y-%m-%d')) AS tag UNION SELECT CONCAT('date:', DATE_FORMAT(DATE_ADD(OLD.kickoffAt, INTERVAL 3 HOUR), '%Y-%m-%d')) AS tag) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT CONCAT('fixture:', LOWER(NEW.fixtureId)) AS tag UNION SELECT CONCAT('date:', DATE_FORMAT(DATE_ADD(NEW.kickoffAt, INTERVAL 3 HOUR), '%Y-%m-%d')) AS tag UNION SELECT CONCAT('date:', DATE_FORMAT(DATE_ADD(OLD.kickoffAt, INTERVAL 3 HOUR), '%Y-%m-%d')) AS tag) tags ON tags.tag=t.tag;
END;

CREATE TRIGGER PublicCache_DailyRun_insert AFTER INSERT ON DailyRun FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT 'global:progress' AS tag) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT 'global:progress' AS tag) tags ON tags.tag=t.tag;
END;

CREATE TRIGGER PublicCache_DailyRun_update AFTER UPDATE ON DailyRun FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT 'global:progress' AS tag) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT 'global:progress' AS tag) tags ON tags.tag=t.tag;
END;

CREATE TRIGGER PublicCache_DailyRunImport_insert AFTER INSERT ON DailyRunImport FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT 'global:progress' AS tag) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT 'global:progress' AS tag) tags ON tags.tag=t.tag;
END;

CREATE TRIGGER PublicCache_DailyRunImport_update AFTER UPDATE ON DailyRunImport FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT 'global:progress' AS tag) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT 'global:progress' AS tag) tags ON tags.tag=t.tag;
END;

CREATE TRIGGER PublicCache_RunFixture_insert AFTER INSERT ON RunFixture FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT 'global:progress' AS tag) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT 'global:progress' AS tag) tags ON tags.tag=t.tag;
END;

CREATE TRIGGER PublicCache_RunFixture_update AFTER UPDATE ON RunFixture FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT 'global:progress' AS tag) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT 'global:progress' AS tag) tags ON tags.tag=t.tag;
END;

CREATE TRIGGER PublicCache_DailyRunManifest_insert AFTER INSERT ON DailyRunManifest FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT 'global:progress' AS tag) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT 'global:progress' AS tag) tags ON tags.tag=t.tag;
END;

CREATE TRIGGER PublicCache_FootballImport_insert AFTER INSERT ON FootballImport FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT 'global:progress' AS tag) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT 'global:progress' AS tag) tags ON tags.tag=t.tag;
END;

CREATE TRIGGER PublicCache_PredictionRefreshOutcome_insert AFTER INSERT ON PredictionRefreshOutcome FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT 'global:progress' AS tag) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT 'global:progress' AS tag) tags ON tags.tag=t.tag;
END;

CREATE TRIGGER PublicCache_DurableJob_insert AFTER INSERT ON DurableJob FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT 'global:progress' AS tag) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT 'global:progress' AS tag) tags ON tags.tag=t.tag;
END;

CREATE TRIGGER PublicCache_DurableJob_update AFTER UPDATE ON DurableJob FOR EACH ROW
BEGIN
  IF NOT (NEW.state <=> OLD.state) OR NOT (NEW.terminalReason <=> OLD.terminalReason) THEN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT 'global:progress' AS tag) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT 'global:progress' AS tag) tags ON tags.tag=t.tag;
  END IF;
END;

CREATE TRIGGER PublicCache_FixtureLifecycleState_insert AFTER INSERT ON FixtureLifecycleState FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT CONCAT('fixture:', LOWER(NEW.fixtureId)) AS tag UNION SELECT CONCAT('date:', DATE_FORMAT(DATE_ADD(f.kickoff, INTERVAL 3 HOUR), '%Y-%m-%d')) AS tag FROM FootballFixture f WHERE f.id=NEW.fixtureId) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT CONCAT('fixture:', LOWER(NEW.fixtureId)) AS tag UNION SELECT CONCAT('date:', DATE_FORMAT(DATE_ADD(f.kickoff, INTERVAL 3 HOUR), '%Y-%m-%d')) AS tag FROM FootballFixture f WHERE f.id=NEW.fixtureId) tags ON tags.tag=t.tag;
END;

CREATE TRIGGER PublicCache_FixtureLifecycleState_update AFTER UPDATE ON FixtureLifecycleState FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT CONCAT('fixture:', LOWER(NEW.fixtureId)) AS tag UNION SELECT CONCAT('date:', DATE_FORMAT(DATE_ADD(f.kickoff, INTERVAL 3 HOUR), '%Y-%m-%d')) AS tag FROM FootballFixture f WHERE f.id=NEW.fixtureId) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT CONCAT('fixture:', LOWER(NEW.fixtureId)) AS tag UNION SELECT CONCAT('date:', DATE_FORMAT(DATE_ADD(f.kickoff, INTERVAL 3 HOUR), '%Y-%m-%d')) AS tag FROM FootballFixture f WHERE f.id=NEW.fixtureId) tags ON tags.tag=t.tag;
END;

CREATE TRIGGER PublicCache_FootballTeam_insert AFTER INSERT ON FootballTeam FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT 'global:catalog' AS tag) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT 'global:catalog' AS tag) tags ON tags.tag=t.tag;
END;

CREATE TRIGGER PublicCache_FootballTeam_update AFTER UPDATE ON FootballTeam FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT 'global:catalog' AS tag) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT 'global:catalog' AS tag) tags ON tags.tag=t.tag;
END;

CREATE TRIGGER PublicCache_FootballTeamAlias_insert AFTER INSERT ON FootballTeamAlias FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT 'global:catalog' AS tag) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT 'global:catalog' AS tag) tags ON tags.tag=t.tag;
END;

CREATE TRIGGER PublicCache_FootballTeamAlias_update AFTER UPDATE ON FootballTeamAlias FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT 'global:catalog' AS tag) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT 'global:catalog' AS tag) tags ON tags.tag=t.tag;
END;

CREATE TRIGGER PublicCache_FootballCompetition_insert AFTER INSERT ON FootballCompetition FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT 'global:catalog' AS tag) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT 'global:catalog' AS tag) tags ON tags.tag=t.tag;
END;

CREATE TRIGGER PublicCache_FootballCompetition_update AFTER UPDATE ON FootballCompetition FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT 'global:catalog' AS tag) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT 'global:catalog' AS tag) tags ON tags.tag=t.tag;
END;

CREATE TRIGGER PublicCache_FootballCompetitionAlias_insert AFTER INSERT ON FootballCompetitionAlias FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT 'global:catalog' AS tag) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT 'global:catalog' AS tag) tags ON tags.tag=t.tag;
END;

CREATE TRIGGER PublicCache_FootballCompetitionAlias_update AFTER UPDATE ON FootballCompetitionAlias FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT 'global:catalog' AS tag) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT 'global:catalog' AS tag) tags ON tags.tag=t.tag;
END;

CREATE TRIGGER PublicCache_FootballCompetitionProvider_insert AFTER INSERT ON FootballCompetitionProvider FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT 'global:catalog' AS tag) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT 'global:catalog' AS tag) tags ON tags.tag=t.tag;
END;

CREATE TRIGGER PublicCache_FootballCompetitionProvider_update AFTER UPDATE ON FootballCompetitionProvider FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT 'global:catalog' AS tag) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT 'global:catalog' AS tag) tags ON tags.tag=t.tag;
END;

CREATE TRIGGER PublicCache_FootballSeason_insert AFTER INSERT ON FootballSeason FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT 'global:catalog' AS tag) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT 'global:catalog' AS tag) tags ON tags.tag=t.tag;
END;

CREATE TRIGGER PublicCache_FootballSeason_update AFTER UPDATE ON FootballSeason FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT 'global:catalog' AS tag) tags WHERE tags.tag IS NOT NULL ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT 'global:catalog' AS tag) tags ON tags.tag=t.tag;
END;
