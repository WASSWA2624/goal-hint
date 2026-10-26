-- Retire older full logins before enabling the one-device login policy. Pending verification/reset sessions keep
-- their existing restrictions; new successful logins atomically replace all sessions under the account lock.
DELETE older FROM `MemberSession` AS older
INNER JOIN `MemberSession` AS newer ON newer.`accountId` = older.`accountId`
  AND newer.`authenticatedAt` IS NOT NULL AND newer.`passwordResetAt` IS NULL
  AND newer.`expiresAt` > UTC_TIMESTAMP(3)
  AND (
    newer.`authenticatedAt` > older.`authenticatedAt`
    OR (newer.`authenticatedAt` = older.`authenticatedAt` AND newer.`createdAt` > older.`createdAt`)
    OR (newer.`authenticatedAt` = older.`authenticatedAt` AND newer.`createdAt` = older.`createdAt` AND newer.`tokenHash` > older.`tokenHash`)
  )
WHERE older.`authenticatedAt` IS NOT NULL AND older.`passwordResetAt` IS NULL
  AND older.`expiresAt` > UTC_TIMESTAMP(3);
