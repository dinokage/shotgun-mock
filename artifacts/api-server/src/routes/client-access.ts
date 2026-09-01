import { Router } from "express";
import { db } from "@workspace/db";
import { clientAccessLinksTable, tenantRolesTable } from "@workspace/db/schema";
import { eq, and, isNull, or, gt } from "drizzle-orm";
import { signSession } from "../lib/auth";

export const clientAccessRouter = Router();

clientAccessRouter.post("/redeem", async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== "string")
      return res.status(400).json({ error: "Missing code" });

    const [link] = await db
      .select()
      .from(clientAccessLinksTable)
      .where(
        and(
          eq(clientAccessLinksTable.code, code),
          isNull(clientAccessLinksTable.revokedAt),
          or(
            isNull(clientAccessLinksTable.expiresAt),
            gt(clientAccessLinksTable.expiresAt, new Date()),
          ),
        ),
      );
    if (!link) return res.status(401).json({ error: "Invalid or expired code" });

    // Every tenant is seeded with a system-default "client" role (Task 6's
    // sibling task in the admin-bootstrap plan ensures this — for now,
    // fall back to a 401 if a tenant somehow has none, rather than
    // fabricating a roleId that doesn't exist and would break every
    // downstream tenantRoleCapabilities lookup).
    const [clientRole] = await db
      .select({ id: tenantRolesTable.id })
      .from(tenantRolesTable)
      .where(
        and(
          eq(tenantRolesTable.tenantId, link.tenantId),
          eq(tenantRolesTable.name, "client"),
        ),
      );
    if (!clientRole)
      return res.status(500).json({ error: "Tenant has no client role configured" });

    const token = signSession({
      userId: null,
      tenantId: link.tenantId,
      roleId: clientRole.id,
      departmentId: null,
      clientAccessLinkId: link.id,
    });

    // Cookie options copied verbatim from routes/auth.ts's login handler so
    // this session cookie is parsed consistently with the rest of the app.
    res.cookie("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return res.json({
      scope: {
        projectId: link.projectId,
        episodeId: link.episodeId,
        versionId: link.versionId,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});
