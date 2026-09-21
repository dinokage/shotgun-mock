-- AlterTable
ALTER TABLE "client_notes" ADD COLUMN "author_role" TEXT NOT NULL DEFAULT 'client';
ALTER TABLE "client_notes" ADD COLUMN "author_user_id" TEXT;
