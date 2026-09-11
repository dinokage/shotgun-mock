// The single definition of what each role may do. Imported by both the
// blank-slate bootstrap and the non-destructive capability sync, so the two
// can never drift apart.
//
// The hierarchy the studio asked for: the admin stands the studio up and
// watches it run but does no production work and has no client contact; the
// production head runs the floor with the admin toolkit on top; the main
// producer is a single studio-wide role that outranks both and is the final
// gate before a client sees anything; the lead is department-scoped; the
// artist is the most limited.
export const ROLE_CAPABILITIES: Record<string, readonly string[]> = {
  // The admin stands the studio up and watches it run: add people, assign
  // roles, manage licenses/integrations, view financials read-only. They do
  // no day-to-day production work -- no tasks, no reviews, no broadcasts, and
  // deliberately no client contact. manage_pipeline is the exception: as the
  // highest role they can restructure the studio's own pipeline (department
  // order, stage configuration, Time Travel rollback) even though they don't
  // work inside it.
  admin: [
    "manage_members",
    "manage_roles",
    "view_financials",
    "manage_licenses",
    "manage_integrations",
    "manage_pipeline",
  ],
  // The production head runs the studio floor: they onboard people, switch
  // extensions on, and redistribute work across departments. That is the
  // admin's toolkit plus production authority, so they hold both sets.
  production_head: [
    "create_tasks",
    "edit_tasks",
    "delete_tasks",
    "assign_tasks",
    "submit_reviews",
    "approve_reviews",
    "view_financials",
    "edit_financials",
    "manage_pipeline",
    "broadcast_updates",
    "manage_members",
    "manage_roles",
    "manage_licenses",
    "manage_integrations",
  ],
  // The single studio-wide main producer is the final gate before anything
  // reaches a client, and outranks the admin: everything the admin can do,
  // plus all production authority.
  producer: [
    "create_tasks",
    "edit_tasks",
    "delete_tasks",
    "assign_tasks",
    "submit_reviews",
    "approve_reviews",
    "view_financials",
    "edit_financials",
    "manage_pipeline",
    "broadcast_updates",
    "manage_members",
    "manage_roles",
    "manage_licenses",
    "manage_integrations",
  ],
  lead: [
    "create_tasks",
    "edit_tasks",
    "assign_tasks",
    "submit_reviews",
    "approve_reviews",
  ],
  artist: ["edit_tasks", "submit_reviews"],
  // submit_reviews is what actually lets a client-access session create a
  // review/annotation (reviews.ts) -- approve_reviews alone gates nothing
  // reachable by the client role once client-access.ts's own link-management
  // routes are correctly locked to internal sessions (denyClientAccess).
  client: ["approve_reviews", "submit_reviews"],
};

