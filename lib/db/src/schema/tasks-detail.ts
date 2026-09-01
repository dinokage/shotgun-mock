import { pgTable, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { tenantsTable, usersTable } from "./core";
import { tasksTable } from "./production";

export const taskChecklistItemsTable = pgTable("task_checklist_items", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  taskId: text("task_id")
    .notNull()
    .references(() => tasksTable.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  done: boolean("done").notNull().default(false),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// FS/SS/FF/SF — see DependencyType in artifacts/forge/src/data/mockData.ts.
export const taskDependenciesTable = pgTable("task_dependencies", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  taskId: text("task_id")
    .notNull()
    .references(() => tasksTable.id, { onDelete: "cascade" }),
  dependsOnTaskId: text("depends_on_task_id")
    .notNull()
    .references(() => tasksTable.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("FS"),
  lagDays: integer("lag_days"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const taskCommentsTable = pgTable("task_comments", {
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
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const taskAttachmentsTable = pgTable("task_attachments", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  taskId: text("task_id")
    .notNull()
    .references(() => tasksTable.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  uploadedById: text("uploaded_by_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Append-only audit trail — see ApprovalEvent in
// artifacts/forge/src/data/mockData.ts. Rows are only ever inserted, never
// updated or deleted.
export const taskApprovalEventsTable = pgTable("task_approval_events", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  taskId: text("task_id")
    .notNull()
    .references(() => tasksTable.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  byUserId: text("by_user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  byRole: text("by_role").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
