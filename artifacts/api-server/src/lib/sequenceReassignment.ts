import { db } from "@workspace/db";
import {
  shotsTable,
  tasksTable,
  sequenceTeamMembersTable,
  usersTable,
  departmentsTable,
} from "@workspace/db/schema";
import { eq, and, inArray, ne, or, isNull, lt } from "drizzle-orm";
import { createNotification } from "../routes/notifications";
import { cacheDel, cacheKeys } from "./cache";

// Fires whenever a task's status is set to "approved". If that's the LAST
// task tied to any shot in its sequence still needing work, and it lands
// before the latest deadline any of that sequence's tasks carried (i.e.
// genuinely ahead of schedule, not just "done"), every artist on that
// sequence's self-service team (routes/sequences.ts's .../team endpoints)
// gets checked for one bottlenecked task in their OWN department --
// never another department's. Per the explicit design this automation was
// built to: a bottleneck waits for someone in its own department to free
// up; it is never poached by whoever happens to finish first elsewhere.
export async function maybeReassignOnSequenceCompletion(
  taskId: string,
  tenantId: string,
) {
  try {
    const [task] = await db
      .select()
      .from(tasksTable)
      .where(and(eq(tasksTable.id, taskId), eq(tasksTable.tenantId, tenantId)));
    if (!task || task.entityType !== "shot") return;

    const [shot] = await db
      .select({ sequenceId: shotsTable.sequenceId })
      .from(shotsTable)
      .where(
        and(eq(shotsTable.id, task.entityId), eq(shotsTable.tenantId, tenantId)),
      );
    if (!shot?.sequenceId) return;
    const sequenceId = shot.sequenceId;

    const sequenceShots = await db
      .select({ id: shotsTable.id })
      .from(shotsTable)
      .where(
        and(
          eq(shotsTable.tenantId, tenantId),
          eq(shotsTable.sequenceId, sequenceId),
        ),
      );
    const shotIds = sequenceShots.map((s) => s.id);
    if (shotIds.length === 0) return;

    const sequenceTasks = await db
      .select()
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.tenantId, tenantId),
          eq(tasksTable.entityType, "shot"),
          inArray(tasksTable.entityId, shotIds),
        ),
      );
    if (sequenceTasks.length === 0) return;

    const allApproved = sequenceTasks.every((t) => t.status === "approved");
    if (!allApproved) return;

    // "Early" requires a real deadline to compare against -- a sequence
    // with no dueDate anywhere can't be judged ahead of schedule, so this
    // never fires for it rather than guessing.
    const dueDates = sequenceTasks
      .map((t) => t.dueDate)
      .filter((d): d is Date => d !== null);
    if (dueDates.length === 0) return;
    const latestDue = new Date(Math.max(...dueDates.map((d) => d.getTime())));
    if (latestDue.getTime() <= Date.now()) return;

    const teamMembers = await db
      .select({
        userId: sequenceTeamMembersTable.userId,
        departmentId: usersTable.departmentId,
      })
      .from(sequenceTeamMembersTable)
      .innerJoin(usersTable, eq(sequenceTeamMembersTable.userId, usersTable.id))
      .where(
        and(
          eq(sequenceTeamMembersTable.tenantId, tenantId),
          eq(sequenceTeamMembersTable.sequenceId, sequenceId),
        ),
      );
    if (teamMembers.length === 0) return;

    let reassignedAny = false;
    for (const member of teamMembers) {
      if (!member.departmentId) continue;
      const [dept] = await db
        .select({ name: departmentsTable.name })
        .from(departmentsTable)
        .where(
          and(
            eq(departmentsTable.id, member.departmentId),
            eq(departmentsTable.tenantId, tenantId),
          ),
        );
      if (!dept) continue;

      // Bottlenecked = not yet approved, and either nobody's on it or it's
      // already overdue -- deliberately scoped to the member's own
      // department (tasksTable.department is a plain text name, matching
      // how it's set everywhere else in this codebase, not a departmentId
      // FK) so a freed artist never picks up another department's queue.
      const [bottleneck] = await db
        .select()
        .from(tasksTable)
        .where(
          and(
            eq(tasksTable.tenantId, tenantId),
            eq(tasksTable.department, dept.name),
            ne(tasksTable.status, "approved"),
            or(isNull(tasksTable.assignedTo), lt(tasksTable.dueDate, new Date())),
          ),
        )
        .orderBy(tasksTable.dueDate)
        .limit(1);
      if (!bottleneck) continue; // nothing bottlenecked in their dept -- stays that way

      await db
        .update(tasksTable)
        .set({ assignedTo: member.userId, lastStatusUpdate: new Date() })
        .where(eq(tasksTable.id, bottleneck.id));
      reassignedAny = true;

      await createNotification({
        tenantId,
        recipientUserId: member.userId,
        category: "workflow",
        title: `Sequence wrapped early — assigned "${bottleneck.title}"`,
        description: `Your team finished ahead of schedule, so you've been automatically assigned a bottlenecked ${dept.name} task.`,
        entityType: "task",
        entityId: bottleneck.id,
        actionUrl: `/tasks/${bottleneck.id}`,
      });
    }

    if (reassignedAny) await cacheDel(cacheKeys.tasksList(tenantId));
  } catch (err) {
    console.error(
      "[sequence-reassignment] failed:",
      (err as Error).message,
    );
  }
}
