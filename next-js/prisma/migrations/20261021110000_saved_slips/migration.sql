CREATE TABLE `SavedSlip` (
  `id` CHAR(36) NOT NULL,
  `accountId` CHAR(36) NOT NULL,
  `fingerprint` CHAR(64) NOT NULL,
  `snapshotJson` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `SavedSlip_accountId_fingerprint_key` (`accountId`, `fingerprint`),
  INDEX `SavedSlip_createdAt_idx` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE `SavedSlipFixture` (
  `slipId` CHAR(36) NOT NULL,
  `fixtureId` CHAR(36) NOT NULL,
  PRIMARY KEY (`slipId`, `fixtureId`),
  INDEX `SavedSlipFixture_fixtureId_idx` (`fixtureId`),
  CONSTRAINT `SavedSlipFixture_slipId_fkey` FOREIGN KEY (`slipId`) REFERENCES `SavedSlip` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `SavedSlipFixture_fixtureId_fkey` FOREIGN KEY (`fixtureId`) REFERENCES `FootballFixture` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
