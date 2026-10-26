-- Country flag of a competition: an approved credential-free remote image URL, never image bytes.
-- Additive and nullable (MySQL 8.4 adds a trailing NULL column in place, without a table rebuild).
-- Existing rows read as "no flag" until the next /fixtures date sync or /leagues import observes one.
-- AlterTable
ALTER TABLE `FootballCompetition` ADD COLUMN `countryFlagUrl` VARCHAR(2048) NULL;
