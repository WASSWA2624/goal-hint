-- MariaDB hosting can default to MyISAM. These mutable application tables
-- participate in transactions and must retain InnoDB rollback and row locking.
-- Preserve the checksums of earlier, already-applied migrations.
ALTER TABLE `AnalyticsVisitor` ENGINE = InnoDB;
ALTER TABLE `AnalyticsSession` ENGINE = InnoDB;
ALTER TABLE `AnalyticsPageview` ENGINE = InnoDB;
ALTER TABLE `AnalyticsEvent` ENGINE = InnoDB;
ALTER TABLE `AnalyticsAdminSession` ENGINE = InnoDB;
ALTER TABLE `AnalyticsLoginThrottle` ENGINE = InnoDB;
ALTER TABLE `AnalyticsSetting` ENGINE = InnoDB;
ALTER TABLE `OperationsMonitorState` ENGINE = InnoDB;
