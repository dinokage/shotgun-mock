import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability } from "../middleware/rbac";
import * as crypto from "crypto";
import { createNotification, findProductionManagers } from "./notifications";
import { cacheGet, cacheSet, cacheDel, cacheKeys } from "../lib/cache";
import { maybeReassignOnSequenceCompletion } from "../lib/sequenceReassignment";

// A DB foreign key only verifies a referenced row exists, not who owns it,
// so every foreign key accepted from a request body needs an explicit
// tenant-ownership check before use (same pattern already applied in
// routes/shots.ts, routes/versions.ts, routes/reviews.ts).
async function userInTenant(id: string, tenantId: string) {
  const row = await prisma.user.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}

// Leadership roles (admin/production_head/producer/lead) assign work,
// they never hold it — enforced server-side per this phase's spec,
// not just hidden in the UI, since a client that skips the frontend
// could otherwise assign a task to a producer directly via the API.
async function assignedToIsArtist(id: string, tenantId: string) {
  const row = await prisma.user.findFirst({
    where: { id, tenantId },
    select: { role: { select: { name: true } } },
  });
  return row?.role?.name === "artist";
}

// Used by every nested /:id/* sub-resource route below to confirm the
// parent task (req.params.id) belongs to the caller's tenant BEFORE
// inserting a checklist item/comment/dependency/attachment/approval-event
// against it — otherwise a user could write sub-resources onto another
// tenant's task just by knowing its id, even though the sub-resource row
// itself carries the caller's own tenantId (an IDOR-adjacent referential
// integrity gap, same root cause as the FK-ownership issue elsewhere in
// this plan).
async function taskInTenant(id: string, tenantId: string) {
  const row = await prisma.task.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}

// The review workflow's stage gates (submit -> lead-review -> pm-review ->
// approved) were, until now, enforced only in review.tsx's UI (canApproveAsLead
// /canApproveAsPM booleans that hide/show the action buttons) -- nothing
// stopped a client that skipped the frontend from PUTting status directly to
// "approved" via the API. These two helpers port review.tsx's/taskShape.ts's
// exact same checks server-side so the two gated transitions (advancing to
// "pm-review" and to "approved") can't be reached without holding the real
// authority the UI implies. Ordinary status values (in-progress, done, the
// free-text tracksheet-imported statuses, etc.) are untouched -- only these
// two specific target statuses represent a genuine trust escalation.
const DEPARTMENT_LEADERSHIP_ROLE_NAMES = ["lead", "producer"];

async function canApproveAsDeptLead(
  tenantId: string,
  actorUserId: string,
  actorRoleId: string,
  taskDepartmentName: string | null,
): Promise<boolean> {
  const grant = await prisma.tenantRoleCapability.findFirst({
    where: { roleId: actorRoleId, capabilityId: "approve_reviews" },
  });
  if (!grant) return false;

  const actorRole = await prisma.tenantRole.findFirst({
    where: { id: actorRoleId, tenantId },
    select: { name: true },
  });
  if (!actorRole || !DEPARTMENT_LEADERSHIP_ROLE_NAMES.includes(actorRole.name)) return false;
  if (!taskDepartmentName) return false;

  const actor = await prisma.user.findFirst({ where: { id: actorUserId, tenantId }, select: { departmentId: true } });
  const dept = await prisma.department.findFirst({ where: { tenantId, name: taskDepartmentName }, select: { id: true } });
  return !!actor?.departmentId && !!dept?.id && actor.departmentId === dept.id;
}

