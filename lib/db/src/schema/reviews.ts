import {
  pgTable,
  text,
  timestamp,
  integer,
  doublePrecision,
  jsonb,
} from "drizzle-orm/pg-core";
import { tenantsTable, usersTable } from "./core";
import { versionsTable } from "./production";

export const reviewsTable = pgTable("reviews", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  entityId: text("entity_id").notNull(),
  entityType: text("entity_type").notNull(), // 'shot' | 'asset'
  versionId: text("version_id")
    .notNull()
    .references(() => versionsTable.id, { onDelete: "cascade" }),
  reviewerId: text("reviewer_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  comments: text("comments").notNull().default(""),
  frame: integer("frame"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Mirrors the frontend `Annotation` interface in
// artifacts/forge/src/components/shared/review/types.ts exactly, so the
// frontend can persist/hydrate the same shape it already uses locally.
export const annotationsTable = pgTable("annotations", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  versionId: text("version_id")
    .notNull()
    .references(() => versionsTable.id, { onDelete: "cascade" }),
  frame: integer("frame").notNull(),
  type: text("type").notNull(), // 'select' | 'pen' | 'arrow' | 'rectangle' | 'text'
  color: text("color").notNull(),
  x: doublePrecision("x").notNull(),
  y: doublePrecision("y").notNull(),
  w: doublePrecision("w"),
  h: doublePrecision("h"),
  points: jsonb("points").$type<{ x: number; y: number }[]>(),
  text: text("text"),
  startFrame: integer("start_frame"),
  endFrame: integer("end_frame"),
  fontFamily: text("font_family"),
  fontSize: integer("font_size"),
  backgroundColor: text("background_color"),
  createdById: text("created_by_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
