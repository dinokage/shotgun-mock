import { pgTable, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { tenantRolesTable } from "./rbac";
import { departmentsTable } from "./departments";

export const tenantsTable = pgTable("tenants", {
  id: text("id").primaryKey(), // Using uuid strings or cuid
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(), // Subdomain e.g. 'acme'
  stripeCustomerId: text("stripe_customer_id"),
  logo: text("logo"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
});

export const platformUsersTable = pgTable("platform_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  hashedPassword: text("hashed_password").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  roleId: text("role_id")
    .notNull()
    .references(() => tenantRolesTable.id, { onDelete: "cascade" }),
  departmentId: text("department_id").references(() => departmentsTable.id, {
    onDelete: "set null",
  }),
  // Globally unique, not per-tenant: this schema has no tenant-membership
  // junction, so one user row is definitionally one tenant. Login
  // (routes/auth.ts) looks users up by email BEFORE any tenant context exists,
  // so a cross-tenant duplicate would make which row Postgres returns
  // undefined — and one tenant's password checked against another's hash.
  email: text("email").notNull().unique(),
  hashedPassword: text("hashed_password").notNull(),
  name: text("name").notNull(),
  title: text("title"),
  avatar: text("avatar"),
  status: text("status").default("active"),
  // Real punch clock state, replacing the old client-only localStorage timer
  // (which auto-started on every login and never told anyone else's browser
  // whether this person was actually clocked in). Null = punched out.
  punchedInAt: timestamp("punched_in_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
});

export const auditLogsTable = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").notNull(),
  action: text("action").notNull(),
  targetEntityType: text("target_entity_type").notNull(),
  targetEntityId: text("target_entity_id").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const pendingInvitesTable = pgTable("pending_invites", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  roleId: text("role_id").notNull(),
  departmentId: text("department_id").references(() => departmentsTable.id, {
    onDelete: "set null",
  }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
