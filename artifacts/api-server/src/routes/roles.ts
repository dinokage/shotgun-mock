import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";

const router = Router();

router.use(tenantAuthMiddleware);

// Mirrors CAPABILITY_IDS in artifacts/forge/src/store/permissions.ts -- the
// server's own source of truth for which ids are real, so PUT below can
// reject a typo or a stale id instead of silently writing a capability
// nothing in the app ever checks.
const VALID_CAPABILITY_IDS = new Set([
  "create_tasks",
  "edit_tasks",
  "delete_tasks",
  "assign_tasks",
  "submit_reviews",
  "approve_reviews",
  "manage_members",
  "manage_roles",
  "view_financials",
  "edit_financials",
  "manage_pipeline",
  "manage_licenses",
  "manage_integrations",
  "broadcast_updates",
]);

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

/**
 * PUT /api/roles/:id/capabilities
 *
 * Replaces a role's full capability set. Settings > Roles & Permissions has
 * shown this matrix as read-only ("fixed for this release") because nothing
 * backed it -- this is that missing write path, so the page can eventually
 * stop saying that.
 *
 * Gated on manage_roles rather than manage_members: granting or revoking
 * what a role may DO is a distinct, more sensitive action than managing
 * which people hold which role.
 */
router.put(
  "/:id/capabilities",
  requireCapability("manage_roles"),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      // Cast needed: requireCapability() + this route's "/:id" path typing
      // widens req.params.id to `string | string[]` for overload resolution,
      // even though a plain ":id" segment is always a single string.
      const roleId = req.params.id as string;
      const { capabilityIds } = req.body;

      if (!Array.isArray(capabilityIds)) {
        return res.status(400).json({ error: "capabilityIds must be an array" });
      }
      const ids = [...new Set(capabilityIds)];
      const invalid = ids.filter((id) => !VALID_CAPABILITY_IDS.has(id));
      if (invalid.length > 0) {
        return res.status(400).json({ error: `Unknown capability id(s): ${invalid.join(", ")}` });
      }

      const role = await prisma.tenantRole.findFirst({ where: { id: roleId, tenantId } });
      if (!role) return res.status(404).json({ error: "Not found" });

      // The same lockout this app already refuses elsewhere (removing the
      // last active admin) applies here one level up: revoking manage_roles
      // from the last role that holds it would mean nobody -- not even
      // another administrator -- could ever grant it back through the app.
      if (!ids.includes("manage_roles")) {
        const existing = await prisma.tenantRoleCapability.findFirst({
          where: { roleId, capabilityId: "manage_roles" },
        });
        if (existing) {
          const otherRolesWithGrant = await prisma.tenantRoleCapability.count({
            where: {
              capabilityId: "manage_roles",
              role: { tenantId, id: { not: roleId } },
            },
          });
          if (otherRolesWithGrant === 0) {
            return res.status(409).json({
              error:
                "This is the only role that can manage roles and permissions. Grant it to another role first.",
            });
          }
        }
      }

      await prisma.$transaction([
        prisma.tenantRoleCapability.deleteMany({ where: { roleId } }),
        prisma.tenantRoleCapability.createMany({
          data: ids.map((capabilityId) => ({ roleId, capabilityId })),
        }),
      ]);

      return res.json({ id: roleId, name: role.name, capabilities: ids });
    } catch (err) {
      req.log.error(err, "Failed to update role capabilities");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
