-- MariaDB overlay. Back up and pause writers; stop on any error.
DELIMITER //
BEGIN NOT ATOMIC
 IF EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name='20261101120000_payment_checkout')
  OR EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='PaymentReceipt') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Payment checkout is already or partly installed; stop.';
 END IF;
END //
DELIMITER ;
-- Additive accounting migration. Existing access and wallet entries are not rewritten.
ALTER TABLE MemberNotification DROP CONSTRAINT MemberNotification_shape_check;
ALTER TABLE MemberNotification ADD CONSTRAINT MemberNotification_shape_check CHECK (
  kind IN ('payment-approved','payment-rejected','payment-updated','access-activated','access-expiring','access-expired','referral-earned','referral-reviewed','referral-reversed','referral-restored')
  AND CHAR_LENGTH(eventKey) BETWEEN 1 AND 96 AND createdAt >= occurredAt
  AND (readAt IS NULL OR readAt >= occurredAt) AND (dismissedAt IS NULL OR dismissedAt >= occurredAt)
  AND (withdrawnAt IS NULL OR withdrawnAt >= occurredAt)
  AND ((kind IN ('access-expiring','access-expired')) = (expiresAt IS NOT NULL))
);
ALTER TABLE PaymentSubmission
  ADD COLUMN workflowVersion TINYINT UNSIGNED NOT NULL DEFAULT 1,
  ADD COLUMN requestKey CHAR(36) NULL,
  ADD COLUMN method VARCHAR(8) NULL,
  ADD COLUMN receivingNumber VARCHAR(15) NULL,
  ADD COLUMN walletUgx INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN referralDays SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN reservationActive BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN reservationUntil DATETIME(3) NULL,
  ADD COLUMN revision INT UNSIGNED NOT NULL DEFAULT 0,
  ADD UNIQUE INDEX PaymentSubmission_requestKey_key (requestKey),
  ADD INDEX PaymentSubmission_reservation_idx (accountId, reservationActive, reservationUntil);

ALTER TABLE PaymentSubmission DROP CONSTRAINT PaymentSubmission_state_check;
ALTER TABLE PaymentSubmission ADD CONSTRAINT PaymentSubmission_state_check CHECK (
  source IN ('report','owner','checkout')
  AND status IN ('pending','superseded','approved','rejected','reversed','remaining','disputed','correction','reconfirm','cancelled')
  AND (claimedNetwork IN ('mtn','airtel') OR (workflowVersion = 2 AND claimedNetwork IN ('wallet','referral')))
  AND (network IS NULL OR network IN ('mtn','airtel'))
  AND (durationDays BETWEEN 1 AND 366 OR (workflowVersion = 2 AND purpose = 'referral' AND durationDays = 0) OR purpose = 'topup')
  AND (rejectReason IS NULL OR rejectReason IN ('unreadable','amount-mismatch','not-received','duplicate','wrong-number','other'))
  AND (reverseReason IS NULL OR reverseReason IN ('network-reversal','wrong-account'))
  AND (source IN ('report','checkout') OR (status IN ('approved','reversed') AND imageSha256 IS NULL AND submittedSessionHash IS NULL AND termsVersion IS NULL))
  AND (workflowVersion = 1 OR (workflowVersion = 2 AND source IN ('checkout','report') AND method = claimedNetwork AND walletUgx <= priceUgx AND referralDays <= 365))
);
ALTER TABLE PaymentSubmission DROP CONSTRAINT PaymentSubmission_approval_check;
ALTER TABLE PaymentSubmission ADD CONSTRAINT PaymentSubmission_approval_check CHECK (
  (workflowVersion = 1 AND ((approvedTxnKey IS NULL AND status IN ('pending','superseded','rejected'))
    OR (approvedTxnKey IS NOT NULL AND status IN ('approved','reversed') AND network IS NOT NULL AND approvedTxnKey LIKE CONCAT(network, ':_%'))))
  OR (workflowVersion = 2 AND approvedTxnKey IS NULL
    AND (status <> 'approved' OR (decidedAt IS NOT NULL AND amountReceivedUgx IS NOT NULL AND reservationActive = FALSE)))
);

