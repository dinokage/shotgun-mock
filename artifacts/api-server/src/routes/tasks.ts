import { Router } from "express";
import { db } from "@workspace/db";
import {
  tasksTable,
  usersTable,
  tenantRolesTable,
  tenantRoleCapabilitiesTable,
  taskChecklistItemsTable,
  taskDependenciesTable,
  taskCommentsTable,
  taskAttachmentsTable,
  taskApprovalEventsTable,
  departmentsTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
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
  const [row] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.tenantId, tenantId)));
  return !!row;
}

// Leadership roles (admin/production_head/producer/lead) assign work,
// they never hold it — enforced server-side per this phase's spec,
// not just hidden in the UI, since a client that skips the frontend
// could otherwise assign a task to a producer directly via the API.
async function assignedToIsArtist(id: string, tenantId: string) {
  const [row] = await db
    .select({ roleName: tenantRolesTable.name })
    .from(usersTable)
    .innerJoin(tenantRolesTable, eq(usersTable.roleId, tenantRolesTable.id))
    .where(and(eq(usersTable.id, id), eq(usersTable.tenantId, tenantId)));
  return row?.roleName === "artist";
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
  const [row] = await db
    .select({ id: tasksTable.id })
    .from(tasksTable)
    .where(and(eq(tasksTable.id, id), eq(tasksTable.tenantId, tenantId)));
  return !!row;
}

// The approval-events table is an append-only audit trail (see the schema
// comment in tasks-detail.ts) — its whole purpose is to record who approved
// what and in what capacity. Accepting `byRole` from the request body would
// let any caller write a false audit record (e.g. claim they acted as
// "lead" while actually an "artist"), so the role is always looked up
// server-side from the caller's own session (req.roleId), never trusted
// from the client.
async function roleNameForCaller(roleId: string, tenantId: string) {
  const [row] = await db
    .select({ name: tenantRolesTable.name })
    .from(tenantRolesTable)
    .where(and(eq(tenantRolesTable.id, roleId), eq(tenantRolesTable.tenantId, tenantId)));
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
    const tasksList = await db
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.tenantId, tenantId));
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

    const newId = crypto.randomUUID();
    await db.insert(tasksTable).values({
      id: newId,
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
    });

    const [created] = await db
      .select()
      .from(tasksTable)
      .where(and(eq(tasksTable.tenantId, tenantId), eq(tasksTable.id, newId)));
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

    const [existing] = await db
      .select()
      .from(tasksTable)
      .where(and(eq(tasksTable.tenantId, tenantId), eq(tasksTable.id, taskId)));

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
      const [grant] = await db
        .select()
        .from(tenantRoleCapabilitiesTable)
        .where(
          and(
            eq(tenantRoleCapabilitiesTable.roleId, req.roleId!),
            eq(tenantRoleCapabilitiesTable.capabilityId, requiredCapability),
          ),
        );
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

    await db
      .update(tasksTable)
      .set(updates)
      .where(and(eq(tasksTable.tenantId, tenantId), eq(tasksTable.id, taskId)));

    const [updated] = await db
      .select()
      .from(tasksTable)
      .where(and(eq(tasksTable.tenantId, tenantId), eq(tasksTable.id, taskId)));
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
    const rows = await db
      .select()
      .from(taskChecklistItemsTable)
      .where(
        and(
          eq(taskChecklistItemsTable.tenantId, tenantId),
          eq(taskChecklistItemsTable.taskId, req.params.id),
        ),
      );
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
    const newId = crypto.randomUUID();
    await db.insert(taskChecklistItemsTable).values({
      id: newId,
      tenantId,
      taskId,
      text,
      position: position ?? 0,
    });
    const [created] = await db
      .select()
      .from(taskChecklistItemsTable)
      .where(and(eq(taskChecklistItemsTable.tenantId, tenantId), eq(taskChecklistItemsTable.id, newId)));
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
    const [existing] = await db
      .select()
      .from(taskChecklistItemsTable)
      .where(
        and(
          eq(taskChecklistItemsTable.tenantId, tenantId),
          eq(taskChecklistItemsTable.id, itemId),
        ),
      );
    if (!existing) return res.status(404).json({ error: "Not found" });
    const updates: Record<string, unknown> = {};
    if (typeof done === "boolean") updates.done = done;
    if (typeof text === "string") updates.text = text;
    await db
      .update(taskChecklistItemsTable)
      .set(updates)
      .where(
        and(
          eq(taskChecklistItemsTable.tenantId, tenantId),
          eq(taskChecklistItemsTable.id, itemId),
        ),
      );
    const [updated] = await db
      .select()
      .from(taskChecklistItemsTable)
      .where(
        and(
          eq(taskChecklistItemsTable.tenantId, tenantId),
          eq(taskChecklistItemsTable.id, itemId),
        ),
      );
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

