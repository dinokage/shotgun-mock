import { db } from "@workspace/db";
import {
  tenantsTable,
  departmentsTable,
  projectsTable,
  usersTable,
  tenantRolesTable,
  tenantRoleCapabilitiesTable,
  episodesTable,
  sequencesTable,
  shotsTable,
  assetsTable,
  tasksTable,
  taskChecklistItemsTable,
  taskCommentsTable,
  versionsTable,
  annotationsTable,
  dailyLogsTable,
} from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import * as crypto from "crypto";

async function main() {
  if (process.env.NODE_ENV !== "development") {
    console.error(
      "CRITICAL: Seed script can only be run in development environment.",
    );
    process.exit(1);
  }

  console.log("Starting DB seed...");

  const mockHashedPassword =
    "$argon2id$v=19$m=65536,p=4,t=3$S47zo5bxYnFgICAP+3cAQw$YvpNw85sWi6M9sj+QHapnopiNw+B2iFV8nSG0vNEZSA";

  await db
    .insert(tenantsTable)
    .values({ id: crypto.randomUUID(), name: "Acme VFX", slug: "acme" })
    .onConflictDoNothing();

  // Mirror the role-insertion pattern below: onConflictDoNothing() alone
  // doesn't tell us the id of a tenant that already existed, so re-query by
  // the unique slug to get the real row's id whether it was just inserted or
  // already there. Without this, a locally-generated tenantId that never
  // actually got persisted (because the slug already existed) would orphan
  // every downstream insert with a foreign-key violation.
  const [insertedTenant] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, "acme"));
  const tenantId = insertedTenant.id;

  // Two demo projects. Unlike tenants (unique slug) or users (unique email),
  // projectsTable has no unique constraint besides its primary key, so a
  // freshly-generated crypto.randomUUID() id would never conflict on rerun
  // and this insert would duplicate the project every reseed. Using a
  // deterministic id instead makes onConflictDoNothing() a real no-op on
  // rerun, and lets every downstream episode/sequence/shot/asset below
  // reference these ids directly without a query-back step.
  const projectDefs = [
    { id: "project-starfall", name: "Starfall", status: "active" },
    { id: "project-nightfall", name: "Nightfall Chronicles", status: "active" },
  ];
  await db
    .insert(projectsTable)
    .values(projectDefs.map((p) => ({ id: p.id, tenantId, name: p.name, status: p.status })))
    .onConflictDoNothing();

  const deptDefs = [
    { name: "Production Management", abbr: "PROD", pipeline: "PROD", pipelineOrder: 0, color: "#636e72", icon: "Briefcase" },
    { name: "Modeling", abbr: "MDL", pipeline: "3D", pipelineOrder: 1, color: "#4facfe", icon: "Box" },
    { name: "Texturing / LookDev", abbr: "TEX", pipeline: "3D", pipelineOrder: 2, color: "#a55eea", icon: "Paintbrush" },
    { name: "Rigging", abbr: "RIG", pipeline: "3D", pipelineOrder: 3, color: "#4ecdc4", icon: "Bone" },
    { name: "Layout", abbr: "LAY", pipeline: "3D", pipelineOrder: 4, color: "#fdcb6e", icon: "Layout" },
    { name: "Animation", abbr: "ANIM", pipeline: "3D", pipelineOrder: 5, color: "#fd79a8", icon: "Clapperboard" },
    { name: "Lighting", abbr: "LIT", pipeline: "3D", pipelineOrder: 6, color: "#0984e3", icon: "Sun" },
    { name: "Rendering", abbr: "RND", pipeline: "3D", pipelineOrder: 7, color: "#dfe6e9", icon: "MonitorPlay" },
    { name: "Matchmove / Camera Tracking", abbr: "TRK", pipeline: "VFX", pipelineOrder: 8, color: "#00cec9", icon: "Crosshair" },
    { name: "Rotomation", abbr: "RTM", pipeline: "VFX", pipelineOrder: 9, color: "#81ecec", icon: "Activity" },
    { name: "Creature Effects (CFX)", abbr: "CFX", pipeline: "VFX", pipelineOrder: 10, color: "#ff6b6b", icon: "Bug" },
    { name: "FX Simulations", abbr: "FX", pipeline: "VFX", pipelineOrder: 11, color: "#ff9f43", icon: "Flame" },
    { name: "Grooming", abbr: "GRM", pipeline: "VFX", pipelineOrder: 12, color: "#fab1a0", icon: "Scissors" },
    { name: "Rotoscoping (Roto)", abbr: "ROTO", pipeline: "2D", pipelineOrder: 13, color: "#e17055", icon: "PenTool" },
    { name: "Paint / Prep", abbr: "PNT", pipeline: "2D", pipelineOrder: 14, color: "#ffeaa7", icon: "Brush" },
    { name: "Digital Matte Painting (DMP)", abbr: "DMP", pipeline: "2D", pipelineOrder: 15, color: "#00b894", icon: "Mountain" },
    { name: "2D Animation / Motion Graphics", abbr: "MGFX", pipeline: "2D", pipelineOrder: 16, color: "#55efc4", icon: "Film" },
    { name: "Compositing", abbr: "COMP", pipeline: "2D", pipelineOrder: 17, color: "#6c5ce7", icon: "Layers" },
  ];

  const deptIds: Record<string, string> = {};
  for (const d of deptDefs) {
    const id = crypto.randomUUID();
    deptIds[d.name] = id;
    await db
      .insert(departmentsTable)
      .values({ id, tenantId, ...d })
      .onConflictDoNothing();
  }

  // capability sets reuse the app's existing 14-id catalogue
  // (artifacts/forge/src/store/permissions.ts CAPABILITY_IDS) — see this
  // plan's Global Constraints for why no new capability strings are added.
  const roles = [
    {
      name: "admin",
      email: "admin@acme.com",
      user: "Acme Admin",
      department: null as string | null,
      capabilities: [
        "create_tasks", "edit_tasks", "delete_tasks", "assign_tasks",
        "submit_reviews", "approve_reviews", "manage_members", "manage_roles",
        "view_financials", "edit_financials", "manage_pipeline",
        "manage_licenses", "manage_integrations", "broadcast_updates",
      ],
    },
    {
      name: "production_head",
      email: "head@acme.com",
      user: "Acme Production Head",
      department: null,
      capabilities: [
        "create_tasks", "edit_tasks", "delete_tasks", "assign_tasks",
        "submit_reviews", "approve_reviews", "view_financials",
        "edit_financials", "manage_pipeline", "broadcast_updates",
      ],
    },
    {
      name: "producer",
      email: "producer@acme.com",
      user: "Acme Producer (Animation)",
      department: "Animation",
      capabilities: [
        "create_tasks", "edit_tasks", "assign_tasks", "submit_reviews",
        "approve_reviews", "manage_pipeline", "broadcast_updates",
      ],
    },
    {
      name: "producer",
      email: "producer.comp@acme.com",
      user: "Acme Producer (Compositing)",
      department: "Compositing",
      capabilities: [
        "create_tasks", "edit_tasks", "assign_tasks", "submit_reviews",
        "approve_reviews", "manage_pipeline", "broadcast_updates",
      ],
    },
    {
      name: "lead",
      email: "lead@acme.com",
      user: "Acme Lead (Animation)",
      department: "Animation",
      capabilities: [
        "create_tasks", "edit_tasks", "assign_tasks", "submit_reviews",
        "approve_reviews",
      ],
    },
    {
      name: "lead",
      email: "lead.fx@acme.com",
      user: "Acme Lead (FX Simulations)",
      department: "FX Simulations",
      capabilities: [
        "create_tasks", "edit_tasks", "assign_tasks", "submit_reviews",
        "approve_reviews",
      ],
    },
    {
      name: "artist",
      email: "artist@acme.com",
      user: "Acme Artist (Animation)",
      department: "Animation",
      capabilities: ["edit_tasks", "submit_reviews"],
    },
    {
      name: "artist",
      email: "artist.comp@acme.com",
      user: "Acme Artist (Compositing)",
      department: "Compositing",
      capabilities: ["edit_tasks", "submit_reviews"],
    },
    {
      name: "artist",
      email: "artist.fx@acme.com",
      user: "Acme Artist (FX Simulations)",
      department: "FX Simulations",
      capabilities: ["edit_tasks", "submit_reviews"],
    },
    {
      name: "client",
      email: "client@acme.com",
      user: "Acme Client",
      department: null,
      capabilities: ["approve_reviews"],
    },
  ];

  const roleIdByName: Record<string, string> = {};
  for (const roleDef of roles) {
    // Multiple entries share the same role NAME (e.g. two "producer" rows,
    // one per department) but must resolve to the same tenant_roles row and
    // the same capability set — only insert/query the role once per name.
    if (!roleIdByName[roleDef.name]) {
      const roleId = crypto.randomUUID();
      await db
        .insert(tenantRolesTable)
        .values({ id: roleId, tenantId, name: roleDef.name, isSystemDefault: true })
        .onConflictDoNothing();

      // Scope by tenantId too, not just name: tenant_roles has no unique
      // constraint on (tenant_id, name), and an unscoped query here could
      // resolve to another tenant's "admin" row, silently binding this
      // tenant's users to a foreign tenant's capability set.
      const [insertedRole] = await db
        .select()
        .from(tenantRolesTable)
        .where(
          and(
            eq(tenantRolesTable.name, roleDef.name),
            eq(tenantRolesTable.tenantId, tenantId),
          ),
        );
      roleIdByName[roleDef.name] = insertedRole.id;

      for (const cap of roleDef.capabilities) {
        await db
          .insert(tenantRoleCapabilitiesTable)
          .values({ roleId: insertedRole.id, capabilityId: cap })
          .onConflictDoNothing();
      }
    }

    await db
      .insert(usersTable)
      .values({
        id: crypto.randomUUID(),
        tenantId,
        roleId: roleIdByName[roleDef.name],
        departmentId: roleDef.department ? deptIds[roleDef.department] : null,
        email: roleDef.email,
        name: roleDef.user,
        hashedPassword: mockHashedPassword,
      })
      .onConflictDoNothing();
  }

  // ---------------------------------------------------------------------
  // Demo production data: episodes, sequences, shots, assets, tasks (with
  // checklist items + comments), versions (with annotations on one), and a
  // week of daily logs. This is what makes every frontend page seeded by
  // earlier tasks in this plan show non-empty, varied data on a fresh
  // database.
  //
  // Every id below is a deterministic, human-readable string rather than
  // crypto.randomUUID(). None of these tables have a unique constraint
  // besides their own primary key, so onConflictDoNothing() only no-ops on
  // rerun if the id itself is stable across runs — with a fresh random id
  // every run, onConflictDoNothing() would never find a conflict and every
  // reseed would duplicate all of these rows (the same latent issue the
  // deterministic project ids above avoid). Because ids are known ahead of
  // time, no query-back step is needed to resolve real persisted ids for
  // use as foreign keys below.
  // ---------------------------------------------------------------------

  // Resolve the actual persisted user ids by email. The users loop above
  // generates a fresh crypto.randomUUID() every run and relies on
  // onConflictDoNothing()'s default "any unique constraint" behavior
  // (users.email is unique) to skip re-inserting on rerun — so the
  // locally-generated `id` in that loop is not necessarily the id that
  // ended up persisted. Query back by tenantId to get the real ids before
  // using them as foreign keys below.
  const tenantUsers = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.tenantId, tenantId));
  const userIdByEmail: Record<string, string> = {};
  for (const u of tenantUsers) userIdByEmail[u.email] = u.id;

  const artistUserIds = [
    userIdByEmail["artist@acme.com"],
    userIdByEmail["artist.comp@acme.com"],
    userIdByEmail["artist.fx@acme.com"],
  ];
  const leadUserId = userIdByEmail["lead@acme.com"];
  const commentAuthorIds = [
    ...artistUserIds,
    leadUserId,
    userIdByEmail["lead.fx@acme.com"],
    userIdByEmail["producer@acme.com"],
  ];

  // --- Episodes: 2 per project --------------------------------------------
  const episodeDefs = [
    { id: "episode-starfall-e01", projectId: "project-starfall", name: "Episode 1: Genesis" },
    { id: "episode-starfall-e02", projectId: "project-starfall", name: "Episode 2: Fracture" },
    { id: "episode-nightfall-e01", projectId: "project-nightfall", name: "Episode 1: Eclipse" },
    { id: "episode-nightfall-e02", projectId: "project-nightfall", name: "Episode 2: Aftermath" },
  ];
  await db
    .insert(episodesTable)
    .values(episodeDefs.map((e) => ({ id: e.id, tenantId, projectId: e.projectId, name: e.name })))
    .onConflictDoNothing();

  // --- Sequences: 2-3 per episode (10 total) -----------------------------
  const sequenceDefs = [
    { id: "sequence-starfall-e01-sq010", projectId: "project-starfall", episodeId: "episode-starfall-e01", name: "SQ010" },
    { id: "sequence-starfall-e01-sq020", projectId: "project-starfall", episodeId: "episode-starfall-e01", name: "SQ020" },
    { id: "sequence-starfall-e01-sq030", projectId: "project-starfall", episodeId: "episode-starfall-e01", name: "SQ030" },
    { id: "sequence-starfall-e02-sq010", projectId: "project-starfall", episodeId: "episode-starfall-e02", name: "SQ010" },
    { id: "sequence-starfall-e02-sq020", projectId: "project-starfall", episodeId: "episode-starfall-e02", name: "SQ020" },
    { id: "sequence-nightfall-e01-sq010", projectId: "project-nightfall", episodeId: "episode-nightfall-e01", name: "SQ010" },
    { id: "sequence-nightfall-e01-sq020", projectId: "project-nightfall", episodeId: "episode-nightfall-e01", name: "SQ020" },
    { id: "sequence-nightfall-e01-sq030", projectId: "project-nightfall", episodeId: "episode-nightfall-e01", name: "SQ030" },
    { id: "sequence-nightfall-e02-sq010", projectId: "project-nightfall", episodeId: "episode-nightfall-e02", name: "SQ010" },
    { id: "sequence-nightfall-e02-sq020", projectId: "project-nightfall", episodeId: "episode-nightfall-e02", name: "SQ020" },
  ];
  await db
    .insert(sequencesTable)
    .values(
      sequenceDefs.map((s) => ({
        id: s.id,
        tenantId,
        projectId: s.projectId,
        episodeId: s.episodeId,
        name: s.name,
      })),
    )
    .onConflictDoNothing();

  // --- Shots: 18 total, 1-2 per sequence, varied status/review/assignee --
  // Status vocabulary matches Shot['status'] in
  // artifacts/forge/src/data/mockData.ts (also rendered by StatusBadge.tsx).
  const SHOT_STATUSES = [
    "complete", "in-progress", "bottleneck", "review", "not-started",
    "at-risk", "client-review", "approved", "published",
  ] as const;
  const REVIEW_STATUSES = ["pending", "approved", "rejected", "changes-requested", "not-submitted"] as const;
  const COMPLEXITIES = ["low", "medium", "high"] as const;

  interface ShotSeed {
    id: string; projectId: string; episodeId: string; sequenceId: string;
    name: string; status: string; assigneeId: string; frameRange: string;
    duration: number; complexity: string; currentVersion: string;
    internalReviewStatus: string; clientReviewStatus: string; notes: string;
    versionCount: number;
  }
  const shotDefs: ShotSeed[] = [];
  let shotIndex = 0;
  sequenceDefs.forEach((seq, seqIdx) => {
    const shotsInSeq = seqIdx < 8 ? 2 : 1; // 8*2 + 2*1 = 18 shots total
    for (let n = 0; n < shotsInSeq; n++) {
      const i = shotIndex++;
      const shotNumber = (n + 1) * 10;
      const duration = 72 + ((i * 11) % 96);
      const versionCount = (i % 2) + 1;
      const seqSlug = seq.id.replace("sequence-", "");
      const status = SHOT_STATUSES[i % SHOT_STATUSES.length];
      shotDefs.push({
        id: `shot-${seqSlug}-${String(shotNumber).padStart(4, "0")}`,
        projectId: seq.projectId,
        episodeId: seq.episodeId,
        sequenceId: seq.id,
        name: `${seq.name}_${String(shotNumber).padStart(4, "0")}`,
        status,
        assigneeId: artistUserIds[i % artistUserIds.length],
        frameRange: `1001-${1001 + duration - 1}`,
        duration,
        complexity: COMPLEXITIES[i % COMPLEXITIES.length],
        currentVersion: versionCount === 2 ? "v002" : "v001",
        internalReviewStatus: REVIEW_STATUSES[i % REVIEW_STATUSES.length],
        clientReviewStatus: REVIEW_STATUSES[(i + 2) % REVIEW_STATUSES.length],
        notes: `${seq.name} shot ${shotNumber}, currently ${status.replace(/-/g, " ")}.`,
        versionCount,
      });
    }
  });

  await db
    .insert(shotsTable)
    .values(
      shotDefs.map((s) => ({
        id: s.id,
        tenantId,
        projectId: s.projectId,
        episodeId: s.episodeId,
        sequenceId: s.sequenceId,
        assigneeId: s.assigneeId,
        name: s.name,
        status: s.status,
        frameRange: s.frameRange,
        duration: s.duration,
        complexity: s.complexity,
        currentVersion: s.currentVersion,
        internalReviewStatus: s.internalReviewStatus,
        clientReviewStatus: s.clientReviewStatus,
        notes: s.notes,
      })),
    )
    .onConflictDoNothing();

  // --- Assets: 12 total, varied type/status/publishStatus/assignee -------
  // Vocabulary matches Asset['type']/['status']/['publishStatus'] in mockData.ts.
  const ASSET_TYPES = [
    "Character", "Environment", "Prop", "Rig", "Effects",
    "Vehicle", "Texture", "Material", "Audio",
  ] as const;
  const ASSET_STATUSES = ["complete", "in-progress", "bottleneck", "at-risk", "not-started", "review"] as const;
  const PUBLISH_STATUSES = ["published", "draft", "queued", "validating", "failed"] as const;
  const ASSET_NAMES = [
    "Hero Knight", "Castle Exterior", "Ancient Sword", "Dragon Rig",
    "Fire Breath FX", "War Chariot", "Stone Texture Set", "Chainmail Material",
    "Battle Horn Audio", "Village Elder", "Forest Canopy", "Siege Tower",
  ];
  const assetProjects = ["project-starfall", "project-nightfall"];

  interface AssetSeed {
    id: string; projectId: string; episodeId: string | null; sequenceId: string | null;
    assigneeId: string; name: string; type: string; status: string; version: string;
    tags: string[]; fileSize: string; polyCount: string | null; publishStatus: string;
    description: string; notes: string; versionCount: number;
  }
  const assetDefs: AssetSeed[] = [];
  for (let i = 0; i < ASSET_NAMES.length; i++) {
    const projectId = assetProjects[i % assetProjects.length];
    const seqsForProject = sequenceDefs.filter((s) => s.projectId === projectId);
    const seq = i % 3 === 0 ? null : seqsForProject[i % seqsForProject.length];
    const type = ASSET_TYPES[i % ASSET_TYPES.length];
    const versionCount = (i % 2) + 1;
    assetDefs.push({
      id: `asset-${ASSET_NAMES[i].toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      projectId,
      episodeId: seq ? seq.episodeId : null,
      sequenceId: seq ? seq.id : null,
      assigneeId: artistUserIds[i % artistUserIds.length],
      name: ASSET_NAMES[i],
      type,
      status: ASSET_STATUSES[i % ASSET_STATUSES.length],
      version: versionCount === 2 ? "v002" : "v001",
      tags: [type.toLowerCase(), projectId.replace("project-", "")],
      fileSize: `${120 + i * 37}MB`,
      polyCount: type === "Character" || type === "Environment" || type === "Rig" ? `${(i + 1) * 18}k` : null,
      publishStatus: PUBLISH_STATUSES[i % PUBLISH_STATUSES.length],
      description: `${type} asset — ${ASSET_NAMES[i]}, used across ${projectId.replace("project-", "")}.`,
      notes: `Auto-seeded ${type.toLowerCase()} asset for demo data.`,
      versionCount,
    });
  }

  await db
    .insert(assetsTable)
    .values(
      assetDefs.map((a) => ({
        id: a.id,
        tenantId,
        projectId: a.projectId,
        episodeId: a.episodeId,
        sequenceId: a.sequenceId,
        assigneeId: a.assigneeId,
        name: a.name,
        type: a.type,
        status: a.status,
        version: a.version,
        tags: a.tags,
        fileSize: a.fileSize,
        polyCount: a.polyCount,
        dependencies: [] as string[],
        publishStatus: a.publishStatus,
        description: a.description,
        notes: a.notes,
      })),
    )
    .onConflictDoNothing();

  // --- Tasks: 24 total across shots + assets, each with a few checklist --
  // items and comments. Status vocabulary matches TaskStatus in mockData.ts.
  interface DemoEntity { id: string; type: "shot" | "asset"; name: string; assigneeId: string }
  const entities: DemoEntity[] = [
    ...shotDefs.map((s) => ({ id: s.id, type: "shot" as const, name: s.name, assigneeId: s.assigneeId })),
    ...assetDefs.map((a) => ({ id: a.id, type: "asset" as const, name: a.name, assigneeId: a.assigneeId })),
  ];

  const TASK_STATUSES = [
    "todo", "not-started", "in-progress", "bottleneck", "review",
    "lead-review", "manager-review", "approved", "complete", "cancelled",
  ] as const;
  const TASK_PRIORITIES = ["critical", "high", "medium", "low"] as const;
  const WEEKLY_RATINGS = ["on-track", "at-risk", "behind"] as const;
  // Every non-management department is a plausible task department; PROD
  // (Production Management) doesn't do hands-on pipeline work.
  const productionDepts = deptDefs.filter((d) => d.abbr !== "PROD");

  interface TaskSeed {
    id: string; entityId: string; entityType: "shot" | "asset"; title: string;
    description: string; assignedTo: string; status: string; priority: string;
    department: string; pipelinePhase: string; weeklyRating: string | null;
    estimatedHours: number; startDate: Date; dueDate: Date;
  }
  const TASK_COUNT = 24;
  const taskDefs: TaskSeed[] = [];
  const seedToday = new Date("2026-08-31T00:00:00.000Z");
  for (let i = 0; i < TASK_COUNT; i++) {
    const entity = entities[i % entities.length];
    const dept = productionDepts[i % productionDepts.length];
    const dueDate = new Date(seedToday);
    dueDate.setUTCDate(dueDate.getUTCDate() + (i - 12));
    const startDate = new Date(dueDate);
    startDate.setUTCDate(startDate.getUTCDate() - (5 + (i % 10)));
    taskDefs.push({
      id: `task-${String(i + 1).padStart(3, "0")}`,
      entityId: entity.id,
      entityType: entity.type,
      title: `${dept.name} — ${entity.name}`,
      description: `${dept.name} work on ${entity.type} ${entity.name}.`,
      assignedTo: entity.assigneeId,
      status: TASK_STATUSES[i % TASK_STATUSES.length],
      priority: TASK_PRIORITIES[i % TASK_PRIORITIES.length],
      department: dept.name,
      pipelinePhase: dept.abbr,
      weeklyRating: i % 3 === 0 ? null : WEEKLY_RATINGS[i % WEEKLY_RATINGS.length],
      estimatedHours: 8 + ((i * 3) % 40),
      startDate,
      dueDate,
    });
  }

  await db
    .insert(tasksTable)
    .values(
      taskDefs.map((t) => ({
        id: t.id,
        tenantId,
        entityId: t.entityId,
        entityType: t.entityType,
        title: t.title,
        description: t.description,
        assignedTo: t.assignedTo,
        status: t.status,
        priority: t.priority,
        department: t.department,
        pipelinePhase: t.pipelinePhase,
        weeklyRating: t.weeklyRating,
        estimatedHours: t.estimatedHours,
        startDate: t.startDate,
        dueDate: t.dueDate,
      })),
    )
    .onConflictDoNothing();

  // --- Checklist items: 2-3 per task --------------------------------------
  const CHECKLIST_TEMPLATES = [
    ["Block primary pass", "Get lead approval", "Publish to pipeline"],
    ["Review reference plates", "Match camera/lighting", "Submit for review"],
  ];
  interface ChecklistSeed { id: string; taskId: string; text: string; done: boolean; position: number }
  const checklistDefs: ChecklistSeed[] = [];
  taskDefs.forEach((t, ti) => {
    const template = CHECKLIST_TEMPLATES[ti % CHECKLIST_TEMPLATES.length];
    const itemCount = 2 + (ti % 2); // 2 or 3 items
    for (let ii = 0; ii < itemCount; ii++) {
      checklistDefs.push({
        id: `checklist-${t.id}-${ii + 1}`,
        taskId: t.id,
        text: template[ii % template.length],
        done: (ti + ii) % 3 !== 0,
        position: ii,
      });
    }
  });
  await db
    .insert(taskChecklistItemsTable)
    .values(
      checklistDefs.map((c) => ({
        id: c.id,
        tenantId,
        taskId: c.taskId,
        text: c.text,
        done: c.done,
        position: c.position,
      })),
    )
    .onConflictDoNothing();

  // --- Comments: 1-2 per task ---------------------------------------------
  const COMMENT_TEMPLATES = [
    "Looking good so far, please push the next version when ready.",
    "Can we get another pass on the timing here?",
    "Approved from my side, moving to the next stage.",
    "Please address the notes from the last review before resubmitting.",
  ];
  interface CommentSeed { id: string; taskId: string; userId: string; text: string }
  const commentDefs: CommentSeed[] = [];
  taskDefs.forEach((t, ti) => {
    const commentCount = 1 + (ti % 2); // 1 or 2 comments
    for (let ci = 0; ci < commentCount; ci++) {
      commentDefs.push({
        id: `comment-${t.id}-${ci + 1}`,
        taskId: t.id,
        userId: commentAuthorIds[(ti + ci) % commentAuthorIds.length],
        text: COMMENT_TEMPLATES[(ti + ci) % COMMENT_TEMPLATES.length],
      });
    }
  });
  await db
    .insert(taskCommentsTable)
    .values(commentDefs.map((c) => ({ id: c.id, tenantId, taskId: c.taskId, userId: c.userId, text: c.text })))
    .onConflictDoNothing();

  // --- Versions: 1-2 per shot/asset, status vocabulary matches ------------
  // Version['status'] in mockData.ts.
  const VERSION_STATUSES = ["pending", "approved", "rejected", "changes-requested"] as const;
  const taskIdByEntityId: Record<string, string> = {};
  for (const t of taskDefs) {
    if (!taskIdByEntityId[t.entityId]) taskIdByEntityId[t.entityId] = t.id;
  }

  const versionableEntities = [
    ...shotDefs.map((s) => ({ id: s.id, type: "shot" as const, versionCount: s.versionCount, assigneeId: s.assigneeId })),
    ...assetDefs.map((a) => ({ id: a.id, type: "asset" as const, versionCount: a.versionCount, assigneeId: a.assigneeId })),
  ];

  interface VersionSeed {
    id: string; entityId: string; entityType: "shot" | "asset"; versionNumber: string;
    taskId: string | null; mediaUrl: string; status: string; notes: string;
    derivedFromId: string | null; fileSize: string; createdById: string;
  }
  const versionDefs: VersionSeed[] = [];
  let versionGlobalIndex = 0;
  for (const entity of versionableEntities) {
    let previousVersionId: string | null = null;
    for (let n = 1; n <= entity.versionCount; n++) {
      const versionNumber = `v${String(n).padStart(3, "0")}`;
      const id = `version-${entity.id}-${versionNumber}`;
      versionDefs.push({
        id,
        entityId: entity.id,
        entityType: entity.type,
        versionNumber,
        taskId: taskIdByEntityId[entity.id] ?? null,
        mediaUrl: `https://cdn.example.com/renders/${entity.id}/${versionNumber}.mp4`,
        status: VERSION_STATUSES[versionGlobalIndex % VERSION_STATUSES.length],
        notes: n === 1 ? "Initial pass for review." : "Addressed notes from previous review.",
        derivedFromId: previousVersionId,
        fileSize: `${240 + versionGlobalIndex * 53}MB`,
        createdById: entity.assigneeId,
      });
      previousVersionId = id;
      versionGlobalIndex++;
    }
  }

  await db
    .insert(versionsTable)
    .values(
      versionDefs.map((v) => ({
        id: v.id,
        tenantId,
        entityId: v.entityId,
        entityType: v.entityType,
        versionNumber: v.versionNumber,
        taskId: v.taskId,
        mediaUrl: v.mediaUrl,
        status: v.status,
        notes: v.notes,
        derivedFromId: v.derivedFromId,
        fileSize: v.fileSize,
        createdById: v.createdById,
      })),
    )
    .onConflictDoNothing();

  // --- Annotations: 2-3 rows on the first shot's v001, so the Review page --
  // has something to display immediately. Field names/types mirror the
  // Annotation interface in
  // artifacts/forge/src/components/shared/review/types.ts exactly.
  const annotationVersionId = `version-${shotDefs[0].id}-v001`;
  interface AnnotationSeed {
    id: string; versionId: string; frame: number; type: string; color: string;
    x: number; y: number; w: number | null; h: number | null;
    points: { x: number; y: number }[] | null; text: string | null;
    startFrame: number | null; endFrame: number | null; fontFamily: string | null;
    fontSize: number | null; backgroundColor: string | null; createdById: string;
  }
  const annotationDefs: AnnotationSeed[] = [
    {
      id: `annotation-${annotationVersionId}-1`,
      versionId: annotationVersionId,
      frame: 24,
      type: "pen",
      color: "#ff6b6b",
      x: 0.22,
      y: 0.31,
      w: null,
      h: null,
      points: [
        { x: 0.22, y: 0.31 },
        { x: 0.26, y: 0.34 },
        { x: 0.29, y: 0.3 },
      ],
      text: null,
      startFrame: null,
      endFrame: null,
      fontFamily: null,
      fontSize: null,
      backgroundColor: null,
      createdById: leadUserId,
    },
    {
      id: `annotation-${annotationVersionId}-2`,
      versionId: annotationVersionId,
      frame: 40,
      type: "rectangle",
      color: "#4facfe",
      x: 0.5,
      y: 0.42,
      w: 0.16,
      h: 0.12,
      points: null,
      text: null,
      startFrame: null,
      endFrame: null,
      fontFamily: null,
      fontSize: null,
      backgroundColor: null,
      createdById: leadUserId,
    },
    {
      id: `annotation-${annotationVersionId}-3`,
      versionId: annotationVersionId,
      frame: 58,
      type: "text",
      color: "#fdcb6e",
      x: 0.62,
      y: 0.72,
      w: null,
      h: null,
      points: null,
      text: "Fix motion blur on the leading edge here.",
      startFrame: null,
      endFrame: null,
      fontFamily: "Inter",
      fontSize: 14,
      backgroundColor: "#1a1a1a",
      createdById: leadUserId,
    },
  ];
  await db
    .insert(annotationsTable)
    .values(
      annotationDefs.map((a) => ({
        id: a.id,
        tenantId,
        versionId: a.versionId,
        frame: a.frame,
        type: a.type,
        color: a.color,
        x: a.x,
        y: a.y,
        w: a.w,
        h: a.h,
        points: a.points,
        text: a.text,
        startFrame: a.startFrame,
        endFrame: a.endFrame,
        fontFamily: a.fontFamily,
        fontSize: a.fontSize,
        backgroundColor: a.backgroundColor,
        createdById: a.createdById,
      })),
    )
    .onConflictDoNothing();

  // --- Daily logs: a week of entries across a handful of tasks ------------
  const dailyLogTaskIndices = [0, 3, 6, 9, 12];
  const LOG_DATES = ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"];
  interface DailyLogSeed { id: string; taskId: string; userId: string; date: string; hours: number; note: string }
  const dailyLogDefs: DailyLogSeed[] = [];
  const actualHoursByTaskId: Record<string, number> = {};
  for (const ti of dailyLogTaskIndices) {
    const task = taskDefs[ti];
    LOG_DATES.forEach((date, di) => {
      const hours = 3 + ((ti + di) % 5); // 3-7 hours
      dailyLogDefs.push({
        id: `dailylog-${task.id}-${date}`,
        taskId: task.id,
        userId: task.assignedTo,
        date,
        hours,
        note: `Worked on ${task.title} (${date}).`,
      });
      actualHoursByTaskId[task.id] = (actualHoursByTaskId[task.id] ?? 0) + hours;
    });
  }
  await db
    .insert(dailyLogsTable)
    .values(
      dailyLogDefs.map((d) => ({
        id: d.id,
        tenantId,
        taskId: d.taskId,
        userId: d.userId,
        date: d.date,
        hours: d.hours,
        note: d.note,
      })),
    )
    .onConflictDoNothing();

  // Roll the logged hours into each task's actualHours, mirroring what
  // routes/daily-logs.ts's POST handler does for a single log entry (SET
  // rather than increment, so this stays correct across reseeds too).
  for (const [taskId, hours] of Object.entries(actualHoursByTaskId)) {
    await db
      .update(tasksTable)
      .set({ actualHours: hours })
      .where(and(eq(tasksTable.tenantId, tenantId), eq(tasksTable.id, taskId)));
  }

  console.log("DB seed completed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
