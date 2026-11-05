-- Preserve the approved public mailbox while making contact-page email editable and optional.
ALTER TABLE `SubscriptionSettings`
  ADD COLUMN `contactPageEmail` VARCHAR(254) NULL DEFAULT 'wasswawilon0002@gmail.com',
  ADD COLUMN `contactPageEmailVisible` BOOLEAN NOT NULL DEFAULT true;
