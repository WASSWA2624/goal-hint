CREATE TABLE FixtureInPlayOddsHistory (
  id CHAR(64) NOT NULL,
  fixtureId CHAR(36) NOT NULL,
  occurrenceHash CHAR(64) NOT NULL,
  semanticHash CHAR(64) NOT NULL,
  firstObservedAt DATETIME(3) NOT NULL,
  lastObservedAt DATETIME(3) NOT NULL,
  providerUpdatedAt DATETIME(3) NULL,
  lastProviderUpdatedAt DATETIME(3) NULL,
  outOfOrder BOOLEAN NOT NULL,
  bodyJson JSON NOT NULL,
  PRIMARY KEY (id),
  INDEX fixture_in_play_odds_history_lookup_idx (fixtureId, occurrenceHash, outOfOrder, firstObservedAt, id),
  INDEX fixture_in_play_odds_history_recent_idx (lastObservedAt, fixtureId),
  CONSTRAINT FixtureInPlayOddsHistory_fixtureId_fkey FOREIGN KEY (fixtureId)
    REFERENCES FootballFixture (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT FixtureInPlayOddsHistory_observation_check CHECK (
    firstObservedAt <= lastObservedAt AND outOfOrder IN (0, 1) AND JSON_TYPE(bodyJson) = 'OBJECT' AND
    (providerUpdatedAt IS NULL OR providerUpdatedAt <= firstObservedAt) AND
    (lastProviderUpdatedAt IS NULL OR lastProviderUpdatedAt <= lastObservedAt) AND
    (providerUpdatedAt IS NULL OR lastProviderUpdatedAt IS NOT NULL AND lastProviderUpdatedAt >= providerUpdatedAt)
  )
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
