import { Router } from "express";
import { db, tenantRolesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";

const router = Router();

router.use(tenantAuthMiddleware);

// Lists the caller's tenant roles as {id, name} pairs. Gated the same as
// POST/PATCH /users (manage_members) since this exists specifically to
// populate the Admin Panel's "create user" role picker with real
// tenant_roles.id values — POST /users validates roleId against this same
// table, so the client needs a way to look up the id behind each role name
// rather than guessing at it.
router.get("/", requireCapability("manage_members"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const roles = await db
      .select({ id: tenantRolesTable.id, name: tenantRolesTable.name })
      .from(tenantRolesTable)
      .where(eq(tenantRolesTable.tenantId, tenantId));
    return res.json(roles);
  } catch (err) {
    req.log.error(err, "Failed to fetch roles");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
