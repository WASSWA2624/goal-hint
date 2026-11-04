ALTER TABLE `SubscriptionSettings`
  ADD COLUMN `mtnEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `airtelEnabled` BOOLEAN NOT NULL DEFAULT false;

UPDATE `SubscriptionSettings`
SET `mtnEnabled` = COALESCE(TRIM(`mtnNumber`) <> '' AND TRIM(`mtnName`) <> '', false),
    `airtelEnabled` = COALESCE(TRIM(`airtelNumber`) <> '' AND TRIM(`airtelName`) <> '', false);

ALTER TABLE `MemberAccount`
  ADD COLUMN `trialEligibleAt` DATETIME(3) NULL,
  ADD COLUMN `trialForfeitedAt` DATETIME(3) NULL;
