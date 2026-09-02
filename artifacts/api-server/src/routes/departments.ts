import { Router } from "express";
import { db, departmentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";
import * as crypto from "crypto";

const router = Router();

router.use(tenantAuthMiddleware);

const VALID_PIPELINES = ["PROD", "3D", "VFX", "2D"];

router.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const departments = await db
      .select()
      .from(departmentsTable)
      .where(eq(departmentsTable.tenantId, tenantId));
    return res.json(departments);
  } catch (err) {
    req.log.error(err, "Failed to fetch departments");
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

    const [existing] = await db
      .select({ id: departmentsTable.id })
      .from(departmentsTable)
      .where(and(eq(departmentsTable.tenantId, tenantId), eq(departmentsTable.abbr, abbr)));
    if (existing)
      return res.status(409).json({ error: "A department with this abbreviation already exists" });

    const [created] = await db
      .insert(departmentsTable)
      .values({
        id: crypto.randomUUID(),
        tenantId,
        name,
        abbr,
        pipeline,
        pipelineOrder: pipelineOrder ?? 0,
        color: color || null,
        icon: icon || null,
      })
      .returning();
    return res.status(201).json(created);
  } catch (err) {
    req.log.error(err, "Failed to create department");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
