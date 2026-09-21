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
//
// A signed-in `client`-role account (real userId, no clientAccessLinkId) is
// resolved the same way, via ClientProjectAccess instead of a redeemed link
// -- this is what makes every route that already calls getClientScope() work
// for a real client login with no changes of its own. Known simplification:
// if a client has been granted more than one project, only the most
// recently granted one is used (ClientScope has room for exactly one
// project) -- multi-project clients need every scope-consuming route
// widened to a project list, which is a larger, separate change.
export async function getClientScope(req: Request): Promise<ClientScope | null> {
  if (!req.clientAccessLinkId) {
    if (!req.userId || !req.roleId || !req.tenantId) return null;
    const role = await prisma.tenantRole.findFirst({
      where: { id: req.roleId, tenantId: req.tenantId },
      select: { name: true },
    });
    if (role?.name !== "client") return null;

    const grant = await prisma.clientProjectAccess.findFirst({
      where: { tenantId: req.tenantId, userId: req.userId },
      orderBy: { createdAt: "desc" },
    });
    if (!grant) return null;
    return { projectId: grant.projectId, episodeId: null, versionId: null, shotId: null };
  }

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