tasksRouter.get("/:id/comments", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const rows = await db
      .select()
      .from(taskCommentsTable)
      .where(
        and(eq(taskCommentsTable.tenantId, tenantId), eq(taskCommentsTable.taskId, req.params.id)),
      );
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
    const newId = crypto.randomUUID();
    await db.insert(taskCommentsTable).values({
      id: newId,
      tenantId,
      taskId,
      userId,
      text,
    });
    const [created] = await db
      .select()
      .from(taskCommentsTable)
      .where(and(eq(taskCommentsTable.tenantId, tenantId), eq(taskCommentsTable.id, newId)));
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

tasksRouter.get("/:id/dependencies", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const rows = await db
      .select()
      .from(taskDependenciesTable)
      .where(
        and(
          eq(taskDependenciesTable.tenantId, tenantId),
          eq(taskDependenciesTable.taskId, req.params.id),
        ),
      );
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
    const newId = crypto.randomUUID();
    await db.insert(taskDependenciesTable).values({
      id: newId,
      tenantId,
      taskId,
      dependsOnTaskId,
      type: type || "FS",
      lagDays: lagDays ?? null,
    });
    const [created] = await db
      .select()
      .from(taskDependenciesTable)
      .where(and(eq(taskDependenciesTable.tenantId, tenantId), eq(taskDependenciesTable.id, newId)));
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

tasksRouter.get("/:id/attachments", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const rows = await db
      .select()
      .from(taskAttachmentsTable)
      .where(
        and(
          eq(taskAttachmentsTable.tenantId, tenantId),
          eq(taskAttachmentsTable.taskId, req.params.id),
        ),
      );
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
    const newId = crypto.randomUUID();
    await db.insert(taskAttachmentsTable).values({
      id: newId,
      tenantId,
      taskId,
      url,
      uploadedById: userId,
    });
    const [created] = await db
      .select()
      .from(taskAttachmentsTable)
      .where(and(eq(taskAttachmentsTable.tenantId, tenantId), eq(taskAttachmentsTable.id, newId)));
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

tasksRouter.get("/:id/approval-events", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const rows = await db
      .select()
      .from(taskApprovalEventsTable)
      .where(
        and(
          eq(taskApprovalEventsTable.tenantId, tenantId),
          eq(taskApprovalEventsTable.taskId, req.params.id),
        ),
      );
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
    if (!(await taskInTenant(req.params.id, tenantId)))
      return res.status(404).json({ error: "Not found" });
    const byRole = await roleNameForCaller(roleId, tenantId);
    if (!byRole) return res.status(400).json({ error: "Invalid role" });
    const newId = crypto.randomUUID();
    await db.insert(taskApprovalEventsTable).values({
      id: newId,
      tenantId,
      taskId: req.params.id,
      action,
      byUserId: userId,
      byRole,
    });
    const [created] = await db
      .select()
      .from(taskApprovalEventsTable)
      .where(and(eq(taskApprovalEventsTable.tenantId, tenantId), eq(taskApprovalEventsTable.id, newId)));

    // Fire-and-forget: a notification failure should never fail the approval
    // action itself. Each stage notifies whoever needs to act next (or, for
    // the final publish/reject actions, the artist whose work it concerns).
    (async () => {
      try {
        const [task] = await db
          .select()
          .from(tasksTable)
          .where(and(eq(tasksTable.tenantId, tenantId), eq(tasksTable.id, req.params.id)));
        if (!task) return;
        const [actor] = await db
          .select({ name: usersTable.name })
          .from(usersTable)
          .where(eq(usersTable.id, userId));
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
          const leads = await db
            .select({ id: usersTable.id })
            .from(usersTable)
            .innerJoin(tenantRolesTable, eq(usersTable.roleId, tenantRolesTable.id))
            .innerJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
            .where(
              and(
                eq(usersTable.tenantId, tenantId),
                eq(departmentsTable.name, task.department || ""),
              ),
            );
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
