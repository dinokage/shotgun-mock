-- AlterTable
ALTER TABLE "users" ADD COLUMN "capacity" INTEGER;

-- AlterTable
ALTER TABLE "standup_updates" ADD COLUMN "attachment_urls" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "client_project_access" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "granted_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_project_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_project_access_user_id_project_id_unique" ON "client_project_access"("user_id", "project_id");

-- AddForeignKey
ALTER TABLE "client_project_access" ADD CONSTRAINT "client_project_access_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "client_project_access" ADD CONSTRAINT "client_project_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "client_project_access" ADD CONSTRAINT "client_project_access_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "client_project_access" ADD CONSTRAINT "client_project_access_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
