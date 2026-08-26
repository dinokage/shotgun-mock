import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { hashPassword } from "../lib/auth";
import * as crypto from "crypto";

const router = Router();

router.use(tenantAuthMiddleware);

router.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const users = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.tenantId, tenantId));
    res.json(
      users.map(({ hashedPassword, ...user }) => user),
    );
  } catch (err) {
    req.log.error(err, "Failed to fetch users");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { email, name, password, roleId, title } = req.body;

    if (!email || !name || !password || !roleId) {
      return res
        .status(400)
        .json({ error: "Missing email, name, password, or roleId" });
    }

    const hashedPassword = await hashPassword(password);
    const [newUser] = await db
      .insert(usersTable)
      .values({
        id: crypto.randomUUID(),
        tenantId,
        roleId,
        email,
        name,
        title,
        hashedPassword,
      })
      .returning();

    const { hashedPassword: _omit, ...user } = newUser;
    return res.status(201).json(user);
  } catch (err) {
    req.log.error(err, "Failed to create user");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
