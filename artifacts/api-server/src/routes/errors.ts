import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";
import { rateLimitByIp } from "../lib/rateLimit";
import {
  captureError,
  sweepOldErrors,
  resolveSoleTenantId,
} from "../lib/errorSink";
import { verifySession } from "../lib/auth";

export const errorsRouter = Router();

/**
 * A browser can produce errors in bursts -- a render loop that throws fires
 * on every frame -- so ingestion is capped. Generous, because losing the
 * report of a genuine incident is the expensive failure here, not the write.
 */
const REPORT_RULE = { name: "errors:report", limit: 240, windowSeconds: 300 };

/**
 * POST /api/errors
 *
 * Client-side error reporting. Deliberately NOT behind tenantAuthMiddleware:
 * the errors most worth seeing are the ones that break the app before or
 * during sign-in, and requiring a valid session to report them would hide
 * exactly those. The session is read opportunistically instead, so a report
 * is attributed when it can be and still accepted when it cannot.
 */
errorsRouter.post("/", rateLimitByIp(REPORT_RULE), async (req, res) => {
  try {
    const { kind, message, stack, path, release, context } = req.body ?? {};
    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    // Best-effort attribution. An invalid or absent cookie is not an error.
    let tenantId: string | null = null;
    let userId: string | null = null;
    try {
      const token = req.cookies?.session;
      const session = token ? verifySession(token) : null;
      if (session) {
        tenantId = session.tenantId ?? null;
        userId = session.userId ?? null;
      }
    } catch {
      // Unattributed report; still worth keeping.
    }

    // No session -- a crash before sign-in, which is exactly the kind most
    // worth keeping. Attribute it to the deployment's tenant where that is
    // unambiguous, so it reaches an administrator without null-tenant rows
    // having to be shown across tenants.
    if (!tenantId) tenantId = await resolveSoleTenantId();

    await captureError({
      source: "web",
      kind: typeof kind === "string" ? kind : "Error",
      message,
      stack: typeof stack === "string" ? stack : null,
      path: typeof path === "string" ? path : null,
      release: typeof release === "string" ? release : null,
      userAgent: req.get("user-agent") ?? null,
      tenantId,
      userId,
      context: typeof context === "object" && context ? context : {},
    });

    // 202: accepted for recording. The browser has nothing to do with the
    // result and must never block on it.
    return res.status(202).json({ recorded: true });
  } catch {
    return res.status(202).json({ recorded: false });
  }
});

// Everything below reads captured errors, which contain stack traces and
// request context from across the studio. That is administrative data.
errorsRouter.use(tenantAuthMiddleware);

/**
 * GET /api/errors
 *
 * Newest first, with `?source=`, `?resolved=`, `?kind=` and `?limit=`.
 * Gated on manage_roles -- the capability that already marks "may see how
 * the platform itself is configured and behaving", held by admin, producer
 * and production head but not by artists or leads.
 */
errorsRouter.get("/", requireCapability("manage_roles"), async (req, res) => {
  try {
    await sweepOldErrors();
    const tenantId = req.tenantId!;
    const { source, kind } = req.query;
    const resolved = req.query.resolved;
    const limit = Math.min(Number(req.query.limit) || 100, 500);

    const rows = await prisma.errorEvent.findMany({
      where: {
        // Strictly this tenant. Sharing null-tenant rows across tenants would
        // leak one studio's stack traces to another's administrators -- and
        // because reporting is unauthenticated by design, it would also let
        // anyone who can reach the endpoint write text into every tenant's
        // diagnostics screen at once. Pre-sign-in crashes are attributed at
        // ingest instead (see resolveSoleTenantId).
        tenantId,
        ...(typeof source === "string" ? { source } : {}),
        ...(typeof kind === "string" ? { kind } : {}),
        ...(resolved === "true"
          ? { resolvedAt: { not: null } }
          : resolved === "false"
            ? { resolvedAt: null }
            : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return res.json(rows);
  } catch (err) {
    req.log.error(err, "Failed to read error events");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/errors/summary
 *
 * Grouped counts, so the screen can lead with "what is happening a lot"
 * rather than a reverse-chronological wall in which a single noisy fault
 * buries everything else.
 */
errorsRouter.get("/summary", requireCapability("manage_roles"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const since = new Date(Date.now() - 7 * 86_400_000);
    const grouped = await prisma.errorEvent.groupBy({
      by: ["kind", "source"],
      where: { tenantId, createdAt: { gte: since } },
      _count: { _all: true },
      _max: { createdAt: true },
    });

    const unresolved = await prisma.errorEvent.count({
      where: { tenantId, resolvedAt: null },
    });

    return res.json({
      since: since.toISOString(),
      unresolved,
      groups: grouped
        .map((g) => ({
          kind: g.kind,
          source: g.source,
          count: g._count._all,
          lastSeen: g._max.createdAt,
        }))
        .sort((a, b) => b.count - a.count),
    });
  } catch (err) {
    req.log.error(err, "Failed to summarise error events");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/** Marks one error dealt with, so the list can separate new from known. */
errorsRouter.post("/:id/resolve", requireCapability("manage_roles"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    // Express types `req.params.id` as possibly an array (a repeated query
    // parameter can produce one); coerce so the id is unambiguously a string.
    const id = String(req.params.id);
    const updated = await prisma.errorEvent.updateMany({
      where: { id, tenantId },
      data: { resolvedAt: new Date() },
    });
    if (updated.count === 0) return res.status(404).json({ error: "Not found" });
    return res.json({ resolved: true });
  } catch (err) {
    req.log.error(err, "Failed to resolve error event");
    return res.status(500).json({ error: "Internal server error" });
  }
});
