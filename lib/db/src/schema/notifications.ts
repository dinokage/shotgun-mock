import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { tenantsTable, usersTable } from "./core";

// Replaces the old store/notifications.ts, which was a localStorage-only
// Zustand store -- addNotification() there could only ever write into the
// acting user's own browser, so "notify the production head when someone
// logs in" was structurally impossible: the production head's browser had
// no way to see an event that happened in someone else's. This table plus
// short-interval polling (see useNotifications.ts) is the real, shared
// delivery mechanism.
export const notificationsTable = pgTable("notifications", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  recipientUserId: text("recipient_user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  // Mirrors NotificationCategory in the old mock data (assignment, workflow,
  // mention, review, approval, publishing, handoff, system) -- kept as free
  // text rather than a DB enum so a new category never needs a migration.
  category: text("category").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  actionUrl: text("action_url"),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
