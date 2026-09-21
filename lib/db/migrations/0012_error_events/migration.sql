-- CreateTable
CREATE TABLE "error_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "source" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "path" TEXT,
    "method" TEXT,
    "status_code" INTEGER,
    "user_id" TEXT,
    "user_agent" TEXT,
    "release" TEXT,
    "context" JSONB NOT NULL DEFAULT '{}',
    "resolved_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "error_events_tenant_id_created_at_idx" ON "error_events"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "error_events_kind_created_at_idx" ON "error_events"("kind", "created_at");
