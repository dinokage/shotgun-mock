// Attaches existing tasks to a pipeline stage, so tracksheet-imported work
// participates in the workflow engine instead of sitting outside it.
//
// A task carries `department` as a name string. Each project is bound to one
// or more pipeline templates; within those, exactly one stage should own that
// department. Where a task's department matches no stage in its project's
// pipelines, the task is left unstaged and reported — guessing would put work
// in the wrong place, which is worse than leaving it visibly unassigned.
//
// Idempotent: re-running recomputes the same mapping. Pass --dry to report
// without writing.
import { prisma } from "@workspace/db";

const DRY_RUN = process.argv.includes("--dry");

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

  for (const tenant of tenants) {
    const departments = await prisma.department.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, name: true },
    });
    const deptIdByName = new Map(departments.map((d) => [d.name, d.id]));

    const pipelines = await prisma.projectPipeline.findMany({
      where: { tenantId: tenant.id },
      select: { projectId: true, templateId: true },
    });
    const templateIdsByProject = new Map<string, string[]>();
    for (const p of pipelines) {
      const list = templateIdsByProject.get(p.projectId) ?? [];
      list.push(p.templateId);
      templateIdsByProject.set(p.projectId, list);
    }

    const stages = await prisma.pipelineStage.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, name: true, templateId: true, departmentId: true },
    });

    // entityId -> projectId, so a task can be traced to its project.
    const shots = await prisma.shot.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, projectId: true },
    });
    const assets = await prisma.asset.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, projectId: true },
    });
    const projectByEntity = new Map<string, string>();
    for (const s of shots) projectByEntity.set(s.id, s.projectId);
    for (const a of assets) projectByEntity.set(a.id, a.projectId);

    const tasks = await prisma.task.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, department: true, entityId: true, pipelineStageId: true },
    });

    let mapped = 0;
    const unmatched = new Map<string, number>();
    const updates: { id: string; stageId: string }[] = [];

    for (const task of tasks) {
      const projectId = projectByEntity.get(task.entityId);
      const deptId = task.department ? deptIdByName.get(task.department) : undefined;
      if (!projectId || !deptId) {
        const key = task.department ?? "(no department)";
        unmatched.set(key, (unmatched.get(key) ?? 0) + 1);
        continue;
      }
      const templateIds = templateIdsByProject.get(projectId) ?? [];
      const match = stages.find(
        (s) => templateIds.includes(s.templateId) && s.departmentId === deptId,
      );
      if (!match) {
        const key = task.department ?? "(no department)";
        unmatched.set(key, (unmatched.get(key) ?? 0) + 1);
        continue;
      }
      mapped++;
      if (task.pipelineStageId !== match.id) {
        updates.push({ id: task.id, stageId: match.id });
      }
    }

    console.log(`\n${tenant.name}: ${mapped}/${tasks.length} tasks map to a stage`);
    if (unmatched.size) {
      console.log("  unmatched:");
      for (const [dept, count] of [...unmatched].sort((a, b) => b[1] - a[1])) {
        console.log(`    ${dept}: ${count}`);
      }
    }

    if (DRY_RUN) {
      console.log(`  (dry run — ${updates.length} would be written)`);
      continue;
    }
    for (const u of updates) {
      await prisma.task.update({
        where: { id: u.id },
        data: { pipelineStageId: u.stageId },
      });
    }
    console.log(`  wrote ${updates.length} stage assignments`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