async function canApproveAsProdManager(
  tenantId: string,
  actorUserId: string,
  actorRoleId: string,
  taskDepartmentName: string | null,
): Promise<boolean> {
  const actorRole = await prisma.tenantRole.findFirst({ where: { id: actorRoleId, tenantId }, select: { name: true } });
  if (!actorRole || actorRole.name !== "production_head") return false;

  const productionHeads = await prisma.user.findMany({
    where: { tenantId, role: { name: "production_head" } },
    select: { id: true, departmentId: true },
  });
  if (productionHeads.length === 0) return false;

  let dept: { id: string } | null = null;
  if (taskDepartmentName) {
    dept = await prisma.department.findFirst({ where: { tenantId, name: taskDepartmentName }, select: { id: true } });
  }
  const ownDeptPMs = dept ? productionHeads.filter((u) => u.departmentId === dept!.id) : [];
  if (ownDeptPMs.length > 0) return ownDeptPMs.some((u) => u.id === actorUserId);

  const mainDept = await prisma.department.findFirst({ where: { tenantId, name: "Production Management" }, select: { id: true } });
  const mainPMs = mainDept ? productionHeads.filter((u) => u.departmentId === mainDept.id) : [];
  if (mainPMs.length > 0) return mainPMs.some((u) => u.id === actorUserId);

  return productionHeads.some((u) => u.id === actorUserId);
}

// The approval-events table is an append-only audit trail (see the schema
// comment in tasks-detail.ts) — its whole purpose is to record who approved
// what and in what capacity. Accepting `byRole` from the request body would
// let any caller write a false audit record (e.g. claim they acted as
// "lead" while actually an "artist"), so the role is always looked up
// server-side from the caller's own session (req.roleId), never trusted
// from the client.
async function roleNameForCaller(roleId: string, tenantId: string) {
  const row = await prisma.tenantRole.findFirst({ where: { id: roleId, tenantId }, select: { name: true } });
  return row?.name;
}

const APPROVAL_EVENT_ACTIONS = [
  "submitted-for-lead-review",
  "submitted-for-manager-review",
  "approved",
  "changes-requested",
  "rejected",
  "published",
] as const;

export const tasksRouter = Router();

tasksRouter.use(tenantAuthMiddleware);

tasksRouter.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    // Every role reads this same unfiltered per-tenant list (RBAC visibility
    // is applied client-side -- see this route's original comment history);
    // an artist's task page, a lead's Team Board, a PM's oversight view, and
    // the admin's monitoring view all hit this endpoint. Short TTL cache cuts
    // DB load from that shared traffic; every write path below that touches
    // a task's row calls cacheDel so a status change or reassignment is
    // visible immediately rather than waiting out the TTL.
    const cacheKey = cacheKeys.tasksList(tenantId);
    const cached = await cacheGet<unknown[]>(cacheKey);
    if (cached) return res.json(cached);

    // Note: In real logic, projectId filtering would join with entity (asset/shot).
    const tasksList = await prisma.task.findMany({ where: { tenantId } });
    await cacheSet(cacheKey, tasksList, 10);
    return res.json(tasksList);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

tasksRouter.post("/", requireCapability("create_tasks"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const {
      entityId,
      entityType,
      status,
      title,
      description,
      priority,
      department,
      pipelinePhase,
      startDate,
      dueDate,
      estimatedHours,
      assignedTo,
    } = req.body;

    if (!entityId || !entityType)
      return res.status(400).json({ error: "Missing entityId or entityType" });

    if (assignedTo && !(await userInTenant(assignedTo, tenantId)))
      return res.status(400).json({ error: "Invalid assignedTo" });

    if (assignedTo && !(await assignedToIsArtist(assignedTo, tenantId)))
      return res.status(400).json({ error: "assignedTo must be an artist" });

    const created = await prisma.task.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        entityId,
        entityType,
        // "ready" (the DB column's own default) isn't a value the frontend's
        // TaskStatus type recognizes at all, so a task created without an
        // explicit status used to be invisible in every dashboard/kanban/status
        // filter — it existed, but no status bucket ever matched it.
        status: status || "not-started",
        title: title || "",
        description: description || "",
        priority: priority || "medium",
        department: department || null,
        pipelinePhase: pipelinePhase || null,
        startDate: startDate ? new Date(startDate) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        estimatedHours: estimatedHours || 0,
        assignedTo: assignedTo || null,
      },
    });
    await cacheDel(cacheKeys.tasksList(tenantId));
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

