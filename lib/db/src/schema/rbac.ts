import { pgTable, text, boolean, primaryKey } from "drizzle-orm/pg-core";
import { tenantsTable } from "./core";

export const tenantRolesTable = pgTable("tenant_roles", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isSystemDefault: boolean("is_system_default").default(false).notNull(),
});

export const tenantRoleCapabilitiesTable = pgTable(
  "tenant_role_capabilities",
  {
    roleId: text("role_id")
      .notNull()
      .references(() => tenantRolesTable.id, { onDelete: "cascade" }),
    capabilityId: text("capability_id").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.roleId, table.capabilityId] }),
  }),
);
