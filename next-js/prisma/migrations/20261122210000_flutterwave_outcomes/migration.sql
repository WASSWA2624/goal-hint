-- Allow verified failed and cancelled outcomes without changing existing hosted payment attempts.
ALTER TABLE PaymentSubmission
  DROP CHECK PaymentSubmission_hosted_check,
  ADD CONSTRAINT PaymentSubmission_hosted_check CHECK (
    (claimedNetwork = 'flw' AND workflowVersion = 2 AND source = 'checkout' AND method = 'flw'
      AND requestKey IS NOT NULL AND priceUgx > 0 AND claimedAmountUgx = priceUgx AND purpose IN ('plan','topup')
      AND walletUgx = 0 AND referralDays = 0 AND receivingNumber IS NULL
      AND status IN ('provider-pending','pending','approved','reversed','rejected','cancelled'))
    OR (claimedNetwork <> 'flw' AND status <> 'provider-pending' AND (network IS NULL OR network <> 'flw') AND checkoutUrl IS NULL AND checkoutLease IS NULL)
  );
