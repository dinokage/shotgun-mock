import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability, denyClientAccess } from "../middleware/rbac";
import * as crypto from "crypto";

const router = Router();

router.use(tenantAuthMiddleware);
// Internal org structure has no client-facing equivalent.
router.use(denyClientAccess);

const VALID_PIPELINES = ["PROD", "3D", "VFX", "2D"];

router.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const departments = await prisma.department.findMany({
      where: { tenantId },
    });
    return res.json(departments);
  } catch (err) {
    req.log.error(err, "Failed to fetch departments");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// The "Pipeline Flow" strip on the Departments page reorders the studio's
// pipeline. Ordering is studio-wide, not per-viewer, so it writes the real
// Department.pipelineOrder column rather than living in the author's browser.
// Position 0 is reserved for departments that sit outside the pipeline
// (Production Management), so the sent list starts at 1 and any department
// left out of it keeps whatever order it already had.
router.put("/order", requireCapability("manage_pipeline"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { departmentIds } = req.body ?? {};

    if (!Array.isArray(departmentIds) || departmentIds.length === 0)
      return res.status(400).json({ error: "departmentIds must be a non-empty array" });
    if (departmentIds.some((id) => typeof id !== "string" || !id))
      return res.status(400).json({ error: "departmentIds must contain only department ids" });
    if (new Set(departmentIds).size !== departmentIds.length)
      return res.status(400).json({ error: "departmentIds must not contain duplicates" });

    const owned = await prisma.department.findMany({
      where: { tenantId, id: { in: departmentIds as string[] } },
      select: { id: true },
    });
    if (owned.length !== departmentIds.length)
      return res.status(400).json({ error: "One or more departments do not exist in this studio" });

    await prisma.$transaction(
      (departmentIds as string[]).map((id, index) =>
        prisma.department.update({
          where: { id },
          data: { pipelineOrder: index + 1 },
        }),
      ),
    );

    const departments = await prisma.department.findMany({ where: { tenantId } });
    return res.json(departments);
  } catch (err) {
    req.log.error(err, "Failed to reorder departments");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// No department-creation route existed anywhere in this app until now --
// after a full data reset there was genuinely no way for an admin to create
// one, only view the (empty) list, blocking department assignment entirely.
router.post("/", requireCapability("manage_members"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { name, abbr, pipeline, pipelineOrder, color, icon } = req.body;
    if (!name || !abbr || !pipeline)
      return res.status(400).json({ error: "name, abbr, and pipeline are required" });
    if (!VALID_PIPELINES.includes(pipeline))
      return res.status(400).json({
        error: `pipeline must be one of: ${VALID_PIPELINES.join(", ")}`,
      });

    const existing = await prisma.department.findFirst({
      where: { tenantId, abbr },
      select: { id: true },
    });
    if (existing)
      return res.status(409).json({ error: "A department with this abbreviation already exists" });

    const created = await prisma.department.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        name,
        abbr,
        pipeline,
        pipelineOrder: pipelineOrder ?? 0,
        color: color || null,
        icon: icon || null,
      },
    });
    return res.status(201).json(created);
  } catch (err) {
    req.log.error(err, "Failed to create department");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
