-- Daily sequence identities are immutable. Hourly sequences append the EAT hour to the reporting date.
ALTER TABLE DailyRun
  DROP CONSTRAINT DailyRun_order_check,
  DROP INDEX DailyRun_eatDate_key,
  ADD COLUMN slotHour TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ADD UNIQUE INDEX DailyRun_eatDate_slotHour_key (eatDate, slotHour),
  ADD CONSTRAINT DailyRun_order_check CHECK (
    YEAR(eatDate) >= 1000 AND slotHour < 24 AND
    sequence = CASE WHEN slotHour = 0 THEN YEAR(eatDate) * 10000 + MONTH(eatDate) * 100 + DAY(eatDate)
      ELSE (YEAR(eatDate) * 10000 + MONTH(eatDate) * 100 + DAY(eatDate)) * 100 + slotHour END
  );

CREATE TABLE SelectionFixtureInput (
  fixtureId CHAR(36) NOT NULL,
  cycleId CHAR(36) NOT NULL,
  scheduleHash CHAR(64) NOT NULL,
  evidenceHash CHAR(64) NOT NULL,
  evidenceReady BOOLEAN NOT NULL,
  runId CHAR(36) NOT NULL,
  PRIMARY KEY (fixtureId)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