ALTER TABLE PaymentSubmission DROP CONSTRAINT PaymentSubmission_purpose_check;
ALTER TABLE PaymentSubmission ADD CONSTRAINT PaymentSubmission_purpose_check CHECK (
  (purpose = 'plan' AND planId IS NOT NULL AND durationDays IS NOT NULL)
  OR (purpose = 'topup' AND planId IS NULL AND durationDays IS NULL AND priceUgx BETWEEN 1000 AND 500000 AND claimedAmountUgx = priceUgx)
  OR (purpose = 'referral' AND workflowVersion = 2 AND planId IS NULL AND durationDays = 0 AND priceUgx = 0 AND referralDays > 0)
);

CREATE TABLE PaymentReceipt (
  id CHAR(36) NOT NULL PRIMARY KEY,
  provider VARCHAR(8) NOT NULL,
  transactionKey VARCHAR(40) NOT NULL,
  transactionId VARCHAR(40) NOT NULL,
  disputed BOOLEAN NOT NULL DEFAULT FALSE,
  verifiedAt DATETIME(3) NULL,
  verifiedBy VARCHAR(64) NULL,
  amountUgx INT UNSIGNED NULL,
  recipient VARCHAR(15) NULL,
  senderPhone VARCHAR(15) NULL,
  receivedAt DATETIME(3) NULL,
  intendedSubmissionId CHAR(36) NULL,
  allocatedSubmissionId CHAR(36) NULL,
  allocatedAt DATETIME(3) NULL,
  resolution VARCHAR(500) NULL,
  resolvedAt DATETIME(3) NULL,
  resolvedBy VARCHAR(64) NULL,
  UNIQUE INDEX PaymentReceipt_provider_transactionKey_key (provider, transactionKey),
  INDEX PaymentReceipt_disputed_verifiedAt_idx (disputed, verifiedAt),
  INDEX PaymentReceipt_allocatedSubmissionId_idx (allocatedSubmissionId),
  CONSTRAINT PaymentReceipt_shape CHECK (provider IN ('mtn', 'airtel') AND CHAR_LENGTH(transactionKey) > 0
    AND (verifiedAt IS NULL OR (verifiedBy IS NOT NULL AND amountUgx IS NOT NULL AND recipient IS NOT NULL AND receivedAt IS NOT NULL))
    AND (allocatedSubmissionId IS NULL OR (verifiedAt IS NOT NULL AND allocatedAt IS NOT NULL)))
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE PaymentReceiptClaim (
  id CHAR(36) NOT NULL PRIMARY KEY,
  submissionId CHAR(36) NOT NULL,
  receiptId CHAR(36) NOT NULL,
  amountUgx INT UNSIGNED NOT NULL,
  payerPhone VARCHAR(15) NULL,
  paidAt DATETIME(3) NOT NULL,
  original JSON NULL,
  corrections JSON NULL,
  withdrawn BOOLEAN NOT NULL DEFAULT FALSE,
  purgedAt DATETIME(3) NULL,
  image MEDIUMBLOB NULL,
  imageSha256 CHAR(64) NULL,
  createdAt DATETIME(3) NOT NULL,
  UNIQUE INDEX PaymentReceiptClaim_submissionId_receiptId_key (submissionId, receiptId),
  INDEX PaymentReceiptClaim_receiptId_idx (receiptId),
  CONSTRAINT PaymentReceiptClaim_submissionId_fkey FOREIGN KEY (submissionId) REFERENCES PaymentSubmission(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT PaymentReceiptClaim_receiptId_fkey FOREIGN KEY (receiptId) REFERENCES PaymentReceipt(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE ReferralCredit (
  id CHAR(36) NOT NULL PRIMARY KEY,
  accountId CHAR(36) NOT NULL,
  referralId CHAR(36) NULL,
  requestKey VARCHAR(80) NOT NULL,
  days INT NOT NULL,
  kind VARCHAR(12) NOT NULL,
  createdAt DATETIME(3) NOT NULL,
  UNIQUE INDEX ReferralCredit_referralId_key (referralId),
  UNIQUE INDEX ReferralCredit_requestKey_key (requestKey),
  INDEX ReferralCredit_accountId_createdAt_idx (accountId, createdAt),
  CONSTRAINT ReferralCredit_accountId_fkey FOREIGN KEY (accountId) REFERENCES MemberAccount(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT ReferralCredit_shape CHECK ((kind = 'award' AND days = 1 AND referralId IS NOT NULL)
    OR (kind = 'redeem' AND days BETWEEN -365 AND -1 AND referralId IS NULL)
    OR (kind = 'transfer' AND days <> 0 AND referralId IS NULL))
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE PaymentReceiptEvidence (
  id CHAR(36) NOT NULL PRIMARY KEY,
  claimId CHAR(36) NOT NULL,
  image MEDIUMBLOB NULL,
  imageSha256 CHAR(64) NOT NULL,
  createdAt DATETIME(3) NOT NULL,
  UNIQUE INDEX PaymentReceiptEvidence_claimId_imageSha256_key (claimId, imageSha256),
  CONSTRAINT PaymentReceiptEvidence_claimId_fkey FOREIGN KEY (claimId) REFERENCES PaymentReceiptClaim(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE PaymentEvent (
  id CHAR(36) NOT NULL PRIMARY KEY,
  submissionId CHAR(36) NOT NULL,
  receiptId CHAR(36) NULL,
  action VARCHAR(32) NOT NULL,
  actor VARCHAR(64) NOT NULL,
  reason VARCHAR(500) NULL,
  details JSON NULL,
  createdAt DATETIME(3) NOT NULL,
  INDEX PaymentEvent_submissionId_createdAt_idx (submissionId, createdAt)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- Capture historical approved identities so the new workflow cannot allocate them again.
INSERT INTO PaymentReceipt (id, provider, transactionKey, transactionId, verifiedAt, verifiedBy, amountUgx, recipient,
  receivedAt, allocatedSubmissionId, allocatedAt, intendedSubmissionId)
SELECT UUID(), network, SUBSTRING_INDEX(approvedTxnKey, ':', -1), transactionRef, decidedAt, COALESCE(decidedBy, 'historical'),
  amountReceivedUgx, 'historical', submittedAt, id, decidedAt, id
FROM PaymentSubmission WHERE approvedTxnKey IS NOT NULL;

-- Preserve existing pending/rejected evidence as claims too: an older claim must still flag competing ownership.
INSERT INTO PaymentReceipt (id, provider, transactionKey, transactionId)
SELECT UUID(), claimedNetwork, claimedTxnKey, MIN(claimedTxnRef) FROM PaymentSubmission
WHERE claimedTxnKey IS NOT NULL AND claimedTxnRef IS NOT NULL AND claimedNetwork IN ('mtn','airtel')
GROUP BY claimedNetwork, claimedTxnKey
ON DUPLICATE KEY UPDATE id = PaymentReceipt.id;

INSERT INTO PaymentReceiptClaim (id, submissionId, receiptId, amountUgx, payerPhone, paidAt, original, imageSha256, createdAt)
SELECT UUID(), p.id, r.id, p.claimedAmountUgx, p.payerPhone, p.submittedAt,
  JSON_OBJECT('legacy', TRUE, 'transactionId', p.claimedTxnRef, 'amountUgx', p.claimedAmountUgx), p.imageSha256, p.submittedAt
FROM PaymentSubmission p JOIN PaymentReceipt r ON r.provider=p.claimedNetwork AND r.transactionKey=p.claimedTxnKey;
INSERT INTO PaymentReceiptClaim (id, submissionId, receiptId, amountUgx, payerPhone, paidAt, original, createdAt)
SELECT UUID(), p.id, r.id, p.amountReceivedUgx, p.payerPhone, p.submittedAt,
  JSON_OBJECT('legacy', TRUE, 'transactionId', p.transactionRef, 'amountUgx', p.amountReceivedUgx), p.submittedAt
FROM PaymentSubmission p JOIN PaymentReceipt r ON r.allocatedSubmissionId=p.id
ON DUPLICATE KEY UPDATE id = PaymentReceiptClaim.id;

UPDATE PaymentReceipt r JOIN (
  SELECT c.receiptId FROM PaymentReceiptClaim c JOIN PaymentSubmission p ON p.id=c.submissionId
  GROUP BY c.receiptId HAVING COUNT(DISTINCT p.accountId) > 1
) conflicts ON conflicts.receiptId=r.id SET r.disputed=TRUE;
UPDATE PaymentReceipt r SET intendedSubmissionId=(
  SELECT c.submissionId FROM PaymentReceiptClaim c JOIN PaymentSubmission p ON p.id=c.submissionId
  WHERE c.receiptId=r.id ORDER BY p.submittedAt DESC, p.id DESC LIMIT 1
) WHERE r.allocatedSubmissionId IS NULL AND r.disputed=FALSE;

-- Import unapproved reports into the durable workflow without changing their reference, offer or original source.
UPDATE PaymentSubmission p LEFT JOIN SubscriptionSettings s ON s.id=1
SET p.workflowVersion=2, p.method=p.claimedNetwork,
  p.receivingNumber=CASE WHEN p.claimedNetwork='mtn' THEN s.mtnNumber ELSE s.airtelNumber END,
  p.reservationActive=(p.status='pending'),
  p.reservationUntil=CASE WHEN p.status='pending' THEN DATE_ADD(NOW(3), INTERVAL 48 HOUR) ELSE NULL END
WHERE p.source='report' AND p.status IN ('pending','superseded','rejected');
UPDATE PaymentSubmission p SET p.status='disputed'
WHERE p.workflowVersion=2 AND p.status='pending' AND EXISTS (
  SELECT 1 FROM PaymentReceiptClaim c JOIN PaymentReceipt r ON r.id=c.receiptId WHERE c.submissionId=p.id AND r.disputed=TRUE
);
INSERT INTO PaymentEvent (id, submissionId, action, actor, details, createdAt)
SELECT UUID(), id, 'legacy_import', 'system:migration', JSON_OBJECT('previousWorkflow', 1), NOW(3)
FROM PaymentSubmission WHERE workflowVersion=2;

DELIMITER //
CREATE TRIGGER PaymentReceipt_allocation BEFORE UPDATE ON PaymentReceipt FOR EACH ROW
BEGIN
  IF OLD.allocatedSubmissionId IS NULL AND NEW.allocatedSubmissionId IS NOT NULL
    AND (NEW.disputed = TRUE OR NEW.intendedSubmissionId IS NULL OR NEW.intendedSubmissionId <> NEW.allocatedSubmissionId) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Disputed or unintended funds cannot be allocated';
  END IF;
  IF NOT (NEW.provider <=> OLD.provider) OR NOT (NEW.transactionKey <=> OLD.transactionKey)
    OR (OLD.allocatedSubmissionId IS NOT NULL AND (NOT (NEW.allocatedSubmissionId <=> OLD.allocatedSubmissionId)
      OR NOT (NEW.amountUgx <=> OLD.amountUgx) OR NOT (NEW.allocatedAt <=> OLD.allocatedAt))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt identity and allocation are immutable';
  END IF;
END //
DELIMITER ;
DELIMITER //
CREATE TRIGGER ReferralCredit_no_update BEFORE UPDATE ON ReferralCredit FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Referral ledger is append only'; END //
DELIMITER ;
DELIMITER //
CREATE TRIGGER ReferralCredit_no_delete BEFORE DELETE ON ReferralCredit FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Referral ledger is append only'; END //
DELIMITER ;
DELIMITER //
CREATE TRIGGER PaymentEvent_no_update BEFORE UPDATE ON PaymentEvent FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Payment audit is append only'; END //
DELIMITER ;
DELIMITER //
CREATE TRIGGER PaymentEvent_no_delete BEFORE DELETE ON PaymentEvent FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Payment audit is append only'; END //
DELIMITER ;

-- A future award may link one ledger day instead of an automatically activated access period.
DROP TRIGGER MemberReferral_identity;
DELIMITER //
CREATE TRIGGER MemberReferral_identity BEFORE UPDATE ON MemberReferral FOR EACH ROW
BEGIN
  IF (NEW.inviterId IS NOT NULL AND NEW.inviterId = NEW.accountId)
    OR (NEW.status <> 'rewarded' AND NEW.accessCodeId IS NOT NULL)
    OR NOT (NEW.phoneKey <=> OLD.phoneKey) OR NOT (NEW.registeredAt <=> OLD.registeredAt)
    OR NOT (NEW.id <=> OLD.id) OR (NEW.accountId IS NOT NULL AND NOT (NEW.accountId <=> OLD.accountId))
    OR (NEW.inviterId IS NOT NULL AND NOT (NEW.inviterId <=> OLD.inviterId))
    OR (OLD.status <> 'pending' AND (NEW.status <> OLD.status OR NOT (NEW.rewardedAt <=> OLD.rewardedAt)
      OR NOT (NEW.accessCodeId <=> OLD.accessCodeId))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Referral identity and completed awards are immutable';
  END IF;
  IF OLD.status = 'pending' AND NEW.status = 'rewarded' AND NOT EXISTS (
    SELECT 1 FROM AccessCode WHERE id=NEW.accessCodeId AND accountId=NEW.inviterId AND source='referral'
  ) AND NOT EXISTS (
    SELECT 1 FROM ReferralCredit WHERE referralId=NEW.id AND accountId=NEW.inviterId AND kind='award' AND days=1
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='A referral reward must belong to its inviter'; END IF;
END //
DELIMITER ;

-- Combined contributions may be one shilling; genuine overpayments have no arbitrary 500,000 ceiling.
ALTER TABLE WalletEntry DROP CONSTRAINT WalletEntry_amount_check;
ALTER TABLE WalletEntry ADD CONSTRAINT WalletEntry_amount_check CHECK (
  (kind = 'topup' AND amountUgx BETWEEN 1000 AND 500000)
  OR (kind = 'overpayment' AND amountUgx BETWEEN 1 AND 2000000000)
  OR (kind IN ('purchase', 'renewal') AND amountUgx BETWEEN -10000000 AND -1)
  OR (kind = 'reversal' AND amountUgx BETWEEN -2000000000 AND -1)
  OR (kind IN ('adjustment', 'transfer') AND amountUgx <> 0 AND amountUgx BETWEEN -2000000000 AND 2000000000)
);
ALTER TABLE WalletEntry DROP CONSTRAINT WalletEntry_balance_check;
ALTER TABLE WalletEntry ADD CONSTRAINT WalletEntry_balance_check CHECK (
  balanceAfter BETWEEN -2000000000 AND 2000000000
  AND (amountUgx > 0 OR kind IN ('reversal','transfer') OR balanceAfter >= 0)
  AND (entryNumber <> 1 OR balanceAfter = amountUgx)
);
ALTER TABLE MemberAccount DROP CONSTRAINT MemberAccount_credit_check;
ALTER TABLE MemberAccount ADD CONSTRAINT MemberAccount_credit_check CHECK (
  creditUgx BETWEEN -2000000000 AND 2000000000
  AND (autoRenew = FALSE OR (erasedAt IS NULL AND autoRenewPlanId IS NOT NULL AND autoRenewTermsVersion IS NOT NULL))
);

DELIMITER //
BEGIN NOT ATOMIC
 IF (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('PaymentReceipt','PaymentReceiptClaim','PaymentReceiptEvidence','ReferralCredit','PaymentEvent')) <> 5
  OR (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME IN ('PaymentReceipt_allocation','ReferralCredit_no_update','ReferralCredit_no_delete','PaymentEvent_no_update','PaymentEvent_no_delete','MemberReferral_identity')) <> 6
  OR (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='PaymentSubmission' AND COLUMN_NAME IN ('workflowVersion','requestKey','method','receivingNumber','walletUgx','referralDays','reservationActive','reservationUntil','revision')) <> 9 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Payment checkout verification failed; migration not recorded.';
 END IF;
END //
DELIMITER ;
INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,logs,rolled_back_at,started_at,applied_steps_count)
VALUES (UUID(),'6cbcfb17e08adfafd5a29ef3196a4de9920db3b5a3b0f5ed9a0344946644c0ac',NOW(3),'20261101120000_payment_checkout',NULL,NULL,NOW(3),1);
