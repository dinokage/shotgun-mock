import { Router } from "express";
import { prisma } from "@workspace/db";
import * as crypto from "crypto";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { denyClientAccess } from "../middleware/rbac";

// Two routers, one file: both are "the signed-in employee's own settings"
// and share the same session-scoped ownership rules.

// --- Saved Tracking Grid views ------------------------------------------

export const trackingViewsRouter = Router();

trackingViewsRouter.use(tenantAuthMiddleware);
// The Tracking Grid is internal production tooling.
trackingViewsRouter.use(denyClientAccess);

function serializeView(
  row: {
    id: string;
    userId: string;
    name: string;
    filters: unknown;
    isShared: boolean;
    createdAt: Date;
    user?: { name: string } | null;
  },
  viewerId: string,
) {
  return {
    id: row.id,
    name: row.name,
    filters: row.filters,
    isShared: row.isShared,
    createdAt: row.createdAt,
    ownerName: row.user?.name ?? null,
    // Drives whether the client offers rename/delete -- the server enforces
    // the same rule on the write routes regardless of what the client shows.
    isOwner: row.userId === viewerId,
  };
}

trackingViewsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const rows = await prisma.trackingView.findMany({
      where: {
        tenantId,
        OR: [{ userId }, { isShared: true }],
      },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return res.json(rows.map((row) => serializeView(row, userId)));
  } catch (err) {
    req.log.error(err, "Failed to fetch tracking views");
    return res.status(500).json({ error: "Internal server error" });
  }
});

trackingViewsRouter.post("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { name, filters, isShared } = req.body ?? {};
    if (typeof name !== "string" || !name.trim())
      return res.status(400).json({ error: "name is required" });
    if (!filters || typeof filters !== "object" || Array.isArray(filters))
      return res.status(400).json({ error: "filters must be an object" });

    const created = await prisma.trackingView.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        // Owner comes from the session only -- never from the body.
        userId,
        name: name.trim(),
        filters: JSON.parse(JSON.stringify(filters)),
        isShared: isShared === true,
      },
      include: { user: { select: { name: true } } },
    });
    return res.status(201).json(serializeView(created, userId));
  } catch (err) {
    req.log.error(err, "Failed to create tracking view");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Ownership, not capability: a saved view is the author's own workspace
// state, so nobody else edits it -- an admin included. Sharing a view makes
// it readable studio-wide, never writable.
trackingViewsRouter.patch("/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const id = req.params.id as string;

    const { name, isShared } = req.body ?? {};
    const data: { name?: string; isShared?: boolean } = {};
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim())
        return res.status(400).json({ error: "name must be a non-empty string" });
      data.name = name.trim();
    }
    if (isShared !== undefined) {
      if (typeof isShared !== "boolean")
        return res.status(400).json({ error: "isShared must be a boolean" });
      data.isShared = isShared;
    }
    if (Object.keys(data).length === 0)
      return res.status(400).json({ error: "Nothing to update" });

    const result = await prisma.trackingView.updateMany({
      where: { id, tenantId, userId },
      data,
    });
    if (result.count === 0) return res.status(404).json({ error: "Not found" });

    const updated = await prisma.trackingView.findFirstOrThrow({
      where: { id, tenantId, userId },
      include: { user: { select: { name: true } } },
    });
    return res.json(serializeView(updated, userId));
  } catch (err) {
    req.log.error(err, "Failed to update tracking view");
    return res.status(500).json({ error: "Internal server error" });
  }
});

trackingViewsRouter.delete("/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const result = await prisma.trackingView.deleteMany({
      where: { id: req.params.id as string, tenantId, userId },
    });
    if (result.count === 0) return res.status(404).json({ error: "Not found" });
    return res.status(204).send();
  } catch (err) {
    req.log.error(err, "Failed to delete tracking view");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// --- Per-category notification preferences -------------------------------

export const notificationPreferencesRouter = Router();

notificationPreferencesRouter.use(tenantAuthMiddleware);
notificationPreferencesRouter.use(denyClientAccess);

// Mirrors NOTIFICATION_PREFERENCE_META in
// artifacts/forge/src/hooks/useNotificationPreferences.ts, and the categories
// createNotification() is called with elsewhere in this package.
const NOTIFICATION_CATEGORIES = [
  "assignment",
  "workflow",
  "mention",
  "review",
  "approval",
  "publishing",
  "handoff",
  "system",
];

// Only rows the user has actually changed exist -- a missing category means
// "still on the product default", which the client resolves from its meta.
// Nothing is pre-seeded on first read.
notificationPreferencesRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const rows = await prisma.notificationPreference.findMany({
      where: { tenantId, userId },
      select: { category: true, push: true, email: true },
    });
    return res.json(rows);
  } catch (err) {
    req.log.error(err, "Failed to fetch notification preferences");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Takes the full { push, email } pair rather than a single channel: the row
// may not exist yet, and creating it from a one-channel patch would silently
// reset the other channel to the column default instead of the product
// default the user was actually looking at.
notificationPreferencesRouter.put("/:category", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const category = req.params.category as string;
    if (!NOTIFICATION_CATEGORIES.includes(category))
      return res.status(400).json({ error: "Unknown notification category" });

    const { push, email } = req.body ?? {};
    if (typeof push !== "boolean" || typeof email !== "boolean")
      return res.status(400).json({ error: "push and email must both be booleans" });

    const saved = await prisma.notificationPreference.upsert({
      // The unique key is [userId, category], and userId comes from the
      // session -- there is no addressable path to another user's row.
      where: { userId_category: { userId, category } },
      create: { id: crypto.randomUUID(), tenantId, userId, category, push, email },
      update: { push, email },
      select: { category: true, push: true, email: true },
    });
    return res.json(saved);
  } catch (err) {
    req.log.error(err, "Failed to save notification preference");
    return res.status(500).json({ error: "Internal server error" });
  }
});
