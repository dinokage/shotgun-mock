import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability, denyClientAccess } from "../middleware/rbac";
import * as crypto from "crypto";

export const assetActivityRouter = Router();

assetActivityRouter.use(tenantAuthMiddleware);
// Attribution for internal pipeline work on WIP assets -- a client-access
// session has no legitimate reason to read or write it.
assetActivityRouter.use(denyClientAccess);

const ACTIVITY_KINDS = ["dcc_open", "publish"] as const;

// A DB foreign key only proves the referenced row exists, not who owns it, so
// every assetId arriving from a client is checked against the caller's own
// tenant. Same pattern as routes/shots.ts / routes/publishing.ts.
async function assetInTenant(id: string, tenantId: string) {
  const row = await prisma.asset.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}

const ACTIVITY_SELECT = {
  id: true,
  assetId: true,
  kind: true,
  app: true,
  userId: true,
  createdAt: true,
  user: { select: { id: true, name: true } },
} as const;

type ActivityRow = {
  id: string;
  assetId: string;
  kind: string;
  app: string | null;
  userId: string | null;
  createdAt: Date;
  user: { id: string; name: string } | null;
};

function toDTO(row: ActivityRow) {
  return {
    id: row.id,
    assetId: row.assetId,
    kind: row.kind,
    app: row.app,
    userId: row.userId,
    userName: row.user?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

// Newest-first, so a caller wanting "last opened in DCC" takes the first row
// of the kind it cares about. The whole history is returned rather than only
// the latest per kind: the point of this table is that the trace survives the
// next person's action.
assetActivityRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { assetId } = req.query;
    if (typeof assetId !== "string" || !assetId)
      return res.status(400).json({ error: "assetId is required" });

    if (!(await assetInTenant(assetId, tenantId)))
      return res.status(404).json({ error: "Asset not found" });

    const parsedLimit = Number(req.query.limit);
    const limit =
      Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : 50;

    const rows = await prisma.assetActivity.findMany({
      where: { tenantId, assetId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: ACTIVITY_SELECT,
    });
    return res.json(rows.map(toDTO));
  } catch (err) {
    req.log.error(err, "Failed to fetch asset activity");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// edit_tasks: artists open their own assets in a DCC and publish them, and it
// is the least restrictive real capability that still excludes client roles.
// The Asset's own `publishStatus` is a separate write (PUT /assets/:id, gated
// on submit_reviews) -- this route only appends the who/when trace.
assetActivityRouter.post("/", requireCapability("edit_tasks"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { assetId, kind, app } = req.body ?? {};

    if (typeof assetId !== "string" || !assetId)
      return res.status(400).json({ error: "assetId is required" });
    if (!ACTIVITY_KINDS.includes(kind))
      return res.status(400).json({ error: `kind must be one of: ${ACTIVITY_KINDS.join(", ")}` });
    if (app !== undefined && app !== null && typeof app !== "string")
      return res.status(400).json({ error: "app must be a string" });

    if (!(await assetInTenant(assetId, tenantId)))
      return res.status(400).json({ error: "assetId does not belong to this tenant" });

    const created = await prisma.assetActivity.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        assetId,
        kind,
        app: typeof app === "string" && app ? app : null,
        userId: req.userId ?? null,
      },
      select: ACTIVITY_SELECT,
    });
    return res.status(201).json(toDTO(created));
  } catch (err) {
    req.log.error(err, "Failed to record asset activity");
    return res.status(500).json({ error: "Internal server error" });
  }
});
