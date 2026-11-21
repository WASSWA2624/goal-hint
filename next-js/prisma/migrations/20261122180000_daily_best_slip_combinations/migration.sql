CREATE TABLE `DailyBestSlipCombination` (
    `eatDate` DATE NOT NULL,
    `combination` CHAR(64) NOT NULL,
    `slipId` CHAR(64) NOT NULL,
    PRIMARY KEY (`eatDate`, `combination`),
    UNIQUE KEY `DailyBestSlipCombination_slipId_key` (`slipId`),
    CONSTRAINT `DailyBestSlipCombination_slipId_fkey` FOREIGN KEY (`slipId`) REFERENCES `PublishedSlip` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TRIGGER `DailyBestSlipCombination_no_update` BEFORE UPDATE ON `DailyBestSlipCombination` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Daily Best Slips combination membership is immutable';
END;

CREATE TRIGGER `DailyBestSlipCombination_no_delete` BEFORE DELETE ON `DailyBestSlipCombination` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Daily Best Slips combination membership is immutable';
END;

ALTER TABLE DailySlipPublication
  DROP CHECK DailySlipPublication_body_shape_v4,
  ADD CONSTRAINT DailySlipPublication_body_shape_v5 CHECK (COALESCE(
    JSON_UNQUOTE(JSON_EXTRACT(bodyJson, '$.model.id')) = modelId AND (
      (oddsBand = 'legacy' AND JSON_EXTRACT(bodyJson, '$.version') = 1 AND JSON_EXTRACT(bodyJson, '$.count') BETWEEN 1 AND 100)
      OR (oddsBand IN ('1.5-5','5-10','10-20','20-50','50-100','100-200')
        AND JSON_UNQUOTE(JSON_EXTRACT(bodyJson, '$.oddsBand')) = oddsBand AND (
          (JSON_EXTRACT(bodyJson, '$.version') = 2 AND JSON_EXTRACT(bodyJson, '$.count') BETWEEN 1 AND 20)
          OR (JSON_EXTRACT(bodyJson, '$.version') = 3 AND JSON_EXTRACT(bodyJson, '$.count') BETWEEN 1 AND 10)
        ))
    ), FALSE) = TRUE);
