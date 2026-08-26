import { Router } from "express";
import { db, departmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { tenantAuthMiddleware } from "../middleware/tenant";

const router = Router();

router.use(tenantAuthMiddleware);

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

export default router;
