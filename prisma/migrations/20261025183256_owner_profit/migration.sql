-- Owner profit (B06): the mobile-money charges, operating costs and tax the owner enters for each EAT month, and the month's
-- close with its confirmed totals. Additive and owner-only: three new tables that reference no existing table, so nothing
-- here touches payments, access periods or accounts. No personal data: labels, notes and reasons are owner-typed business
-- text, and a reference is a bill or statement number. Nothing is estimated or converted by the database or the code.
-- No triggers, no DROP CHECK and no ALTER of existing tables, so the same file applies unchanged on MySQL and MariaDB 11.4
-- with no overlay. The CHECKs may name recurringLineId because its only foreign key RESTRICTs (MySQL error 3823 forbids
-- them only on cascading keys). Rows are voided or ended, never deleted: the application role gets SELECT, INSERT and
-- column-scoped UPDATE (deploy/manual-account-grants.sql) and no DELETE. Apply the migration and grants before deploying
-- a future profit service. This is foundation storage only: no Profit page or write API is implemented yet.

-- CreateTable
CREATE TABLE `OwnerCostLine` (
    `id` CHAR(36) NOT NULL,
    `kind` VARCHAR(8) NOT NULL,
    `category` VARCHAR(16) NOT NULL,
    `label` VARCHAR(80) NOT NULL,
    `cadence` VARCHAR(8) NOT NULL,
    `startMonth` DATE NOT NULL,
    `endMonth` DATE NULL,
    `typicalUgx` INTEGER UNSIGNED NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `createdBy` VARCHAR(64) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedBy` VARCHAR(64) NOT NULL,

    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `OwnerCostEntry` (
    `id` CHAR(36) NOT NULL,
    `month` DATE NOT NULL,
    `kind` VARCHAR(8) NOT NULL,
    `category` VARCHAR(16) NOT NULL,
    `network` VARCHAR(8) NULL,
    `label` VARCHAR(80) NOT NULL,
    `recurringLineId` CHAR(36) NULL,
    `amountUgx` INTEGER UNSIGNED NOT NULL,
    `invoiceCurrency` CHAR(3) NULL,
    `invoiceAmount` VARCHAR(20) NULL,
    `reference` VARCHAR(80) NULL,
    `note` VARCHAR(200) NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `createdBy` VARCHAR(64) NOT NULL,
    `voidedAt` DATETIME(3) NULL,
    `voidedBy` VARCHAR(64) NULL,
    `voidReason` VARCHAR(200) NULL,

    INDEX `OwnerCostEntry_month_idx`(`month`),
    INDEX `OwnerCostEntry_recurringLineId_month_idx`(`recurringLineId`, `month`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `OwnerProfitMonth` (
    `month` DATE NOT NULL,
    `closedAt` DATETIME(3) NULL,
    `closedBy` VARCHAR(64) NULL,
    `revenueUgx` INTEGER UNSIGNED NULL,
    `feesUgx` INTEGER UNSIGNED NULL,
    `expensesUgx` INTEGER UNSIGNED NULL,
    `taxUgx` INTEGER UNSIGNED NULL,
    `netUgx` INTEGER NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedBy` VARCHAR(64) NOT NULL,

    PRIMARY KEY (`month`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- A recurring cost line: an expense category or tax, monthly or yearly, starting and ending on a month's first day.
ALTER TABLE `OwnerCostLine` ADD CONSTRAINT `OwnerCostLine_shape_check` CHECK (
  `kind` IN ('expense','tax') AND (`kind` = 'tax') = (`category` = 'tax')
  AND `category` IN ('hosting','football-data','sms','ai','domain','refund','other','tax')
  AND `cadence` IN ('monthly','yearly')
  AND DAYOFMONTH(`startMonth`) = 1
  AND (`endMonth` IS NULL OR (DAYOFMONTH(`endMonth`) = 1 AND `endMonth` >= `startMonth`))
  AND (`typicalUgx` IS NULL OR `typicalUgx` <= 100000000));

-- An entry: one network's charges (never linked to a line), an expense or tax; whole UGX up to 100 million; the printed
-- invoice currency and amount together or not at all; and the three void columns together.
ALTER TABLE `OwnerCostEntry` ADD CONSTRAINT `OwnerCostEntry_shape_check` CHECK (
  DAYOFMONTH(`month`) = 1
  AND ((`kind` = 'fee' AND `category` = 'charges' AND `network` IN ('mtn','airtel') AND `recurringLineId` IS NULL)
    OR (`kind` = 'expense' AND `category` IN ('hosting','football-data','sms','ai','domain','refund','other') AND `network` IS NULL)
    OR (`kind` = 'tax' AND `category` = 'tax' AND `network` IS NULL))
  AND `amountUgx` <= 100000000
  AND (`invoiceCurrency` IS NULL) = (`invoiceAmount` IS NULL)
  AND (`voidedAt` IS NULL) = (`voidedBy` IS NULL)
  AND (`voidedAt` IS NULL) = (`voidReason` IS NULL));

-- A month's close: the seven close columns are all empty (open) or all set (closed), and the stored net is exactly the
-- stored revenue less charges, costs and tax.
ALTER TABLE `OwnerProfitMonth` ADD CONSTRAINT `OwnerProfitMonth_close_check` CHECK (
  DAYOFMONTH(`month`) = 1
  AND (`closedAt` IS NULL) = (`closedBy` IS NULL)
  AND (`closedAt` IS NULL) = (`revenueUgx` IS NULL)
  AND (`closedAt` IS NULL) = (`feesUgx` IS NULL)
  AND (`closedAt` IS NULL) = (`expensesUgx` IS NULL)
  AND (`closedAt` IS NULL) = (`taxUgx` IS NULL)
  AND (`closedAt` IS NULL) = (`netUgx` IS NULL)
  AND (`closedAt` IS NULL OR `netUgx` = CAST(`revenueUgx` AS SIGNED) - CAST(`feesUgx` AS SIGNED) - CAST(`expensesUgx` AS SIGNED) - CAST(`taxUgx` AS SIGNED)));

-- AddForeignKey
ALTER TABLE `OwnerCostEntry` ADD CONSTRAINT `OwnerCostEntry_recurringLineId_fkey` FOREIGN KEY (`recurringLineId`) REFERENCES `OwnerCostLine`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

