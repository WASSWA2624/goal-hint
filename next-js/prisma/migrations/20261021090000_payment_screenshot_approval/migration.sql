-- A payment report is now a screenshot with an optional transaction ID: the owner reads the ID from their own wallet SMS
-- at approval (approvedTxnKey stays required there). Existing rows keep their values; plain ALTERs, valid on MariaDB too.
-- AlterTable
ALTER TABLE `PaymentSubmission` MODIFY `claimedTxnRef` VARCHAR(40) NULL,
    MODIFY `claimedTxnKey` VARCHAR(40) NULL;
