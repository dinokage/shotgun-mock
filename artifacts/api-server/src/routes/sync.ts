import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";

export const syncRouter = Router();

syncRouter.use(tenantAuthMiddleware);

/**
 * GET /api/sync/digest
 *
 * A cheap "has anything changed?" probe for the collections that are
 * expensive to ship.
 *
 * The client re-hydrates its whole world on a timer so that a reassignment by
 * one person shows up for everyone else without a reload. That is the right
 * behaviour, but it was implemented by refetching every collection every ten
 * seconds -- and two of them are large: tasks is ~940KB across 1,066 rows and
 * shots ~650KB across 1,065. ETags meant the browser usually got a 304, so
 * the bandwidth was hidden, but the server still ran both queries and
 * serialised both payloads in full just to compute the ETag that said
 * "nothing changed". At studio size that is tens of requests per second of
 * pure waste, and every write invalidates the cache and sends the full
 * payload to everyone at once.
 *
 * This answers the same question in a few hundred bytes: per collection, a
 * row count and the newest change timestamp. Both come from indexed
 * aggregates, so Postgres answers without reading the rows themselves. The
 * client compares the token to what it already holds and only refetches the
 * collections that actually moved.
 *
 * Deliberately tenant-wide rather than scoped to the caller's visibility.
 * A tenant-wide aggregate can never miss a change inside someone's subset --
 * the count or the max moves either way -- so the worst case is an
 * unnecessary refetch, never a stale screen. Scoping it would mean joining
 * the scope tables on every poll, which is the cost this endpoint exists to
 * avoid.
 */
syncRouter.get("/digest", async (req, res) => {
  try {
    const tenantId = req.tenantId!;

    const [tasks, shots, assets] = await Promise.all([
      prisma.task.aggregate({
        where: { tenantId },
        _count: { _all: true },
        _max: { lastStatusUpdate: true },
      }),
      prisma.shot.aggregate({
        where: { tenantId },
        _count: { _all: true },
        _max: { updatedAt: true },
      }),
      prisma.asset.aggregate({
        where: { tenantId },
        _count: { _all: true },
        _max: { updatedAt: true },
      }),
    ]);

    // `count:timestamp`. The count catches inserts and deletes, which leave
    // the max untouched when the newest row is not the one that changed; the
    // max catches in-place edits, which leave the count untouched. Neither
    // alone is sufficient.
    const token = (count: number, at: Date | null) =>
      `${count}:${at ? at.getTime() : 0}`;

    return res.json({
      tasks: token(tasks._count._all, tasks._max.lastStatusUpdate),
      shots: token(shots._count._all, shots._max.updatedAt),
      assets: token(assets._count._all, assets._max.updatedAt),
    });
  } catch (err) {
    req.log.error(err, "Failed to compute sync digest");
    return res.status(500).json({ error: "Internal server error" });
  }
});
