-- AlterTable
ALTER TABLE "pending_invites" ADD COLUMN "project_id" TEXT;
ALTER TABLE "pending_invites" ADD COLUMN "invited_by_user_id" TEXT;
