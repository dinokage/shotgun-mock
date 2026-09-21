-- CreateTable
CREATE TABLE "timesheet_approvals" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "approved_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timesheet_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "timesheet_approvals_tenant_id_user_id_date_key" ON "timesheet_approvals"("tenant_id", "user_id", "date");

-- CreateIndex
CREATE INDEX "timesheet_approvals_tenant_id_date_idx" ON "timesheet_approvals"("tenant_id", "date");
