import { Router } from "express";
import { prisma } from "@workspace/db";
import * as crypto from "crypto";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";

export const projectsRouter = Router();

projectsRouter.use(tenantAuthMiddleware);

projectsRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const projects = await prisma.project.findMany({ where: { tenantId } });
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
    const project = await prisma.project.findFirst({
      where: { tenantId, id: req.params.id },
    });
    if (!project) return res.status(404).json({ error: "Not found" });
    return res.json(project);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Unguarded until now — any authenticated tenant session, including a
// client-access-link session (a real "client" tenant role whose only grant
// is approve_reviews), could create or rewrite any project in the tenant.
// manage_pipeline matches the capability the frontend's own "New Project"
// affordance is gated on (producer/production_head).
projectsRouter.post("/", requireCapability("manage_pipeline"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { name, code, type, client, status, startDate, endDate } = req.body;

    if (!name) return res.status(400).json({ error: "Missing name" });

    const created = await prisma.project.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        name,
        code: code || null,
        type: type || null,
        client: client || null,
        status: status || "active",
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
      },
    });
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

projectsRouter.put("/:id", requireCapability("manage_pipeline"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const projectId = req.params.id as string;

    const existing = await prisma.project.findFirst({
      where: { tenantId, id: projectId },
    });
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

    await prisma.project.updateMany({
      where: { tenantId, id: projectId },
      data: updates,
    });

    const updated = await prisma.project.findFirstOrThrow({
      where: { tenantId, id: projectId },
    });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
