import type { Role } from "@/data/mockData";

// Route inventory cross-referenced against App.tsx's real protected route
// table (everything rendered inside AuthGuard/AppShell). Detail sub-routes
// (e.g. /projects/:id, /shots/:id) aren't listed separately — canAccessRoute
// treats each entry as a prefix, so granting the parent path also grants its
// sub-routes.
//
// Tiers, per the plan's rule:
//  - BASE: every role, including collaboration/day-to-day tools that carry
//    no existing capability or leadership restriction (Shots, Assets, Daily
//    Standup, Timesheets, Reviews, Team Chat, Notifications, Studio Roster)
//    — these are scoped to "my own work" per-role at the data layer (query
//    params + server-side enforcement, and — for Studio Roster — the page's
//    own artist/lead-scoped visibility), not by page-reachability.
//  - PRODUCER/LEAD: department- and studio-production-management pages
//    (mirrors the existing LeadershipGuard-wrapped routes that aren't
//    system-configuration pages).
//  - ADMIN/PRODUCTION_HEAD: studio-wide system administration pages
//    (Admin Panel, Workflows, Schema Builder, Time Travel Audit,
//    Integrations Hub).
//  - CLIENT: none — the client role never authenticates into the main app;
//    it only reaches the public /client-review access-link flow, outside
//    AuthGuard entirely.

const BASE_ROUTES = [
  "/",
  "/tasks",
  "/profile",
  "/settings",
  "/notifications",
  "/shots",
  "/assets",
  "/daily-standup",
  "/timesheets",
  "/review",
  "/chat",
  "/people",
];

const PRODUCTION_MANAGEMENT_ROUTES = [
  "/production",
  "/tracking",
  "/scheduling",
  "/departments",
  "/delivery",
  "/publishing",
  "/analytics",
  "/projects",
  "/financials",
];

const STUDIO_ADMIN_ROUTES = [
  "/admin",
  "/workflows",
  "/schema-builder",
  "/audit",
  "/integrations",
];

// Admin-only: the plugin/tool marketplace. Unlike every other
// studio-admin-tier route, this one is NOT shared with production_head —
// only admin decides plugin/tool access.
const ADMIN_ONLY_ROUTES = ["/marketplace"];

export const ROLE_ALLOWED_ROUTES: Record<Role, string[]> = {
  artist: [...BASE_ROUTES],
  producer: [...BASE_ROUTES, ...PRODUCTION_MANAGEMENT_ROUTES],
  lead: [...BASE_ROUTES, ...PRODUCTION_MANAGEMENT_ROUTES],
  production_head: [
    ...BASE_ROUTES,
    ...PRODUCTION_MANAGEMENT_ROUTES,
    ...STUDIO_ADMIN_ROUTES,
  ],
  admin: [
    ...BASE_ROUTES,
    ...PRODUCTION_MANAGEMENT_ROUTES,
    ...STUDIO_ADMIN_ROUTES,
    ...ADMIN_ONLY_ROUTES,
  ],
  client: [],
};

export function canAccessRoute(role: Role, path: string): boolean {
  const allowed = ROLE_ALLOWED_ROUTES[role] ?? [];
  return allowed.some((p) => path === p || path.startsWith(p + "/"));
}
