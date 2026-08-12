import { pgEnum } from "drizzle-orm/pg-core";

// Mirrors the Role union and ROLE_HIERARCHY in
// artifacts/forge/src/data/mockData.ts — keep both in sync until Phase 1
// makes the backend the source of truth for the frontend's role types too.
export const ROLE_VALUES = [
  "vfx_producer",
  "production_manager",
  "coordinator",
  "supervisor",
  "lead",
  "senior_artist",
  "artist",
  "junior_artist",
  "client",
] as const;

export type Role = (typeof ROLE_VALUES)[number];

export const roleEnum = pgEnum("role", ROLE_VALUES);

// Higher number = more authority, matching ROLE_HIERARCHY's ranking.
export const ROLE_RANK: Record<Role, number> = {
  vfx_producer: 8,
  production_manager: 7,
  coordinator: 6,
  supervisor: 5,
  lead: 4,
  senior_artist: 3,
  artist: 2,
  junior_artist: 1,
  client: 0,
};
