import { prisma } from "@workspace/db";
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
  await prisma.auditLog.create({
    data: {
      id: crypto.randomUUID(),
      tenantId: params.tenantId,
      actorUserId: params.actorUserId,
      action: params.action,
      targetEntityType: params.targetEntityType,
      targetEntityId: params.targetEntityId,
      metadata: JSON.parse(
        JSON.stringify({ before: params.before, after: params.after }),
      ),
    },
  });
}
