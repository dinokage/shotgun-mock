import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db/schema";
import * as crypto from "crypto";

export async function recordAuditLog(params: {
  tenantId: string;
  actorUserId: string;
  action: string;
  targetEntityType: "asset" | "shot";
  targetEntityId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}) {
  await db.insert(auditLogsTable).values({
    id: crypto.randomUUID(),
    tenantId: params.tenantId,
    actorUserId: params.actorUserId,
    action: params.action,
    targetEntityType: params.targetEntityType,
    targetEntityId: params.targetEntityId,
    metadata: { before: params.before, after: params.after },
  });
}
