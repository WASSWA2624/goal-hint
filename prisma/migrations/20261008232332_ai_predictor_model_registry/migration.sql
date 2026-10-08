-- CreateTable
CREATE TABLE `ModelVersion` (
    `id` CHAR(64) NOT NULL,
    `provider` VARCHAR(128) NOT NULL,
    `model` VARCHAR(128) NOT NULL,
    `providerModelVersion` VARCHAR(128) NOT NULL,
    `contractVersion` VARCHAR(128) NOT NULL,
    `promptVersion` VARCHAR(128) NOT NULL,
    `schemaVersion` VARCHAR(128) NOT NULL,
    `calibrationKind` VARCHAR(16) NOT NULL,
    `calibrationVersion` VARCHAR(128) NOT NULL,
    `evaluationStatus` VARCHAR(16) NOT NULL,
    `evaluationVersion` VARCHAR(128) NOT NULL,
    `trainingStartsAt` DATETIME(3) NULL,
    `trainingEndsAt` DATETIME(3) NULL,
    `validationStartsAt` DATETIME(3) NULL,
    `validationEndsAt` DATETIME(3) NULL,
    `calibrationStartsAt` DATETIME(3) NULL,
    `calibrationEndsAt` DATETIME(3) NULL,
    `finalTestStartsAt` DATETIME(3) NULL,
    `finalTestEndsAt` DATETIME(3) NULL,
    `integrity` CHAR(64) NOT NULL,
    `configurationJson` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ModelVersion_provider_model_providerModelVersion_idx`(`provider`, `model`, `providerModelVersion`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- Native projections supplement the strict content-addressed parser. All grants
-- for the application on this append-only table are SELECT and INSERT only.
ALTER TABLE `ModelVersion`
    ADD CONSTRAINT `ModelVersion_identity_check` CHECK (
        `id` REGEXP '^[a-f0-9]{64}$' AND `integrity` REGEXP '^[a-f0-9]{64}$'
        AND `calibrationKind` IN ('none', 'evaluated')
        AND `evaluationStatus` IN ('provisional', 'evaluated')
        AND (`calibrationKind` <> 'evaluated' OR `calibrationStartsAt` IS NOT NULL)
    ),
    ADD CONSTRAINT `ModelVersion_windows_check` CHECK (
        ((`trainingStartsAt` IS NULL AND `trainingEndsAt` IS NULL) OR
         (`trainingStartsAt` IS NOT NULL AND `trainingEndsAt` IS NOT NULL AND `trainingStartsAt` < `trainingEndsAt`)) AND
        ((`validationStartsAt` IS NULL AND `validationEndsAt` IS NULL) OR
         (`validationStartsAt` IS NOT NULL AND `validationEndsAt` IS NOT NULL AND `validationStartsAt` < `validationEndsAt`)) AND
        ((`calibrationStartsAt` IS NULL AND `calibrationEndsAt` IS NULL) OR
         (`calibrationStartsAt` IS NOT NULL AND `calibrationEndsAt` IS NOT NULL AND `calibrationStartsAt` < `calibrationEndsAt`)) AND
        ((`finalTestStartsAt` IS NULL AND `finalTestEndsAt` IS NULL) OR
         (`finalTestStartsAt` IS NOT NULL AND `finalTestEndsAt` IS NOT NULL AND `finalTestStartsAt` < `finalTestEndsAt`)) AND
        (`trainingEndsAt` IS NULL OR `validationStartsAt` IS NULL OR `trainingEndsAt` <= `validationStartsAt`) AND
        (`trainingEndsAt` IS NULL OR `calibrationStartsAt` IS NULL OR `trainingEndsAt` <= `calibrationStartsAt`) AND
        (`trainingEndsAt` IS NULL OR `finalTestStartsAt` IS NULL OR `trainingEndsAt` <= `finalTestStartsAt`) AND
        (`validationEndsAt` IS NULL OR `calibrationStartsAt` IS NULL OR `validationEndsAt` <= `calibrationStartsAt`) AND
        (`validationEndsAt` IS NULL OR `finalTestStartsAt` IS NULL OR `validationEndsAt` <= `finalTestStartsAt`) AND
        (`calibrationEndsAt` IS NULL OR `finalTestStartsAt` IS NULL OR `calibrationEndsAt` <= `finalTestStartsAt`)
    ),
    ADD CONSTRAINT `ModelVersion_metadata_check` CHECK (COALESCE(
        JSON_TYPE(`configurationJson`) = 'OBJECT' AND JSON_LENGTH(`configurationJson`) = 15
        AND JSON_TYPE(JSON_EXTRACT(`configurationJson`, '$.version')) = 'INTEGER'
        AND JSON_EXTRACT(`configurationJson`, '$.version') = 1
        AND JSON_TYPE(JSON_EXTRACT(`configurationJson`, '$.id')) = 'STRING'
        AND `id` = JSON_UNQUOTE(JSON_EXTRACT(`configurationJson`, '$.id'))
        AND JSON_TYPE(JSON_EXTRACT(`configurationJson`, '$.hash')) = 'STRING'
        AND `id` = JSON_UNQUOTE(JSON_EXTRACT(`configurationJson`, '$.hash'))
        AND JSON_TYPE(JSON_EXTRACT(`configurationJson`, '$.provider')) = 'STRING'
        AND `provider` = JSON_UNQUOTE(JSON_EXTRACT(`configurationJson`, '$.provider'))
        AND JSON_TYPE(JSON_EXTRACT(`configurationJson`, '$.model')) = 'STRING'
        AND `model` = JSON_UNQUOTE(JSON_EXTRACT(`configurationJson`, '$.model'))
        AND JSON_TYPE(JSON_EXTRACT(`configurationJson`, '$.providerModelVersion')) = 'STRING'
        AND `providerModelVersion` = JSON_UNQUOTE(JSON_EXTRACT(`configurationJson`, '$.providerModelVersion'))
        AND JSON_TYPE(JSON_EXTRACT(`configurationJson`, '$.contractVersion')) = 'STRING'
        AND `contractVersion` = JSON_UNQUOTE(JSON_EXTRACT(`configurationJson`, '$.contractVersion'))
        AND JSON_TYPE(JSON_EXTRACT(`configurationJson`, '$.promptVersion')) = 'STRING'
        AND `promptVersion` = JSON_UNQUOTE(JSON_EXTRACT(`configurationJson`, '$.promptVersion'))
        AND JSON_TYPE(JSON_EXTRACT(`configurationJson`, '$.schemaVersion')) = 'STRING'
        AND `schemaVersion` = JSON_UNQUOTE(JSON_EXTRACT(`configurationJson`, '$.schemaVersion'))
        AND `calibrationKind` = JSON_UNQUOTE(JSON_EXTRACT(`configurationJson`, '$.calibration.kind'))
        AND `calibrationVersion` = JSON_UNQUOTE(JSON_EXTRACT(`configurationJson`, '$.calibration.version'))
        AND `evaluationStatus` = JSON_UNQUOTE(JSON_EXTRACT(`configurationJson`, '$.evaluation.status'))
        AND `evaluationVersion` = JSON_UNQUOTE(JSON_EXTRACT(`configurationJson`, '$.evaluation.version'))
        AND ((`evaluationStatus` = 'provisional' AND JSON_TYPE(JSON_EXTRACT(`configurationJson`, '$.evaluation.evaluationRef')) = 'NULL') OR
          (`evaluationStatus` = 'evaluated' AND JSON_TYPE(JSON_EXTRACT(`configurationJson`, '$.evaluation.evaluationRef')) = 'STRING'
           AND CHAR_LENGTH(JSON_UNQUOTE(JSON_EXTRACT(`configurationJson`, '$.evaluation.evaluationRef'))) > 0))
        AND JSON_TYPE(JSON_EXTRACT(`configurationJson`, '$.windows')) = 'OBJECT'
        AND JSON_LENGTH(JSON_EXTRACT(`configurationJson`, '$.windows')) = 4
        AND ((`trainingStartsAt` IS NULL AND JSON_TYPE(JSON_EXTRACT(`configurationJson`, '$.windows.training')) = 'NULL') OR
          (JSON_TYPE(JSON_EXTRACT(`configurationJson`, '$.windows.training')) = 'OBJECT'
           AND JSON_LENGTH(JSON_EXTRACT(`configurationJson`, '$.windows.training')) = 2
           AND JSON_TYPE(JSON_EXTRACT(`configurationJson`, '$.windows.training.startsAt')) = 'INTEGER'
           AND JSON_TYPE(JSON_EXTRACT(`configurationJson`, '$.windows.training.endsAt')) = 'INTEGER'
           AND TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00', `trainingStartsAt`) DIV 1000 =
             CAST(JSON_EXTRACT(`configurationJson`, '$.windows.training.startsAt') AS SIGNED)
           AND TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00', `trainingEndsAt`) DIV 1000 =
             CAST(JSON_EXTRACT(`configurationJson`, '$.windows.training.endsAt') AS SIGNED)))
        AND ((`validationStartsAt` IS NULL AND JSON_TYPE(JSON_EXTRACT(`configurationJson`, '$.windows.validation')) = 'NULL') OR
          (JSON_TYPE(JSON_EXTRACT(`configurationJson`, '$.windows.validation')) = 'OBJECT'
           AND JSON_LENGTH(JSON_EXTRACT(`configurationJson`, '$.windows.validation')) = 2
           AND JSON_TYPE(JSON_EXTRACT(`configurationJson`, '$.windows.validation.startsAt')) = 'INTEGER'
           AND JSON_TYPE(JSON_EXTRACT(`configurationJson`, '$.windows.validation.endsAt')) = 'INTEGER'
           AND TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00', `validationStartsAt`) DIV 1000 =
             CAST(JSON_EXTRACT(`configurationJson`, '$.windows.validation.startsAt') AS SIGNED)
           AND TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00', `validationEndsAt`) DIV 1000 =
             CAST(JSON_EXTRACT(`configurationJson`, '$.windows.validation.endsAt') AS SIGNED)))
        AND ((`calibrationStartsAt` IS NULL AND JSON_TYPE(JSON_EXTRACT(`configurationJson`, '$.windows.calibration')) = 'NULL') OR
          (JSON_TYPE(JSON_EXTRACT(`configurationJson`, '$.windows.calibration')) = 'OBJECT'
           AND JSON_LENGTH(JSON_EXTRACT(`configurationJson`, '$.windows.calibration')) = 2
           AND JSON_TYPE(JSON_EXTRACT(`configurationJson`, '$.windows.calibration.startsAt')) = 'INTEGER'
           AND JSON_TYPE(JSON_EXTRACT(`configurationJson`, '$.windows.calibration.endsAt')) = 'INTEGER'
           AND TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00', `calibrationStartsAt`) DIV 1000 =
             CAST(JSON_EXTRACT(`configurationJson`, '$.windows.calibration.startsAt') AS SIGNED)
           AND TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00', `calibrationEndsAt`) DIV 1000 =
             CAST(JSON_EXTRACT(`configurationJson`, '$.windows.calibration.endsAt') AS SIGNED)))
        AND ((`finalTestStartsAt` IS NULL AND JSON_TYPE(JSON_EXTRACT(`configurationJson`, '$.windows.finalTest')) = 'NULL') OR
          (JSON_TYPE(JSON_EXTRACT(`configurationJson`, '$.windows.finalTest')) = 'OBJECT'
           AND JSON_LENGTH(JSON_EXTRACT(`configurationJson`, '$.windows.finalTest')) = 2
           AND JSON_TYPE(JSON_EXTRACT(`configurationJson`, '$.windows.finalTest.startsAt')) = 'INTEGER'
           AND JSON_TYPE(JSON_EXTRACT(`configurationJson`, '$.windows.finalTest.endsAt')) = 'INTEGER'
           AND TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00', `finalTestStartsAt`) DIV 1000 =
             CAST(JSON_EXTRACT(`configurationJson`, '$.windows.finalTest.startsAt') AS SIGNED)
           AND TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00', `finalTestEndsAt`) DIV 1000 =
             CAST(JSON_EXTRACT(`configurationJson`, '$.windows.finalTest.endsAt') AS SIGNED))),
        FALSE
    ) = TRUE),
    ADD CONSTRAINT `ModelVersion_integrity_check` CHECK (COALESCE(
        `integrity` = SHA2(CONCAT(`id`, ':', CAST(`configurationJson` AS CHAR)), 256), FALSE
    ) = TRUE);
