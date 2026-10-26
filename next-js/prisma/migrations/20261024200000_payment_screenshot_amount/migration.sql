-- The amount a member's browser read from the required payment screenshot, kept as a hint beside the plan price for the
-- owner's review. It is never the claimed amount. Existing rows stay NULL; a plain ALTER, valid on MariaDB too.
-- AlterTable
ALTER TABLE `PaymentSubmission` ADD COLUMN `screenshotAmountUgx` INTEGER UNSIGNED NULL;
