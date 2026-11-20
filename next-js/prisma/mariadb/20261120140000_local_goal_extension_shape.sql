-- Hosted MariaDB overlay for 20261120140000_local_goal_extension_shape. Apply with the verified migration backup.
DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261113140000_expand_local_goal_markets'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 1
    OR (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261120140000_local_goal_extension_shape') <> 0
    OR (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'GoalMarketExtension' AND ENGINE = 'InnoDB') <> 1
    OR (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'GoalMarketExtension' AND CONSTRAINT_TYPE = 'CHECK'
      AND CONSTRAINT_NAME IN ('GoalMarketExtension_shape', 'GoalMarketExtension_seal')) <> 2
    OR (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'GoalMarketExtension' AND CONSTRAINT_NAME = 'GoalMarketExtension_shape_v2') <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Local goal extension prerequisites missing or already applied.';
  END IF;
END //
DELIMITER ;

-- Preserve the sealed revision and accept the local-only model supported by publication.
ALTER TABLE GoalMarketExtension
  DROP CONSTRAINT GoalMarketExtension_shape,
  ADD CONSTRAINT GoalMarketExtension_shape_v2 CHECK (COALESCE(
    JSON_UNQUOTE(JSON_EXTRACT(body, '$.revisionId')) = revisionId
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.cycleId')) = cycleId
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.fixtureId')) = fixtureId
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.ruleVersion')) = ruleVersion
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.contentHash')) = contentHash
    AND JSON_EXTRACT(body, '$.version') = 1
    AND (JSON_TYPE(JSON_EXTRACT(body, '$.scoreDistribution')) = 'OBJECT'
      OR JSON_TYPE(JSON_EXTRACT(body, '$.localPoisson')) = 'OBJECT')
    AND (JSON_CONTAINS_PATH(body, 'one', '$.scoreDistribution') = 0
      OR JSON_TYPE(JSON_EXTRACT(body, '$.scoreDistribution')) = 'OBJECT')
    AND (JSON_CONTAINS_PATH(body, 'one', '$.localPoisson') = 0
      OR JSON_TYPE(JSON_EXTRACT(body, '$.localPoisson')) = 'OBJECT')
    AND JSON_TYPE(JSON_EXTRACT(body, '$.markets')) = 'ARRAY', FALSE) = TRUE);

DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'GoalMarketExtension' AND CONSTRAINT_TYPE = 'CHECK'
      AND CONSTRAINT_NAME IN ('GoalMarketExtension_shape_v2', 'GoalMarketExtension_seal')) <> 2
    OR (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'GoalMarketExtension' AND CONSTRAINT_NAME = 'GoalMarketExtension_shape') <> 0
    OR (SELECT COUNT(*) FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_NAME = 'GoalMarketExtension_shape_v2' AND CHECK_CLAUSE LIKE '%localPoisson%'
      AND CHECK_CLAUSE LIKE '%scoreDistribution%' AND CHECK_CLAUSE LIKE '%contentHash%'
      AND CHECK_CLAUSE LIKE '%json_contains_path%') <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Local goal extension constraint verification failed.';
  END IF;
END //
DELIMITER ;

INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,started_at,applied_steps_count)
VALUES (UUID(),'ba851f7b23522d270130a9d3b2204facd5d97fc8f93ba884411a17aeceb2492d',NOW(3),'20261120140000_local_goal_extension_shape',NOW(3),1);
