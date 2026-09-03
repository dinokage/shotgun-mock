import { Router } from "express";
import { db } from "@workspace/db";
import { projectsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import * as crypto from "crypto";
import { tenantAuthMiddleware } from "../middleware/tenant";

export const projectsRouter = Router();

projectsRouter.use(tenantAuthMiddleware);

projectsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const projects = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.tenantId, tenantId));
    return res.json(projects);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Was missing entirely -- ProjectDetail (pages/project-detail/index.tsx)
// calls GET /projects/:id via useProject() and had no route to hit,
// always rendering "Project not found." for every real project.
projectsRouter.get("/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(
        and(
          eq(projectsTable.tenantId, tenantId),
          eq(projectsTable.id, req.params.id),
        ),
      );
    if (!project) return res.status(404).json({ error: "Not found" });
    return res.json(project);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

projectsRouter.post("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { name, code, type, client, status, startDate, endDate } = req.body;

    if (!name) return res.status(400).json({ error: "Missing name" });

    const newId = crypto.randomUUID();
    await db.insert(projectsTable).values({
      id: newId,
      tenantId,
      name,
      code: code || null,
      type: type || null,
      client: client || null,
      status: status || "active",
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    });

    const [created] = await db
      .select()
      .from(projectsTable)
      .where(
        and(eq(projectsTable.tenantId, tenantId), eq(projectsTable.id, newId)),
      );
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

const PROJECT_PATCHABLE_FIELDS = [
  "name",
  "code",
  "type",
  "client",
  "status",
  "startDate",
  "endDate",
] as const;

projectsRouter.put("/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const projectId = req.params.id;

    const [existing] = await db
      .select()
      .from(projectsTable)
      .where(
        and(eq(projectsTable.tenantId, tenantId), eq(projectsTable.id, projectId)),
      );
    if (!existing) return res.status(404).json({ error: "Not found" });

    const updates: Record<string, unknown> = {};
    for (const field of PROJECT_PATCHABLE_FIELDS) {
      if (!(field in req.body)) continue;
      if (field === "startDate" || field === "endDate") {
        updates[field] = req.body[field] ? new Date(req.body[field]) : null;
      } else {
        updates[field] = req.body[field];
      }
    }

    await db
      .update(projectsTable)
      .set(updates)
      .where(
        and(eq(projectsTable.tenantId, tenantId), eq(projectsTable.id, projectId)),
      );

    const [updated] = await db
      .select()
      .from(projectsTable)
      .where(
        and(eq(projectsTable.tenantId, tenantId), eq(projectsTable.id, projectId)),
      );
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
