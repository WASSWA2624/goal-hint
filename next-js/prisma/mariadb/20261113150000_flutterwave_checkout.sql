-- MariaDB overlay. Pause writers and take a backup before applying.
DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261111171000_paid_access_settings'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 1
    OR EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '20261113150000_flutterwave_checkout')
    OR EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PaymentSubmission'
      AND COLUMN_NAME IN ('checkoutUrl','checkoutUrlExpiresAt','checkoutLease','checkoutLeaseUntil'))
    OR (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'CHECK'
      AND ((TABLE_NAME = 'PaymentSubmission' AND CONSTRAINT_NAME = 'PaymentSubmission_state_check')
      OR (TABLE_NAME = 'PaymentReceipt' AND CONSTRAINT_NAME = 'PaymentReceipt_shape'))) <> 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Migration prerequisites missing or already/partly applied.';
  END IF;
END //
DELIMITER ;

-- Add hosted checkout state without changing existing manual and wallet records.
ALTER TABLE PaymentSubmission
  ADD COLUMN checkoutUrl VARCHAR(255) NULL,
  ADD COLUMN checkoutUrlExpiresAt DATETIME(3) NULL,
  ADD COLUMN checkoutLease CHAR(36) NULL,
  ADD COLUMN checkoutLeaseUntil DATETIME(3) NULL;

ALTER TABLE PaymentSubmission DROP CONSTRAINT PaymentSubmission_state_check;
ALTER TABLE PaymentSubmission ADD CONSTRAINT PaymentSubmission_state_check CHECK (
  source IN ('report','owner','checkout')
  AND status IN ('pending','superseded','approved','rejected','reversed','remaining','disputed','correction','reconfirm','cancelled','provider-pending')
  AND (claimedNetwork IN ('mtn','airtel') OR (workflowVersion = 2 AND claimedNetwork IN ('wallet','referral','flw')))
  AND (network IS NULL OR network IN ('mtn','airtel','flw'))
  AND (durationDays BETWEEN 1 AND 366 OR (workflowVersion = 2 AND purpose = 'referral' AND durationDays = 0) OR purpose = 'topup')
  AND (rejectReason IS NULL OR rejectReason IN ('unreadable','amount-mismatch','not-received','duplicate','wrong-number','other'))
  AND (reverseReason IS NULL OR reverseReason IN ('network-reversal','wrong-account'))
  AND (source IN ('report','checkout') OR (status IN ('approved','reversed') AND imageSha256 IS NULL AND submittedSessionHash IS NULL AND termsVersion IS NULL))
  AND (workflowVersion = 1 OR (workflowVersion = 2 AND source IN ('checkout','report') AND method = claimedNetwork AND walletUgx <= priceUgx AND referralDays <= 365))
);

ALTER TABLE PaymentSubmission ADD CONSTRAINT PaymentSubmission_hosted_check CHECK (
  (claimedNetwork = 'flw' AND workflowVersion = 2 AND source = 'checkout' AND method = 'flw'
    AND requestKey IS NOT NULL AND priceUgx > 0 AND claimedAmountUgx = priceUgx AND purpose IN ('plan','topup')
    AND walletUgx = 0 AND referralDays = 0 AND receivingNumber IS NULL
    AND status IN ('provider-pending','pending','approved','reversed'))
  OR (claimedNetwork <> 'flw' AND status <> 'provider-pending' AND (network IS NULL OR network <> 'flw') AND checkoutUrl IS NULL AND checkoutLease IS NULL)
);
ALTER TABLE PaymentSubmission ADD CONSTRAINT PaymentSubmission_hosted_link_check CHECK (
  (checkoutUrl IS NULL) = (checkoutUrlExpiresAt IS NULL)
  AND (checkoutLease IS NULL) = (checkoutLeaseUntil IS NULL)
  AND (checkoutUrl IS NULL OR checkoutLease IS NULL)
);

ALTER TABLE PaymentReceipt DROP CONSTRAINT PaymentReceipt_shape;
ALTER TABLE PaymentReceipt ADD CONSTRAINT PaymentReceipt_shape CHECK (
  provider IN ('mtn', 'airtel', 'flw') AND CHAR_LENGTH(transactionKey) > 0
  AND (verifiedAt IS NULL OR (verifiedBy IS NOT NULL AND amountUgx IS NOT NULL AND receivedAt IS NOT NULL
    AND (provider = 'flw' OR recipient IS NOT NULL)))
  AND (provider <> 'flw' OR (verifiedAt IS NOT NULL AND intendedSubmissionId IS NOT NULL
    AND recipient IS NULL AND senderPhone IS NULL AND disputed = FALSE))
  AND (allocatedSubmissionId IS NULL OR (verifiedAt IS NOT NULL AND allocatedAt IS NOT NULL))
);

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
VALUES (UUID(), '4e9cefb1abbadd091e39f11385cd42c9367ebc0dff8753b5c92c0593b16ccf15', NOW(3), '20261113150000_flutterwave_checkout', NOW(3), 1);
