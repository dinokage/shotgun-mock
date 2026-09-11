import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";
import { getClientScope } from "../lib/clientScope";
import { getVisibilityScope, visibleEpisodeIds } from "../lib/visibilityScope";
import * as crypto from "crypto";

// Confirms projectId actually belongs to the caller's tenant before it's
// allowed to be linked onto an episode — the FK constraint alone only
// checks the row exists, not who owns it, so without this check any
// authenticated user could cross-link an episode to another tenant's
// project.
async function projectInTenant(id: string, tenantId: string) {
  const row = await prisma.project.findFirst({
    where: { id, tenantId },
    select: { id: true },
  });
  return !!row;
}

export const episodesRouter = Router();

episodesRouter.use(tenantAuthMiddleware);

episodesRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId } = req.query;
    // A client-access session sees only its granted project's episodes --
    // narrowed further to a single episode if that's the exact grant.
    const clientScope = await getClientScope(req);
    if (req.clientAccessLinkId && !clientScope) return res.json([]);

    // An employee session sees the episodes that actually hold work it can
    // see -- derived from the same visible shot/asset sets the shots/assets
    // endpoints return, so every shot a caller can list still has its
    // episode present here (tracking.tsx groups shots by episode and would
    // otherwise lose the grouping label). `null` = studio-wide, no filter.
    const scopedEpisodeIds = req.clientAccessLinkId
      ? null
      : await visibleEpisodeIds(tenantId, await getVisibilityScope(req));

    const rows = await prisma.episode.findMany({
      where: {
        tenantId,
        ...(typeof projectId === "string" ? { projectId } : {}),
        ...(scopedEpisodeIds ? { id: { in: scopedEpisodeIds } } : {}),
        ...(clientScope
          ? {
              projectId: clientScope.projectId,
              ...(clientScope.episodeId ? { id: clientScope.episodeId } : {}),
            }
          : {}),
      },
    });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// create_tasks matches TracksheetImportDialog.tsx's own gate -- episodes
// are created as part of the same tracksheet-import flow shots/sequences
// are, which leads (no manage_pipeline) legitimately use.
episodesRouter.post("/", requireCapability("create_tasks"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { projectId, name } = req.body;
    if (!projectId || !name)
      return res.status(400).json({ error: "Missing projectId or name" });

    if (!(await projectInTenant(projectId, tenantId)))
      return res.status(400).json({ error: "Invalid projectId" });

    const created = await prisma.episode.create({
      data: { id: crypto.randomUUID(), tenantId, projectId, name },
    });
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
