-- Null contact/template settings preserve the existing configured support details and message defaults.
ALTER TABLE `MemberAccount` ADD COLUMN `whatsappNotificationsAt` DATETIME(3) NULL;

ALTER TABLE `SubscriptionSettings`
    ADD COLUMN `supportContacts` JSON NULL,
    ADD COLUMN `messageTemplates` JSON NULL;

-- Each notification channel has its own durable dispatch claim. Existing queued notices remain SMS notices.
ALTER TABLE `PaymentNotificationOutbox`
    DROP CONSTRAINT `PaymentNotificationOutbox_decision_check`,
    DROP CONSTRAINT `PaymentNotificationOutbox_state_check`,
    DROP INDEX `PaymentNotificationOutbox_targetType_targetId_decision_key`,
    MODIFY COLUMN `decision` VARCHAR(32) NOT NULL,
    ADD COLUMN `channel` VARCHAR(8) NOT NULL DEFAULT 'sms',
    ADD COLUMN `templateSnapshot` JSON NULL,
    ADD UNIQUE INDEX `PaymentNotificationOutbox_targetType_targetId_decision_chann_key` (`targetType`, `targetId`, `decision`, `channel`),
    ADD CONSTRAINT `PaymentNotificationOutbox_decision_check` CHECK (
        (`targetType` = 'payment' AND `decision` IN ('approved', 'credited', 'rejected', 'received')) OR
        (`targetType` = 'access-code' AND `decision` = 'renewed') OR
        (`targetType` = 'member' AND `decision` = 'welcome')
    ),
    ADD CONSTRAINT `PaymentNotificationOutbox_channel_check` CHECK (`channel` IN ('sms', 'whatsapp')),
    ADD CONSTRAINT `PaymentNotificationOutbox_state_check` CHECK (
        (`status` = 'queued' AND `startedAt` IS NULL AND `finishedAt` IS NULL AND `attemptId` IS NULL) OR
        (`status` = 'dispatching' AND `startedAt` IS NOT NULL AND `finishedAt` IS NULL AND `attemptId` IS NOT NULL) OR
        (`status` IN ('sent', 'failed', 'uncertain') AND `startedAt` IS NOT NULL AND `finishedAt` IS NOT NULL AND `attemptId` IS NOT NULL) OR
        (`status` IN ('unsupported', 'unavailable', 'cancelled', 'skipped') AND `startedAt` IS NULL AND `finishedAt` IS NOT NULL AND `attemptId` IS NULL)
    );
