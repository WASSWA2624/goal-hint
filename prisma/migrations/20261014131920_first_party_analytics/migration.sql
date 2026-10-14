-- CreateTable
CREATE TABLE `AnalyticsVisitor` (
    `id` CHAR(64) NOT NULL,
    `firstSeenAt` DATETIME(3) NOT NULL,
    `lastSeenAt` DATETIME(3) NOT NULL,
    `sessionCount` INTEGER UNSIGNED NOT NULL,

    INDEX `AnalyticsVisitor_lastSeenAt_idx`(`lastSeenAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AnalyticsSession` (
    `id` CHAR(36) NOT NULL,
    `visitorId` CHAR(64) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `lastSeenAt` DATETIME(3) NOT NULL,
    `isNewVisitor` BOOLEAN NOT NULL,
    `visitNumber` INTEGER UNSIGNED NOT NULL,
    `entryPath` VARCHAR(512) NOT NULL,
    `entryRoute` VARCHAR(128) NOT NULL,
    `exitPath` VARCHAR(512) NOT NULL,
    `exitRoute` VARCHAR(128) NOT NULL,
    `pageviews` INTEGER UNSIGNED NOT NULL,
    `interactions` INTEGER UNSIGNED NOT NULL,
    `engagedMs` INTEGER UNSIGNED NOT NULL,
    `converted` BOOLEAN NOT NULL,
    `channel` VARCHAR(24) NOT NULL,
    `referrerHost` VARCHAR(255) NULL,
    `utmSource` VARCHAR(100) NULL,
    `utmMedium` VARCHAR(100) NULL,
    `utmCampaign` VARCHAR(100) NULL,
    `utmTerm` VARCHAR(100) NULL,
    `utmContent` VARCHAR(100) NULL,
    `deviceType` VARCHAR(16) NOT NULL,
    `browser` VARCHAR(32) NOT NULL,
    `browserVersion` VARCHAR(16) NULL,
    `os` VARCHAR(32) NOT NULL,
    `osVersion` VARCHAR(16) NULL,
    `country` CHAR(2) NULL,
    `city` VARCHAR(96) NULL,
    `geoSource` VARCHAR(16) NOT NULL,
    `language` VARCHAR(16) NULL,
    `screen` VARCHAR(16) NULL,

    INDEX `AnalyticsSession_startedAt_idx`(`startedAt`),
    INDEX `AnalyticsSession_lastSeenAt_idx`(`lastSeenAt`),
    INDEX `AnalyticsSession_visitorId_startedAt_idx`(`visitorId`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AnalyticsPageview` (
    `id` CHAR(36) NOT NULL,
    `sessionId` CHAR(36) NOT NULL,
    `visitorId` CHAR(64) NOT NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `sequence` INTEGER UNSIGNED NOT NULL,
    `path` VARCHAR(512) NOT NULL,
    `route` VARCHAR(128) NOT NULL,
    `title` VARCHAR(200) NULL,
    `previousPath` VARCHAR(512) NULL,
    `engagedMs` INTEGER UNSIGNED NOT NULL,

    INDEX `AnalyticsPageview_occurredAt_idx`(`occurredAt`),
    INDEX `AnalyticsPageview_sessionId_sequence_idx`(`sessionId`, `sequence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AnalyticsEvent` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `sessionId` CHAR(36) NOT NULL,
    `visitorId` CHAR(64) NOT NULL,
    `pageviewId` CHAR(36) NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `type` VARCHAR(16) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `path` VARCHAR(512) NOT NULL,
    `target` VARCHAR(512) NULL,

    INDEX `AnalyticsEvent_occurredAt_type_idx`(`occurredAt`, `type`),
    INDEX `AnalyticsEvent_sessionId_type_idx`(`sessionId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AnalyticsAdminSession` (
    `tokenHash` CHAR(64) NOT NULL,
    `username` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `lastSeenAt` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `AnalyticsAdminSession_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`tokenHash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AnalyticsLoginThrottle` (
    `key` CHAR(64) NOT NULL,
    `failures` INTEGER UNSIGNED NOT NULL,
    `windowStartedAt` DATETIME(3) NOT NULL,
    `lockedUntil` DATETIME(3) NULL,

    INDEX `AnalyticsLoginThrottle_windowStartedAt_idx`(`windowStartedAt`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AnalyticsSetting` (
    `key` VARCHAR(64) NOT NULL,
    `value` VARCHAR(256) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

