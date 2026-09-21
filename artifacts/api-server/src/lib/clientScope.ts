import { Request } from "express";
import { prisma } from "@workspace/db";

export interface ClientScope {
  /** The project every scoped list route (episodes/sequences/shots/reviews/
   * versions/broadcasts) filters by -- "the project currently being
   * browsed." Resolved from a `?projectId=` query param when the caller
   * passed one AND it's in `projectIds`, else defaults to `projectIds[0]`. */
  projectId: string;
  /** Every project this session may access at all -- for a signed-in
   * `client` account, every ClientProjectAccess grant; for a redeemed
   * ClientAccessLink, always exactly the one project it resolves to (a link
   * is minted for a single project/episode/shot by nature). Entitlement
   * checks (may this caller touch project X at all) must check membership
   * here, not equality against `projectId` -- `projectId` only tracks which
   * one is currently active for list-scoping. */
  projectIds: string[];
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
// for a real client login with no changes of its own. A client granted
// several projects sees all of them (projectIds); `projectId` picks which
// one is "active" for this request via `?projectId=`, so every existing
// list-scoping consumer keeps working unchanged.
export async function getClientScope(req: Request): Promise<ClientScope | null> {
  if (!req.clientAccessLinkId) {
    if (!req.userId || !req.roleId || !req.tenantId) return null;
    const role = await prisma.tenantRole.findFirst({
      where: { id: req.roleId, tenantId: req.tenantId },
      select: { name: true },
    });
    if (role?.name !== "client") return null;

    const grants = await prisma.clientProjectAccess.findMany({
      where: { tenantId: req.tenantId, userId: req.userId },
      orderBy: { createdAt: "desc" },
    });
    if (grants.length === 0) return null;
    const projectIds = grants.map((g) => g.projectId);
    const requested = typeof req.query.projectId === "string" ? req.query.projectId : null;
    const projectId = requested && projectIds.includes(requested) ? requested : projectIds[0];
    return { projectId, projectIds, episodeId: null, versionId: null, shotId: null };
  }

  const link = await prisma.clientAccessLink.findFirst({
    where: { id: req.clientAccessLinkId, revokedAt: null },
  });
  if (!link) return null;

  if (link.projectId) {
    return {
      projectId: link.projectId,
      projectIds: [link.projectId],
      episodeId: null,
      versionId: null,
      shotId: null,
    };
  }

  if (link.episodeId) {
    const episode = await prisma.episode.findUnique({
      where: { id: link.episodeId },
      select: { projectId: true },
    });
    if (!episode) return null;
    return {
      projectId: episode.projectId,
      projectIds: [episode.projectId],
      episodeId: link.episodeId,
      versionId: null,
      shotId: null,
    };
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
      projectIds: [shot.projectId],
      episodeId: shot.episodeId,
      versionId: link.versionId,
      shotId: version.entityId,
    };
  }

  return null;
}
