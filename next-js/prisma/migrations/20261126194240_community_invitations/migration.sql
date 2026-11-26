-- AlterTable
ALTER TABLE `MemberAccount` ADD COLUMN `communityAttemptId` CHAR(36) NULL,
    ADD COLUMN `communityInvitationId` CHAR(36) NULL,
    ADD COLUMN `communityInvitedAt` DATETIME(3) NULL,
    ADD COLUMN `communityJoinedAt` DATETIME(3) NULL;
