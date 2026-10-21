-- Initial packages use the documented prices. Existing packages, including owner-edited prices and inactive ones,
-- are preserved when their duration already exists.
INSERT INTO `SubscriptionPlan` (`id`, `name`, `durationDays`, `priceUgx`, `active`, `sortOrder`, `createdAt`, `updatedAt`)
SELECT 'c9d0b001-0000-4000-8000-000000000001', 'Daily', 1, 1000, TRUE, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (SELECT 1 FROM `SubscriptionPlan` WHERE `durationDays` = 1);

INSERT INTO `SubscriptionPlan` (`id`, `name`, `durationDays`, `priceUgx`, `active`, `sortOrder`, `createdAt`, `updatedAt`)
SELECT 'c9d0b001-0000-4000-8000-000000000007', 'Weekly', 7, 5000, TRUE, 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (SELECT 1 FROM `SubscriptionPlan` WHERE `durationDays` = 7);

INSERT INTO `SubscriptionPlan` (`id`, `name`, `durationDays`, `priceUgx`, `active`, `sortOrder`, `createdAt`, `updatedAt`)
SELECT 'c9d0b001-0000-4000-8000-000000000030', 'Monthly', 30, 20000, TRUE, 2, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (SELECT 1 FROM `SubscriptionPlan` WHERE `durationDays` = 30);
