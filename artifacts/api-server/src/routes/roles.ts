import { Router } from "express";
import { prisma } from "@workspace/db";
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
// Each role also carries its real capability grants, because Settings > Roles
// used to render a hardcoded scheme that had no connection to
// tenant_role_capabilities -- so the matrix an admin read could disagree with
// what the server actually enforced, which is worse than showing nothing.
router.get("/", requireCapability("manage_members"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const roles = await prisma.tenantRole.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        tenantRoleCapabilities: { select: { capabilityId: true } },
      },
    });
    return res.json(
      roles.map((role) => ({
        id: role.id,
        name: role.name,
        capabilities: role.tenantRoleCapabilities.map((c) => c.capabilityId),
      })),
    );
  } catch (err) {
    req.log.error(err, "Failed to fetch roles");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
