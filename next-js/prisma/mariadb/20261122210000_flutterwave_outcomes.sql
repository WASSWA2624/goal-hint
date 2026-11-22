-- MariaDB overlay. Pause writers and take a backup before applying.
DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261113150000_flutterwave_checkout'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 1
    OR EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '20261122210000_flutterwave_outcomes')
    OR NOT EXISTS (SELECT 1 FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'PaymentSubmission' AND CONSTRAINT_NAME = 'PaymentSubmission_hosted_check'
      AND CHECK_CLAUSE NOT LIKE '%cancelled%' AND CHECK_CLAUSE NOT LIKE '%rejected%') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Flutterwave outcome migration prerequisites missing or already partly installed.';
  END IF;
END //
DELIMITER ;

ALTER TABLE PaymentSubmission
  DROP CONSTRAINT PaymentSubmission_hosted_check,
  ADD CONSTRAINT PaymentSubmission_hosted_check CHECK (
    (claimedNetwork = 'flw' AND workflowVersion = 2 AND source = 'checkout' AND method = 'flw'
      AND requestKey IS NOT NULL AND priceUgx > 0 AND claimedAmountUgx = priceUgx AND purpose IN ('plan','topup')
      AND walletUgx = 0 AND referralDays = 0 AND receivingNumber IS NULL
      AND status IN ('provider-pending','pending','approved','reversed','rejected','cancelled'))
    OR (claimedNetwork <> 'flw' AND status <> 'provider-pending' AND (network IS NULL OR network <> 'flw') AND checkoutUrl IS NULL AND checkoutLease IS NULL)
  );

DELIMITER //
BEGIN NOT ATOMIC
  IF NOT EXISTS (SELECT 1 FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'PaymentSubmission' AND CONSTRAINT_NAME = 'PaymentSubmission_hosted_check'
    AND CHECK_CLAUSE LIKE '%cancelled%' AND CHECK_CLAUSE LIKE '%rejected%') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Flutterwave outcome migration verification failed.';
  END IF;
END //
DELIMITER ;

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
VALUES (UUID(), '3e8123d0fab790963c1c7184612a87cb4689302a9b26740a6f063dbdc4660e15', NOW(3), '20261122210000_flutterwave_outcomes', NOW(3), 1);
