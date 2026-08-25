import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const users = await db.select().from(usersTable);
    res.json(users);
  } catch (err) {
    req.log.error(err, "Failed to fetch users");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const [newUser] = await db.insert(usersTable).values(req.body).returning();
    res.status(201).json(newUser);
  } catch (err) {
    req.log.error(err, "Failed to create user");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
