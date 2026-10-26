-- A counter, not a request log. The stable account/day key survives plan upgrades and restarts.
CREATE TABLE ApiQuotaBudget (
  id CHAR(64) NOT NULL,
  used INTEGER UNSIGNED NOT NULL,
  periodEndsAt DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  INDEX ApiQuotaBudget_periodEndsAt_idx (periodEndsAt),
  CONSTRAINT ApiQuotaBudget_id_check CHECK (id REGEXP '^[a-f0-9]{64}$')
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
