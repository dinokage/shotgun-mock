import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { tenantsTable } from "./core";
import { usersTable } from "./core";
import { projectsTable, episodesTable } from "./production";
import { versionsTable } from "./production";

// A producer-generated link+code a client redeems (no password) to get
// a scoped, read-mostly session limited to exactly one of
// project/episode/version — never a whole tenant. Exactly one of
// projectId/episodeId/versionId should be set per row (narrowest scope
// wins); enforced at the route layer (Task 5), not a DB constraint,
// since Drizzle has no clean CHECK-constraint builder for "exactly one
// of N columns" and this project doesn't hand-write raw SQL constraints
// elsewhere either.
export const clientAccessLinksTable = pgTable(
  "client_access_links",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    projectId: text("project_id").references(() => projectsTable.id, {
      onDelete: "cascade",
    }),
    episodeId: text("episode_id").references(() => episodesTable.id, {
      onDelete: "cascade",
    }),
    versionId: text("version_id").references(() => versionsTable.id, {
      onDelete: "cascade",
    }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    // A code only needs to be unique within its own tenant, not
    // globally — two different studios could otherwise never both
    // pick "REVIEW1".
    tenantCodeUnique: unique().on(table.tenantId, table.code),
  }),
);
