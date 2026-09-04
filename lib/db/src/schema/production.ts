import { pgTable, text, timestamp, integer, jsonb, unique } from "drizzle-orm/pg-core";
import { tenantsTable, usersTable } from "./core";

export const projectsTable = pgTable("projects", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  code: text("code"),
  type: text("type"),
  client: text("client"),
  status: text("status").notNull().default("active"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
});

export const episodesTable = pgTable("episodes", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  projectId: text("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sequencesTable = pgTable("sequences", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  projectId: text("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  episodeId: text("episode_id").references(() => episodesTable.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Self-service "who's currently working this sequence" roster: an artist
// joins/leaves on their own, no lead/PM assignment step. This is what the
// early-completion auto-reassignment feature (routes/tasks.ts's approval
// flow) reads to find who's free and which department they belong to —
// department itself isn't duplicated here since it's already on
// usersTable and can drift (a transfer shouldn't require rewriting old
// roster rows).
export const sequenceTeamMembersTable = pgTable(
  "sequence_team_members",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    sequenceId: text("sequence_id")
      .notNull()
      .references(() => sequencesTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (table) => ({
    // A user can only join a given sequence's roster once -- joining again
    // should be a no-op, not a duplicate row that then shows up twice.
    sequenceUserUnique: unique().on(table.sequenceId, table.userId),
  }),
);

export const assetsTable = pgTable("assets", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  projectId: text("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  episodeId: text("episode_id").references(() => episodesTable.id, {
    onDelete: "set null",
  }),
  sequenceId: text("sequence_id").references(() => sequencesTable.id, {
    onDelete: "set null",
  }),
  assigneeId: text("assignee_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  type: text("type").notNull().default("Prop"),
  status: text("status").notNull().default("active"),
  version: text("version").notNull().default("v001"),
  usdVersion: text("usd_version"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  thumbnail: text("thumbnail"),
  fileSize: text("file_size").notNull().default("0MB"),
  polyCount: text("poly_count"),
  dependencies: jsonb("dependencies").$type<string[]>().notNull().default([]),
  publishStatus: text("publish_status").notNull().default("draft"),
  description: text("description").notNull().default(""),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
});

export const shotsTable = pgTable("shots", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  projectId: text("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  episodeId: text("episode_id").references(() => episodesTable.id, {
    onDelete: "set null",
  }),
  sequenceId: text("sequence_id").references(() => sequencesTable.id, {
    onDelete: "set null",
  }),
  assigneeId: text("assignee_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  frameRange: text("frame_range").notNull().default("1001-1100"),
  duration: integer("duration").notNull().default(100),
  complexity: text("complexity").notNull().default("medium"),
  currentVersion: text("current_version").notNull().default("v001"),
  usdVersion: text("usd_version"),
  internalReviewStatus: text("internal_review_status")
    .notNull()
    .default("not-submitted"),
  clientReviewStatus: text("client_review_status")
    .notNull()
    .default("not-submitted"),
  thumbnail: text("thumbnail"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
});

export const tasksTable = pgTable("tasks", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  entityId: text("entity_id").notNull(), // Can be an asset id or shot id
  entityType: text("entity_type").notNull(), // 'asset' | 'shot'
  title: text("title").notNull().default(""),
  description: text("description").notNull().default(""),
  assignedTo: text("assigned_to"), // FK to usersTable.id
  status: text("status").notNull().default("ready"),
  priority: text("priority").notNull().default("medium"),
  department: text("department"),
  pipelinePhase: text("pipeline_phase"),
  weeklyRating: text("weekly_rating"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  estimatedHours: integer("estimated_hours").notNull().default(0),
  actualHours: integer("actual_hours").notNull().default(0),
  startDate: timestamp("start_date"),
  dueDate: timestamp("due_date"),
  lastStatusUpdate: timestamp("last_status_update").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const dailyLogsTable = pgTable("daily_logs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  taskId: text("task_id")
    .notNull()
    .references(() => tasksTable.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // ISO date string, e.g. "2026-08-31"
  hours: integer("hours").notNull(),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const versionsTable = pgTable("versions", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  entityId: text("entity_id").notNull(),
  entityType: text("entity_type").notNull(), // 'shot' | 'asset'
  versionNumber: text("version_number").notNull().default("v001"),
  taskId: text("task_id").references(() => tasksTable.id, {
    onDelete: "set null",
  }),
  mediaUrl: text("media_url").notNull(),
  status: text("status").notNull().default("pending_review"),
  notes: text("notes").notNull().default(""),
  thumbnail: text("thumbnail"),
  derivedFromId: text("derived_from_id"),
  fileSize: text("file_size").notNull().default("0MB"),
  createdById: text("created_by_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