const TASK_PATCHABLE_FIELDS = [
  "status",
  "title",
  "description",
  "priority",
  "department",
  "pipelinePhase",
  "weeklyRating",
  "tags",
  "estimatedHours",
  "actualHours",
  "assignedTo",
  "startDate",
  "dueDate",
] as const;

tasksRouter.put("/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const taskId = req.params.id;

    const existing = await prisma.task.findFirst({ where: { tenantId, id: taskId } });
    if (!existing) return res.status(404).json({ error: "Not found" });

    // Artists have `edit_tasks` but not `assign_tasks` — the one exception is
    // claiming a currently-unassigned task for themselves ("take tasks on
    // their own"), which needs neither capability. Any other assignedTo
    // change (including reassigning someone else, or re-claiming an already
    // -assigned task) still requires assign_tasks; any other field change
    // still requires edit_tasks.
    const bodyKeys = Object.keys(req.body);
    const onlyClaimingSelf =
      bodyKeys.length === 1 &&
      bodyKeys[0] === "assignedTo" &&
      existing.assignedTo === null &&
      req.body.assignedTo === req.userId;

    if (!onlyClaimingSelf) {
      const requiredCapability =
        "assignedTo" in req.body ? "assign_tasks" : "edit_tasks";
      const grant = await prisma.tenantRoleCapability.findFirst({
        where: { roleId: req.roleId!, capabilityId: requiredCapability },
      });
      if (!grant)
        return res.status(403).json({ error: "Forbidden: Missing capability" });
    }

    if (
      "assignedTo" in req.body &&
      req.body.assignedTo &&
      !(await userInTenant(req.body.assignedTo, tenantId))
    )
      return res.status(400).json({ error: "Invalid assignedTo" });

    if (
      "assignedTo" in req.body &&
      req.body.assignedTo &&
      !(await assignedToIsArtist(req.body.assignedTo, tenantId))
    )
      return res.status(400).json({ error: "assignedTo must be an artist" });

    const updates: Record<string, unknown> = {};
    for (const field of TASK_PATCHABLE_FIELDS) {
      if (!(field in req.body)) continue;
      if (field === "startDate" || field === "dueDate") {
        updates[field] = req.body[field] ? new Date(req.body[field]) : null;
      } else {
        updates[field] = req.body[field];
      }
    }
    updates.lastStatusUpdate = new Date();

    if (updates.status === "pm-review") {
      if (!(await canApproveAsDeptLead(tenantId, req.userId!, req.roleId!, existing.department)))
        return res.status(403).json({
          error:
            "Forbidden: only the assigned department's Lead/Producer can advance this task to Production Manager review",
        });
    } else if (updates.status === "approved") {
      if (!(await canApproveAsProdManager(tenantId, req.userId!, req.roleId!, existing.department)))
        return res.status(403).json({
          error: "Forbidden: only the eligible Production Manager can approve this task",
        });
    }

    await prisma.task.updateMany({ where: { tenantId, id: taskId }, data: updates });
    const updated = await prisma.task.findFirstOrThrow({ where: { tenantId, id: taskId } });
    await cacheDel(cacheKeys.tasksList(tenantId));

    // Fire-and-forget: a task reaching "approved" is the one authoritative
    // moment to check whether its whole sequence just wrapped early. Hooked
    // here (not the approval-events route) because review.tsx's
    // submitApproval() fires the status PUT and the approval-event POST as
    // two independent, unordered mutations -- this status write is the one
    // that actually commits "approved", so it's the only reliable trigger.
    if (updates.status === "approved") {
      maybeReassignOnSequenceCompletion(taskId, tenantId).catch((err) =>
        req.log.error(err, "Sequence auto-reassignment check failed"),
      );
    }
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

tasksRouter.get("/:id/checklist", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const rows = await prisma.taskChecklistItem.findMany({
      where: { tenantId, taskId: req.params.id },
    });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

tasksRouter.post("/:id/checklist", requireCapability("edit_tasks"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    // Cast needed: requireCapability() + this route's "/:id" typing widens
    // req.params.id to `string | string[]` for overload resolution, even
    // though a plain ":id" segment is always a single string at runtime.
    const taskId = req.params.id as string;
    const { text, position } = req.body;
    if (!text) return res.status(400).json({ error: "Missing text" });
    if (!(await taskInTenant(taskId, tenantId)))
      return res.status(404).json({ error: "Not found" });
    const created = await prisma.taskChecklistItem.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        taskId,
        text,
        position: position ?? 0,
      },
    });
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

tasksRouter.put("/:id/checklist/:itemId", requireCapability("edit_tasks"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    // Cast needed: requireCapability() + this route's ":itemId" typing
    // widens req.params.itemId to `string | string[]` for overload
    // resolution, even though a plain path segment is always one string.
    const itemId = req.params.itemId as string;
    const { done, text } = req.body;
    const existing = await prisma.taskChecklistItem.findFirst({
      where: { tenantId, id: itemId },
    });
    if (!existing) return res.status(404).json({ error: "Not found" });
    const updates: Record<string, unknown> = {};
    if (typeof done === "boolean") updates.done = done;
    if (typeof text === "string") updates.text = text;
    await prisma.taskChecklistItem.updateMany({
      where: { tenantId, id: itemId },
      data: updates,
    });
    const updated = await prisma.taskChecklistItem.findFirstOrThrow({
      where: { tenantId, id: itemId },
    });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

tasksRouter.get("/:id/comments", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const rows = await prisma.taskComment.findMany({
      where: { tenantId, taskId: req.params.id },
    });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

tasksRouter.post("/:id/comments", requireCapability("edit_tasks"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    // Cast needed: requireCapability() + this route's "/:id" typing widens
    // req.params.id to `string | string[]` for overload resolution.
    const taskId = req.params.id as string;
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Missing text" });
    if (!(await taskInTenant(taskId, tenantId)))
      return res.status(404).json({ error: "Not found" });
    const created = await prisma.taskComment.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        taskId,
        userId,
        text,
      },
    });
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

tasksRouter.get("/:id/dependencies", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const rows = await prisma.taskDependency.findMany({
      where: { tenantId, taskId: req.params.id },
    });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

tasksRouter.post("/:id/dependencies", requireCapability("edit_tasks"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    // Cast needed: requireCapability() + this route's "/:id" typing widens
    // req.params.id to `string | string[]` for overload resolution.
    const taskId = req.params.id as string;
    const { dependsOnTaskId, type, lagDays } = req.body;
    if (!dependsOnTaskId)
      return res.status(400).json({ error: "Missing dependsOnTaskId" });
    if (!(await taskInTenant(taskId, tenantId)))
      return res.status(404).json({ error: "Not found" });
    if (!(await taskInTenant(dependsOnTaskId, tenantId)))
      return res.status(400).json({ error: "Invalid dependsOnTaskId" });
    const created = await prisma.taskDependency.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        taskId,
        dependsOnTaskId,
        type: type || "FS",
        lagDays: lagDays ?? null,
      },
    });
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

tasksRouter.get("/:id/attachments", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const rows = await prisma.taskAttachment.findMany({
      where: { tenantId, taskId: req.params.id },
    });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

tasksRouter.post("/:id/attachments", requireCapability("edit_tasks"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    // Cast needed: requireCapability() + this route's "/:id" typing widens
    // req.params.id to `string | string[]` for overload resolution.
    const taskId = req.params.id as string;
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "Missing url" });
    if (!(await taskInTenant(taskId, tenantId)))
      return res.status(404).json({ error: "Not found" });
    const created = await prisma.taskAttachment.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        taskId,
        url,
        uploadedById: userId,
      },
    });
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

tasksRouter.get("/:id/approval-events", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const rows = await prisma.taskApprovalEvent.findMany({
      where: { tenantId, taskId: req.params.id },
    });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

tasksRouter.post("/:id/approval-events", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.userId!;
    const roleId = req.roleId!;
    const { action } = req.body;
    if (!action || !(APPROVAL_EVENT_ACTIONS as readonly string[]).includes(action))
      return res.status(400).json({ error: "Missing or invalid action" });

    const approvalTask = await prisma.task.findFirst({
      where: { tenantId, id: req.params.id },
      select: { department: true },
    });
    if (!approvalTask) return res.status(404).json({ error: "Not found" });

    // The status-transition gate on PUT /:id is the authoritative check, but
    // this append-only audit log's whole purpose is an honest record of who
    // approved what -- letting anyone write an "approved"/"published"/
    // "submitted-for-manager-review" event they didn't actually have
    // authority for would falsify that record even if the task's real status
    // never moved.
    if (action === "submitted-for-manager-review") {
      if (!(await canApproveAsDeptLead(tenantId, userId, roleId, approvalTask.department)))
        return res.status(403).json({ error: "Forbidden: missing lead-approval authority" });
    } else if (action === "approved" || action === "published") {
      if (!(await canApproveAsProdManager(tenantId, userId, roleId, approvalTask.department)))
        return res.status(403).json({ error: "Forbidden: missing production-manager approval authority" });
    }

    const byRole = await roleNameForCaller(roleId, tenantId);
    if (!byRole) return res.status(400).json({ error: "Invalid role" });

    const created = await prisma.taskApprovalEvent.create({
      data: { id: crypto.randomUUID(), tenantId, taskId: req.params.id, action, byUserId: userId, byRole },
    });

    // Fire-and-forget: a notification failure should never fail the approval
    // action itself. Each stage notifies whoever needs to act next (or, for
    // the final publish/reject actions, the artist whose work it concerns).
    (async () => {
      try {
        const task = await prisma.task.findFirst({ where: { tenantId, id: req.params.id } });
        if (!task) return;
        const actor = await prisma.user.findFirst({ where: { id: userId }, select: { name: true } });
        const actorName = actor?.name || "Someone";

        const notify = (recipientUserId: string, title: string, description: string) =>
          createNotification({
            tenantId,
            recipientUserId,
            category: action === "rejected" || action === "changes-requested" ? "workflow" : "review",
            title,
            description,
            entityType: "task",
            entityId: task.id,
            actionUrl: `/review/${task.id}`,
          });

        if (action === "submitted-for-lead-review") {
          // NOTE (preserved from the Drizzle version): this query filters
          // only by department name, not by role -- it does NOT actually
          // check that the recipient is a lead. That's a pre-existing
          // imprecision in the original code, not something to "fix" here;
          // the migration must reproduce behavior verbatim.
          const leads = await prisma.user.findMany({
            where: { tenantId, department: { name: task.department || "" } },
            select: { id: true },
          });
          for (const l of leads) {
            await notify(
              l.id,
              `"${task.title}" is awaiting your review`,
              `${actorName} submitted "${task.title}" for Lead review.`,
            );
          }
        } else if (action === "submitted-for-manager-review") {
          const pms = await findProductionManagers(tenantId, task.department);
          for (const pm of pms) {
            await notify(
              pm.id,
              `"${task.title}" needs final sign-off`,
              `${actorName} approved "${task.title}" — awaiting Production Manager sign-off.`,
            );
          }
        } else if (
          (action === "published" ||
            action === "rejected" ||
            action === "changes-requested") &&
          task.assignedTo
        ) {
          await notify(
            task.assignedTo,
            action === "published"
              ? `"${task.title}" was approved`
              : `"${task.title}" needs changes`,
            `${actorName} ${action === "published" ? "approved and published" : action === "rejected" ? "rejected" : "requested changes on"} "${task.title}".`,
          );
        }
      } catch (err) {
        req.log.error(err, "Failed to send approval-event notification");
      }
    })();

    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});
