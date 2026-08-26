import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { tenantsTable } from "./core";

export const departmentsTable = pgTable("departments", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  abbr: text("abbr").notNull(),
  pipeline: text("pipeline").notNull(), // "PROD" | "3D" | "VFX" | "2D"
  pipelineOrder: integer("pipeline_order").notNull().default(0),
  color: text("color"),
  icon: text("icon"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
