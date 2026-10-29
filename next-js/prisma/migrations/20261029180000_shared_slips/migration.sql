-- Explicit public sharing is independent of private member saves and editorial publication retention.
CREATE TABLE `SharedSlip` (
  `id` CHAR(32) NOT NULL,
  `ownerKey` CHAR(64) NOT NULL,
  `fingerprint` CHAR(64) NOT NULL,
  `snapshotJson` JSON NOT NULL,
  `integrity` CHAR(64) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `SharedSlip_ownerKey_fingerprint_key` (`ownerKey`, `fingerprint`),
  CONSTRAINT `SharedSlip_identity_shape` CHECK (`id` REGEXP '^[a-f0-9]{32}$' AND `ownerKey` REGEXP '^[a-f0-9]{64}$' AND `fingerprint` REGEXP '^[a-f0-9]{64}$'),
  CONSTRAINT `SharedSlip_snapshot_shape` CHECK (COALESCE(JSON_LENGTH(`snapshotJson`, '$.selections') BETWEEN 1 AND 800
    AND OCTET_LENGTH(CAST(`snapshotJson` AS CHAR)) <= 8388608, FALSE) = TRUE)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TRIGGER SharedSlip_no_update BEFORE UPDATE ON SharedSlip FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Shared slips are immutable.';

CREATE TRIGGER SharedSlip_no_delete BEFORE DELETE ON SharedSlip FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Shared slip links are permanent.';
