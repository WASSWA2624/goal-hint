-- CreateTable
CREATE TABLE `CostBudgetAccount` (
    `accountId` CHAR(64) NOT NULL,
    `category` VARCHAR(16) NOT NULL,
    `stateJson` JSON NULL,

    PRIMARY KEY (`accountId`, `category`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `CostBudgetPeriod` (
    `accountId` CHAR(64) NOT NULL,
    `category` VARCHAR(16) NOT NULL,
    `id` CHAR(64) NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `capAmount` DECIMAL(38, 12) NOT NULL,
    `openingChargedAmount` DECIMAL(38, 12) NOT NULL,
    `stateJson` JSON NOT NULL,

    INDEX `CostBudgetPeriod_accountId_category_startsAt_endsAt_idx`(`accountId`, `category`, `startsAt`, `endsAt`),
    PRIMARY KEY (`accountId`, `category`, `id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `CostBudgetJob` (
    `accountId` CHAR(64) NOT NULL,
    `category` VARCHAR(16) NOT NULL,
    `id` CHAR(64) NOT NULL,
    `workKey` CHAR(64) NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `deadlineAt` DATETIME(3) NOT NULL,
    `capAmount` DECIMAL(38, 12) NOT NULL,
    `stateJson` JSON NOT NULL,

    UNIQUE INDEX `CostBudgetJob_accountId_category_workKey_key`(`accountId`, `category`, `workKey`),
    PRIMARY KEY (`accountId`, `category`, `id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `CostBudgetAttempt` (
    `accountId` CHAR(64) NOT NULL,
    `category` VARCHAR(16) NOT NULL,
    `id` CHAR(64) NOT NULL,
    `jobId` CHAR(64) NOT NULL,
    `periodId` CHAR(64) NULL,
    `state` VARCHAR(24) NOT NULL,
    `queuedAt` DATETIME(3) NOT NULL,
    `kickoffAt` DATETIME(3) NULL,
    `priority` INTEGER NOT NULL,
    `deadlineAt` DATETIME(3) NOT NULL,
    `dispatchedAt` DATETIME(3) NULL,
    `maxCostAmount` DECIMAL(38, 12) NOT NULL,
    `liabilityAmount` DECIMAL(38, 12) NOT NULL,
    `estimatedAmount` DECIMAL(38, 12) NULL,
    `observedAmount` DECIMAL(38, 12) NULL,
    `invoicedAmount` DECIMAL(38, 12) NULL,
    `chargedRequests` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `chargedInputTokens` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `chargedOutputTokens` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `chargedBilledUnits` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `timeMs` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `overage` BOOLEAN NOT NULL DEFAULT false,
    `provider` VARCHAR(128) NOT NULL,
    `model` VARCHAR(128) NULL,
    `rateVersion` VARCHAR(128) NOT NULL,
    `integrity` CHAR(64) NOT NULL,
    `stateJson` JSON NOT NULL,

    INDEX `CostBudgetAttempt_accountId_category_state_priority_kickoffA_idx`(`accountId`, `category`, `state`, `priority`, `kickoffAt`, `queuedAt`),
    INDEX `CostBudgetAttempt_accountId_category_periodId_idx`(`accountId`, `category`, `periodId`),
    INDEX `CostBudgetAttempt_accountId_category_jobId_idx`(`accountId`, `category`, `jobId`),
    PRIMARY KEY (`accountId`, `category`, `id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- AddForeignKey
ALTER TABLE `CostBudgetPeriod` ADD CONSTRAINT `CostBudgetPeriod_accountId_category_fkey` FOREIGN KEY (`accountId`, `category`) REFERENCES `CostBudgetAccount`(`accountId`, `category`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `CostBudgetJob` ADD CONSTRAINT `CostBudgetJob_accountId_category_fkey` FOREIGN KEY (`accountId`, `category`) REFERENCES `CostBudgetAccount`(`accountId`, `category`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `CostBudgetAttempt` ADD CONSTRAINT `CostBudgetAttempt_accountId_category_fkey` FOREIGN KEY (`accountId`, `category`) REFERENCES `CostBudgetAccount`(`accountId`, `category`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `CostBudgetAttempt` ADD CONSTRAINT `CostBudgetAttempt_accountId_category_jobId_fkey` FOREIGN KEY (`accountId`, `category`, `jobId`) REFERENCES `CostBudgetJob`(`accountId`, `category`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `CostBudgetAttempt` ADD CONSTRAINT `CostBudgetAttempt_accountId_category_periodId_fkey` FOREIGN KEY (`accountId`, `category`, `periodId`) REFERENCES `CostBudgetPeriod`(`accountId`, `category`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Native projections protect monetary arithmetic and indexed queue state. The
-- store additionally validates every projection against its structured ledger.
ALTER TABLE `CostBudgetAccount`
  ADD CONSTRAINT `CostBudgetAccount_category_check` CHECK (`category` IN ('ai', 'research'));
ALTER TABLE `CostBudgetPeriod`
  ADD CONSTRAINT `CostBudgetPeriod_projection_check` CHECK (COALESCE(
    JSON_TYPE(JSON_EXTRACT(`stateJson`, '$.accountId')) = 'STRING'
    AND JSON_TYPE(JSON_EXTRACT(`stateJson`, '$.category')) = 'STRING'
    AND JSON_TYPE(JSON_EXTRACT(`stateJson`, '$.periodId')) = 'STRING'
    AND `accountId` = JSON_UNQUOTE(JSON_EXTRACT(`stateJson`, '$.accountId'))
    AND `category` = JSON_UNQUOTE(JSON_EXTRACT(`stateJson`, '$.category'))
    AND `id` = JSON_UNQUOTE(JSON_EXTRACT(`stateJson`, '$.periodId'))
    AND JSON_UNQUOTE(JSON_EXTRACT(`stateJson`, '$.accountId')) REGEXP '^[a-f0-9]{64}$'
    AND JSON_UNQUOTE(JSON_EXTRACT(`stateJson`, '$.periodId')) REGEXP '^[a-f0-9]{64}$'
    AND JSON_TYPE(JSON_EXTRACT(`stateJson`, '$.capUsdPicos')) = 'OBJECT'
    AND JSON_LENGTH(JSON_EXTRACT(`stateJson`, '$.capUsdPicos')) = 1
    AND JSON_TYPE(JSON_EXTRACT(`stateJson`, '$.capUsdPicos."$costInteger"')) = 'STRING'
    AND JSON_UNQUOTE(JSON_EXTRACT(`stateJson`, '$.capUsdPicos."$costInteger"')) REGEXP '^(0|[1-9][0-9]{0,37})$'
    AND `capAmount` * 1000000000000 = CAST(JSON_UNQUOTE(JSON_EXTRACT(`stateJson`, '$.capUsdPicos."$costInteger"')) AS DECIMAL(38, 0))
    AND JSON_TYPE(JSON_EXTRACT(`stateJson`, '$.openingChargedUsdPicos')) = 'OBJECT'
    AND JSON_LENGTH(JSON_EXTRACT(`stateJson`, '$.openingChargedUsdPicos')) = 1
    AND JSON_TYPE(JSON_EXTRACT(`stateJson`, '$.openingChargedUsdPicos."$costInteger"')) = 'STRING'
    AND JSON_UNQUOTE(JSON_EXTRACT(`stateJson`, '$.openingChargedUsdPicos."$costInteger"')) REGEXP '^(0|[1-9][0-9]{0,37})$'
    AND `openingChargedAmount` * 1000000000000 = CAST(JSON_UNQUOTE(JSON_EXTRACT(`stateJson`, '$.openingChargedUsdPicos."$costInteger"')) AS DECIMAL(38, 0)),
    FALSE
  ) = TRUE),
  ADD CONSTRAINT `CostBudgetPeriod_bounds_check` CHECK (`startsAt` < `endsAt`),
  ADD CONSTRAINT `CostBudgetPeriod_amount_check` CHECK (
    `capAmount` >= 0 AND `openingChargedAmount` >= 0
  );
ALTER TABLE `CostBudgetJob`
  ADD CONSTRAINT `CostBudgetJob_bounds_check` CHECK (`startsAt` < `deadlineAt`),
  ADD CONSTRAINT `CostBudgetJob_amount_check` CHECK (`capAmount` >= 0);
ALTER TABLE `CostBudgetAttempt`
  ADD CONSTRAINT `CostBudgetAttempt_identity_check` CHECK (COALESCE(
    JSON_TYPE(JSON_EXTRACT(`stateJson`, '$.ledger.request.accountId')) = 'STRING'
    AND JSON_TYPE(JSON_EXTRACT(`stateJson`, '$.ledger.request.category')) = 'STRING'
    AND JSON_TYPE(JSON_EXTRACT(`stateJson`, '$.ledger.request.attemptId')) = 'STRING'
    AND JSON_TYPE(JSON_EXTRACT(`stateJson`, '$.ledger.request.jobId')) = 'STRING'
    AND JSON_TYPE(JSON_EXTRACT(`stateJson`, '$.ledger.periodId')) IN ('STRING', 'NULL')
    AND `accountId` = JSON_UNQUOTE(JSON_EXTRACT(`stateJson`, '$.ledger.request.accountId'))
    AND `category` = JSON_UNQUOTE(JSON_EXTRACT(`stateJson`, '$.ledger.request.category'))
    AND `id` = JSON_UNQUOTE(JSON_EXTRACT(`stateJson`, '$.ledger.request.attemptId'))
    AND `jobId` = JSON_UNQUOTE(JSON_EXTRACT(`stateJson`, '$.ledger.request.jobId'))
    AND (`periodId` <=> IF(JSON_TYPE(JSON_EXTRACT(`stateJson`, '$.ledger.periodId')) = 'NULL',
      NULL, JSON_UNQUOTE(JSON_EXTRACT(`stateJson`, '$.ledger.periodId'))))
    AND JSON_UNQUOTE(JSON_EXTRACT(`stateJson`, '$.ledger.request.accountId')) REGEXP '^[a-f0-9]{64}$'
    AND JSON_UNQUOTE(JSON_EXTRACT(`stateJson`, '$.ledger.request.attemptId')) REGEXP '^[a-f0-9]{64}$'
    AND JSON_UNQUOTE(JSON_EXTRACT(`stateJson`, '$.ledger.request.jobId')) REGEXP '^[a-f0-9]{64}$'
    AND (JSON_TYPE(JSON_EXTRACT(`stateJson`, '$.ledger.periodId')) = 'NULL'
      OR JSON_UNQUOTE(JSON_EXTRACT(`stateJson`, '$.ledger.periodId')) REGEXP '^[a-f0-9]{64}$'),
    FALSE
  ) = TRUE),
  ADD CONSTRAINT `CostBudgetAttempt_amount_check` CHECK (
    `maxCostAmount` >= 0 AND `liabilityAmount` >= 0
    AND (`estimatedAmount` IS NULL OR `estimatedAmount` >= 0)
    AND (`observedAmount` IS NULL OR `observedAmount` >= 0)
    AND (`invoicedAmount` IS NULL OR `invoicedAmount` >= 0)
  ),
  ADD CONSTRAINT `CostBudgetAttempt_priority_check` CHECK (
    (`priority` = 0 AND `kickoffAt` IS NOT NULL) OR (`priority` = 1 AND `kickoffAt` IS NULL)
  ),
  ADD CONSTRAINT `CostBudgetAttempt_state_check` CHECK (
    (`state` = 'queued' AND `periodId` IS NULL AND `dispatchedAt` IS NULL AND `liabilityAmount` = 0)
    OR (`state` IN ('reserved', 'canceled') AND `periodId` IS NOT NULL AND `dispatchedAt` IS NULL)
    OR (`state` IN ('dispatched', 'completed', 'uncertain') AND `periodId` IS NOT NULL AND `dispatchedAt` IS NOT NULL)
  ),
  ADD CONSTRAINT `CostBudgetAttempt_safe_count_check` CHECK (
    `chargedRequests` <= 9007199254740991 AND `chargedInputTokens` <= 9007199254740991
    AND `chargedOutputTokens` <= 9007199254740991 AND `chargedBilledUnits` <= 9007199254740991
    AND `timeMs` <= 9007199254740991
  );
