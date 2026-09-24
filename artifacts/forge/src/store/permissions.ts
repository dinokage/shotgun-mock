import { Role } from "@/data/mockData";

// --- Capability catalogue ----------------------------------------------------

export const CAPABILITY_IDS = [
  "create_tasks",
  "edit_tasks",
  "delete_tasks",
  "assign_tasks",
  "submit_reviews",
  "approve_reviews",
  "manage_members",
  "manage_roles",
  "view_financials",
  "edit_financials",
  "manage_pipeline",
  "manage_licenses",
  "manage_integrations",
  "broadcast_updates",
] as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[number];

export interface Capability {
  id: CapabilityId;
  label: string;
  description: string;
  category: string;
}

export const CAPABILITIES: Capability[] = [
  {
    id: "create_tasks",
    label: "Create Tasks",
    description: "Add new tasks to a project pipeline.",
    category: "Tasks",
  },
  {
    id: "edit_tasks",
    label: "Edit Tasks",
    description: "Modify task details, dates, and status.",
    category: "Tasks",
  },
  {
    id: "delete_tasks",
    label: "Delete Tasks",
    description:
      "Permanently remove tasks. Not enforced yet — there is no task-deletion feature in the app for this to gate.",
    category: "Tasks",
  },
  {
    id: "assign_tasks",
    label: "Assign Tasks",
    description: "Assign or reassign tasks to other members.",
    category: "Tasks",
  },
  {
    id: "submit_reviews",
    label: "Submit for Review",
    description: "Push a version into the review queue.",
    category: "Reviews",
  },
  {
    id: "approve_reviews",
    label: "Approve Reviews",
    description: "Approve or request changes on a submission.",
    category: "Reviews",
  },
  {
    id: "manage_members",
    label: "Manage Members",
    description: "Invite, remove, or edit studio members.",
    category: "Team & Access",
  },
  {
    id: "manage_roles",
    label: "Manage Roles & Permissions",
    description: "Edit this permission scheme itself.",
    category: "Team & Access",
  },
  {
    id: "view_financials",
    label: "View Financials",
    description: "See budgets, bids, and cost reports.",
    category: "Financials",
  },
  {
    id: "edit_financials",
    label: "Edit Budgets",
    description:
      "Modify budgets, bids, and cost allocations. Not enforced yet — there is no budget-editing feature in the app for this to gate.",
    category: "Financials",
  },
  {
    id: "manage_pipeline",
    label: "Manage Pipelines",
    description: "Add or reorder department pipeline stages.",
    category: "Studio Ops",
  },
  {
    id: "manage_licenses",
    label: "Manage Licenses",
    description: "Add license servers and adjust seat counts.",
    category: "Studio Ops",
  },
  {
    id: "manage_integrations",
    label: "Manage API & Integrations",
    description: "Create API tokens and webhook endpoints.",
    category: "Studio Ops",
  },
  {
    id: "broadcast_updates",
    label: "Broadcast Status Updates",
    description:
      "Post studio-wide or project status updates to teams and, optionally, the client portal.",
    category: "Studio Ops",
  },
];

export const CAPABILITY_CATEGORIES = Array.from(
  new Set(CAPABILITIES.map((c) => c.category)),
);

// --- Role scheme --------------------------------------------------------------

export const ROLES_ORDER: Role[] = ["admin", "lead", "artist", "client"];

// Single source of truth for "leadership" routes/UI (previously redeclared
// independently in ~12 files, which let them drift out of sync with each
// other and with the capability scheme below). Prefer useCapability() from
// src/hooks/use-capability.ts for gating a specific action; reach for
// LEADERSHIP_ROLES / useIsLeadership() only for coarse "is this person
// studio leadership" checks that aren't really about one capability.
export const LEADERSHIP_ROLES: Role[] = ["admin", "lead"];

// Finer-grained subsets of LEADERSHIP_ROLES for the handful of places that
// need to distinguish "studio-wide" leadership (can act across every
// department) from "department-scoped" leadership (the lead, acting within
// their own department only) — e.g. who a task can be assigned to, or which
// dashboard variant renders.
//
// Must match STUDIO_WIDE_ROLES in api-server/src/lib/visibilityScope.ts.
// Admin is the single studio-wide final reviewer (migration 0023 folded the
// former separate production_head/producer roles into it): the API already
// sends them every department's data, and review.tsx already keeps them out
// of the department lead gate. Listing them as department leadership here
// narrowed that studio-wide data back down to one department in the UI.
export const STUDIO_LEADERSHIP_ROLES: Role[] = ["admin"];
export const DEPARTMENT_LEADERSHIP_ROLES: Role[] = ["lead"];
