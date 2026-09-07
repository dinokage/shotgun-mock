import { prisma } from "@workspace/db";
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
    const task = await prisma.task.findFirst({
      where: { id: taskId, tenantId },
    });
    if (!task || task.entityType !== "shot") return;

    const shot = await prisma.shot.findFirst({
      where: { id: task.entityId, tenantId },
      select: { sequenceId: true },
    });
    if (!shot?.sequenceId) return;
    const sequenceId = shot.sequenceId;

    const sequenceShots = await prisma.shot.findMany({
      where: { tenantId, sequenceId },
      select: { id: true },
    });
    const shotIds = sequenceShots.map((s) => s.id);
    if (shotIds.length === 0) return;

    const sequenceTasks = await prisma.task.findMany({
      where: { tenantId, entityType: "shot", entityId: { in: shotIds } },
    });
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

    const teamMembers = await prisma.sequenceTeamMember.findMany({
      where: { tenantId, sequenceId },
      select: { userId: true, user: { select: { departmentId: true } } },
    });
    if (teamMembers.length === 0) return;

    let reassignedAny = false;
    for (const member of teamMembers) {
      const departmentId = member.user.departmentId;
      if (!departmentId) continue;
      const dept = await prisma.department.findFirst({
        where: { id: departmentId, tenantId },
        select: { name: true },
      });
      if (!dept) continue;

      // Bottlenecked = not yet approved, and either nobody's on it or it's
      // already overdue -- deliberately scoped to the member's own
      // department (Task.department is a plain text name, matching how
      // it's set everywhere else in this codebase, not a departmentId FK)
      // so a freed artist never picks up another department's queue.
      const bottleneck = await prisma.task.findFirst({
        where: {
          tenantId,
          department: dept.name,
          status: { not: "approved" },
          OR: [{ assignedTo: null }, { dueDate: { lt: new Date() } }],
        },
        orderBy: { dueDate: "asc" },
      });
      if (!bottleneck) continue; // nothing bottlenecked in their dept -- stays that way

      await prisma.task.updateMany({
        where: { id: bottleneck.id },
        data: { assignedTo: member.userId, lastStatusUpdate: new Date() },
      });
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
