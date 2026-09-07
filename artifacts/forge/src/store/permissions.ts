import { create } from "zustand";
import { persist } from "zustand/middleware";
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
    description: "Permanently remove tasks.",
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
    description: "Modify budgets, bids, and cost allocations.",
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

export const ROLES_ORDER: Role[] = [
  "admin",
  "production_head",
  "producer",
  "lead",
  "artist",
  "client",
];

// Single source of truth for "leadership" routes/UI (previously redeclared
// independently in ~12 files, which let them drift out of sync with each
// other and with the capability scheme below). Prefer useCapability() from
// src/hooks/use-capability.ts for gating a specific action; reach for
// LEADERSHIP_ROLES / useIsLeadership() only for coarse "is this person
// studio leadership" checks that aren't really about one capability.
export const LEADERSHIP_ROLES: Role[] = [
  "admin",
  "production_head",
  "producer",
  "lead",
];

// Finer-grained subsets of LEADERSHIP_ROLES for the handful of places that
// need to distinguish "studio-wide" leadership (can act across every
// department) from "department-scoped" leadership (producer/lead, act
// within their own department only) — e.g. who a task can be assigned to,
// or which dashboard variant renders.
export const STUDIO_LEADERSHIP_ROLES: Role[] = ["admin", "production_head"];
export const DEPARTMENT_LEADERSHIP_ROLES: Role[] = ["producer", "lead"];

export type PermissionScheme = Record<Role, Record<CapabilityId, boolean>>;

function caps(
  overrides: Partial<Record<CapabilityId, boolean>>,
): Record<CapabilityId, boolean> {
  const base = Object.fromEntries(
    CAPABILITY_IDS.map((id) => [id, false]),
  ) as Record<CapabilityId, boolean>;
  return { ...base, ...overrides };
}

export const DEFAULT_PERMISSION_SCHEME: PermissionScheme = {
  // The admin doesn't do production work -- no tasks, no reviews, no
  // broadcasts, no pipeline/financials edits. Their job is standing the
  // studio up and watching it run: add people, assign roles, manage
  // licenses/integrations (the Marketplace is admin-only elsewhere in the
  // app for the same reason), and view financials read-only. They still
  // see every page (LEADERSHIP_ROLES/STUDIO_LEADERSHIP_ROLES above keep
  // "admin" for that) -- this only removes write actions.
  admin: caps({
    manage_members: true,
    manage_roles: true,
    view_financials: true,
    manage_licenses: true,
    manage_integrations: true,
  }),
  production_head: caps({
    create_tasks: true,
    edit_tasks: true,
    delete_tasks: true,
    assign_tasks: true,
    submit_reviews: true,
    approve_reviews: true,
    view_financials: true,
    edit_financials: true,
    manage_pipeline: true,
    broadcast_updates: true,
  }),
  producer: caps({
    create_tasks: true,
    edit_tasks: true,
    assign_tasks: true,
    submit_reviews: true,
    approve_reviews: true,
    manage_pipeline: true,
    broadcast_updates: true,
  }),
  lead: caps({
    create_tasks: true,
    edit_tasks: true,
    assign_tasks: true,
    submit_reviews: true,
    approve_reviews: true,
  }),
  artist: caps({
    edit_tasks: true,
    submit_reviews: true,
  }),
  client: caps({
    approve_reviews: true,
  }),
};

// --- Lockout safeguard ---------------------------------------------------------
//
// If a save results in zero roles holding `manage_roles`, nobody in the studio
// would ever be able to open the Roles & Permissions matrix again (it's the
// capability that gates the matrix itself, including "Reset to Defaults"). This
// is the standard "can't remove the last admin" rule, applied to role schemes
// instead of individual users.

export function schemeHasRoleManager(scheme: PermissionScheme): boolean {
  return ROLES_ORDER.some((role) => scheme[role]?.manage_roles === true);
}

export const PERMISSION_LOCKOUT_ERROR =
  "At least one role must keep Manage Roles & Permissions access, or no one will be able to change permissions again.";

export type SaveSchemeResult = { ok: true } | { ok: false; error: string };

interface PermissionsState {
  scheme: PermissionScheme;
  lastUpdated: string | null;
  updatedBy: string | null;
  saveScheme: (
    scheme: PermissionScheme,
    updatedByName?: string,
  ) => SaveSchemeResult;
  resetToDefaults: () => void;
}

export const usePermissionsStore = create<PermissionsState>()(
  persist(
    (set) => ({
      scheme: DEFAULT_PERMISSION_SCHEME,
      lastUpdated: null,
      updatedBy: null,
      saveScheme: (scheme, updatedByName) => {
        // Enforced here, in the store, rather than only in the UI, so this
        // guard can't be bypassed by any future caller of saveScheme.
        if (!schemeHasRoleManager(scheme)) {
          return { ok: false, error: PERMISSION_LOCKOUT_ERROR };
        }
        set({
          scheme,
          lastUpdated: new Date().toISOString(),
          updatedBy: updatedByName ?? null,
        });
        return { ok: true };
      },
      resetToDefaults: () =>
        set({
          scheme: DEFAULT_PERMISSION_SCHEME,
          lastUpdated: new Date().toISOString(),
          updatedBy: "System (reset to defaults)",
        }),
    }),
    {
      name: "forge-permissions-storage",
      version: 3,
      migrate(persistedState: unknown, fromVersion: number) {
        if (fromVersion < 3) {
          // The role set itself changed (9 roles -> 6); an old persisted
          // scheme has no entries for the new role keys at all, so there is
          // nothing meaningful to migrate forward — reset to defaults.
          return {
            scheme: DEFAULT_PERMISSION_SCHEME,
            lastUpdated: null,
            updatedBy: null,
          } as PermissionsState;
        }
        return persistedState as PermissionsState;
      },
    },
  ),
);
