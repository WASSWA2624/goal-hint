CREATE TABLE FootballProviderCoverage (
  `key` CHAR(64) NOT NULL,
  resource VARCHAR(40) NOT NULL,
  endpoint VARCHAR(40) NOT NULL,
  scope JSON NOT NULL,
  parameters JSON NOT NULL,
  page INT UNSIGNED NOT NULL,
  section VARCHAR(40) NOT NULL,
  status VARCHAR(24) NOT NULL,
  reason VARCHAR(64) NULL,
  attempts INT UNSIGNED NOT NULL,
  revision INT UNSIGNED NOT NULL,
  updatedAt DATETIME(3) NOT NULL,
  lastAttemptAt DATETIME(3) NULL,
  lastResponseId CHAR(64) NULL,
  lastCompleteAt DATETIME(3) NULL,
  nextRetryAt DATETIME(3) NULL,
  remaining INT UNSIGNED NULL,
  PRIMARY KEY (`key`),
  INDEX football_provider_coverage_retry_idx (endpoint, status, nextRetryAt),
  INDEX football_provider_coverage_response_idx (lastResponseId),
  CONSTRAINT FootballProviderCoverage_lastResponseId_fkey FOREIGN KEY (lastResponseId)
    REFERENCES FootballHistorySourcePage (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT FootballProviderCoverage_shape CHECK (
    page >= 1 AND revision >= 1 AND
    status IN ('not_requested','queued','fetching','complete','partial','unavailable','not_applicable',
      'retryable_failure','blocked_by_quota','blocked_by_access') AND
    (status IN ('not_requested','queued','fetching','complete') OR reason IS NOT NULL) AND
    (attempts = 0) = (lastAttemptAt IS NULL) AND
    (lastAttemptAt IS NULL OR lastAttemptAt <= updatedAt) AND
    (lastCompleteAt IS NULL OR (lastCompleteAt <= updatedAt AND lastResponseId IS NOT NULL)) AND
    (nextRetryAt IS NULL OR nextRetryAt >= updatedAt) AND
    (status <> 'complete' OR (remaining IS NOT NULL AND remaining = 0 AND lastCompleteAt IS NOT NULL))
  )
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
