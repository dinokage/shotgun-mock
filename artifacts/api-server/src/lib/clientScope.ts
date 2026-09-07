import { Request } from "express";
import { prisma } from "@workspace/db";

export interface ClientScope {
  projectId: string;
  episodeId: string | null;
  versionId: string | null;
  shotId: string | null;
}

// Resolves a client-access session (req.clientAccessLinkId) down to the
// concrete project/episode/version/shot it was actually granted, walking up
// whichever single field the link was scoped to (schema guarantees exactly
// one of projectId/episodeId/versionId is set -- see client-access.ts's
// scopeInTenant). Returns null for a non-client session (no restriction
// needed -- every other role's visibility is governed by requireCapability/
// tenant scoping elsewhere) or when the link can't be resolved at all (fails
// closed: callers must treat null-for-a-client-session as "resolve failed",
// distinguishable from a genuinely non-client caller by checking
// req.clientAccessLinkId themselves, same as denyClientAccess does).
export async function getClientScope(req: Request): Promise<ClientScope | null> {
  if (!req.clientAccessLinkId) return null;

  const link = await prisma.clientAccessLink.findFirst({
    where: { id: req.clientAccessLinkId, revokedAt: null },
  });
  if (!link) return null;

  if (link.projectId) {
    return { projectId: link.projectId, episodeId: null, versionId: null, shotId: null };
  }

  if (link.episodeId) {
    const episode = await prisma.episode.findUnique({
      where: { id: link.episodeId },
      select: { projectId: true },
    });
    if (!episode) return null;
    return { projectId: episode.projectId, episodeId: link.episodeId, versionId: null, shotId: null };
  }

  if (link.versionId) {
    const version = await prisma.version.findUnique({
      where: { id: link.versionId },
      select: { entityId: true, entityType: true },
    });
    // Only shot-backed versions are resolvable to a project today -- an
    // asset-backed version has no direct project/episode link in the schema.
    if (!version || version.entityType !== "shot") return null;
    const shot = await prisma.shot.findUnique({
      where: { id: version.entityId },
      select: { projectId: true, episodeId: true },
    });
    if (!shot) return null;
    return {
      projectId: shot.projectId,
      episodeId: shot.episodeId,
      versionId: link.versionId,
      shotId: version.entityId,
    };
  }

  return null;
}
