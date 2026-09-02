import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderOpen,
  PlayCircle,
  Calendar,
  GitFork,
  Workflow,
  Store,
  Database,
  History,
  Bot,
  Settings2,
  Package,
  Film,
  ListTodo,
  Upload,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Building2,
  Users,
  MonitorPlay,
  MessageSquare,
  Grid3X3,
  Puzzle,
  Clock,
  Boxes,
  DollarSign,
  Truck,
  ShieldCheck,
} from "lucide-react";
import { useUIStore } from "@/store/ui";
import { useWorkspaceStore } from "@/store/workspace";
import { useAuthStore } from "@/store/auth";
import { useTasksStore } from "@/store/tasks";
import { useReviewStore } from "@/store/reviews";
import { useChatGroupsStore } from "@/store/chatGroups";
import { useCapability, useIsLeadership } from "@/hooks/use-capability";
import type { CapabilityId } from "@/store/permissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { STUDIOS, DEPARTMENTS } from "@/data/mockData";
import { DEPARTMENT_LEADERSHIP_ROLES } from "@/store/permissions";
import { canAccessRoute } from "@/lib/roleRouteAccess";
import { Badge } from "@/components/ui/badge";

type NavItem = {
  label: string;
  icon: typeof LayoutDashboard;
  href: string;
  badge?: number;
  capabilities?: CapabilityId[]; // User must have AT LEAST ONE of these to see the item
};

const ALL_NAV: NavItem[] = [
  // Base
  { label: "Dashboard", icon: LayoutDashboard, href: "/" },
  { label: "My Tasks", icon: ListTodo, href: "/tasks" },
  { label: "My Shots", icon: Film, href: "/shots?mine=1" },
  { label: "My Assets", icon: Package, href: "/assets?mine=1" },
  { label: "Team Chat", icon: MessageSquare, href: "/chat" },
  { label: "Daily Standup", icon: MonitorPlay, href: "/daily-standup" },

  // Production
  {
    label: "Production Dashboard",
    icon: LayoutDashboard,
    href: "/production",
    capabilities: ["create_tasks", "manage_pipeline", "view_financials"],
  },
  {
    label: "Projects",
    icon: FolderOpen,
    href: "/projects",
    capabilities: ["create_tasks", "manage_pipeline"],
  },
  {
    label: "Tracking Grid",
    icon: Grid3X3,
    href: "/tracking",
    capabilities: ["create_tasks", "manage_pipeline"],
  },
  {
    label: "Scheduling",
    icon: Calendar,
    href: "/scheduling",
    capabilities: ["assign_tasks", "manage_pipeline"],
  },
  { label: "Timesheets", icon: Clock, href: "/timesheets" },
  {
    label: "Analytics",
    icon: BarChart3,
    href: "/analytics",
    capabilities: ["view_financials", "manage_pipeline"],
  },
  { label: "Reviews", icon: PlayCircle, href: "/review" },
  {
    label: "Publishing",
    icon: Upload,
    href: "/publishing",
    capabilities: ["create_tasks", "manage_pipeline"],
  },
  {
    label: "Deliveries",
    icon: Truck,
    href: "/delivery",
    capabilities: ["manage_pipeline", "create_tasks"],
  },
  {
    label: "Financials",
    icon: DollarSign,
    href: "/financials",
    capabilities: ["view_financials"],
  },

  // Directory
  { label: "Departments", icon: Building2, href: "/departments" },
  { label: "Studio Roster", icon: Users, href: "/people" },

  // System
  {
    label: "Schema Builder",
    icon: Boxes,
    href: "/schema-builder",
    capabilities: ["manage_roles"],
  },
  {
    label: "Integrations Hub",
    icon: Puzzle,
    href: "/integrations",
    capabilities: ["manage_integrations"],
  },
  {
    label: "Workflows",
    icon: Workflow,
    href: "/workflows",
    capabilities: ["manage_pipeline"],
  },
  // Admin-only: canAccessRoute (composed into the navItems filter below)
  // now excludes /marketplace from every role but admin, including
  // production_head, so no per-item capability check is needed here.
  { label: "Marketplace", icon: Store, href: "/marketplace" },
  {
    label: "Time Travel",
    icon: History,
    href: "/audit",
    capabilities: ["manage_roles"],
  },
  {
    label: "Admin Panel",
    icon: ShieldCheck,
    href: "/admin",
    capabilities: ["manage_members"],
  },
];

export function Sidebar() {
  const [location] = useLocation();
  const { sidebarCollapsed, toggleSidebar, mobileNavOpen, setMobileNavOpen } =
    useUIStore();
  const isMobile = useIsMobile();
  const { currentStudioId } = useWorkspaceStore();
  const { currentUser } = useAuthStore();
  const isLeadership = useIsLeadership();
  const tasks = useTasksStore((s) => s.tasks);
  const reviews = useReviewStore((s) => s.reviews);
  const chatGroups = useChatGroupsStore((s) => s.groups);
  const currentStudio = STUDIOS.find((s) => s.id === currentStudioId);

  // The drawer's open/closed flag lives in the global UI store, not local
  // state, so it survives a viewport resize. Without this, opening the
  // drawer on mobile then widening past the breakpoint (desktop layout, no
  // drawer rendered) leaves mobileNavOpen stuck true — narrowing back down
  // would then show the drawer already open, with no tap on the hamburger.
  useEffect(() => {
    if (!isMobile && mobileNavOpen) {
      setMobileNavOpen(false);
    }
  }, [isMobile, mobileNavOpen, setMobileNavOpen]);

  if (!currentUser) return null;

  // Real, store-derived counts — computed the same way the notifications
  // badge in TopBar is: filter live state, don't hand-write a number.
  const teamChatBadge = chatGroups.filter((g) =>
    g.memberIds.includes(currentUser.id),
  ).length;
  const reviewsBadge = isLeadership
    ? // Items awaiting a Lead sign-off across the studio (same status
      // SupervisorDashboard treats as its department review queue).
      tasks.filter((t) => t.status === "lead-review").length
    : // Reviews this artist is waiting on (same query ArtistDashboard uses
      // for its "Reviews Requested" stat).
      reviews.filter(
        (r) => r.reviewerId === currentUser.id && r.status === "pending",
      ).length;

  // "Needs My Review" queue count for department leads/supervisors, scoped
  // the same way tasks.tsx's own needsReviewCount is — so a lead sees the
  // size of their queue on "My Tasks" before they even click into it,
  // instead of discovering it only after filtering the shared task list.
  const isDeptLeadership =
    !!currentUser && DEPARTMENT_LEADERSHIP_ROLES.includes(currentUser.role);
  const myDepartmentName = currentUser
    ? DEPARTMENTS.find((d) => d.id === currentUser.departmentId)?.name
    : undefined;
  const tasksReviewBadge = isDeptLeadership
    ? tasks.filter(
        (t) =>
          (t.status === "review" || t.status === "lead-review") &&
          (!myDepartmentName || t.department === myDepartmentName),
      ).length
    : 0;

  const withBadges = (items: NavItem[]): NavItem[] =>
    items.map((item) => {
      if (item.href === "/chat")
        return { ...item, badge: teamChatBadge || undefined };
      if (item.href === "/review")
        return { ...item, badge: reviewsBadge || undefined };
      if (item.href === "/tasks")
        return { ...item, badge: tasksReviewBadge || undefined };
      return item;
    });

  const hasAnyCapability = (caps?: CapabilityId[]) => {
    if (!caps || caps.length === 0) return true;
    if (currentUser.role === "admin") return true;
    return caps.some((c) => currentUser.capabilities?.includes(c));
  };

  const navItems = withBadges(ALL_NAV).filter(
    (item) =>
      hasAnyCapability(item.capabilities) &&
      // Route-level RBAC: never render a link to a page this role can't
      // reach (Step 3's guard in App.tsx stops direct navigation to it
      // regardless, but a visible dead-end link is bad UX). Strip any
      // query string first (e.g. artist "My Shots" -> /shots?mine=1) since
      // canAccessRoute matches against real paths.
      canAccessRoute(currentUser.role, item.href.split("?")[0]),
  );
  const canViewSettings = hasAnyCapability([
    "manage_roles",
    "manage_members",
    "manage_licenses",
  ]);

  // Shared body for both the permanent desktop column and the mobile
  // off-canvas drawer. `collapsed` only ever applies on desktop — the
  // mobile drawer is always full-width, since the icon-only collapsed mode
  // exists purely to reclaim desktop screen width, which isn't a concern
  // for an overlay drawer. `onNavigate` closes the drawer after a link
  // click on mobile; it's a no-op on desktop.
  function renderBody(collapsed: boolean, onNavigate: () => void) {
    return (
      <>
        {/* Tenant identity. This app is single-tenant per deployment (no
            real multi-tenant switching exists anywhere else in the app),
            so the switcher this used to be — a dropdown listing a static
            STUDIOS mock array — was dead weight. Plain, non-interactive
            display now. */}
        <div
          className={cn(
            "p-3 border-b border-sidebar-border flex items-center gap-2 px-2 py-1.5",
            collapsed && "justify-center px-0",
          )}
        >
          <div className="w-7 h-7 rounded-md bg-primary/20 flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4 text-primary" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">
                {currentStudio?.name || "Studio"}
              </div>
            </div>
          )}
        </div>

        {/* Navigation Links */}
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1 scrollbar-thin">
          {navItems.map((item) => {
            // Compare against the path only — item.href may carry a query string
            // (e.g. artist "My Shots" -> /shots?mine=1) which `location` never includes.
            const itemPath = item.href.split("?")[0];
            const isActive =
              location === itemPath ||
              (itemPath !== "/" && location.startsWith(itemPath));
            return (
              <Link key={item.label} href={item.href} onClick={onNavigate}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer relative group",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-[inset_2px_0_0_0_hsl(var(--accent-tally))] hover:bg-sidebar-accent/80"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                    collapsed && "justify-center px-2",
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon
                    className={cn(
                      "w-4 h-4 shrink-0 transition-colors",
                      isActive
                        ? "text-accent-tally"
                        : "text-muted-foreground group-hover:text-sidebar-foreground",
                    )}
                  />
                  {!collapsed && (
                    <span className="flex-1 truncate text-sm">
                      {item.label}
                    </span>
                  )}
                  {!collapsed && item.badge && (
                    <Badge
                      variant="secondary"
                      className="px-1.5 py-0 text-[10px] h-4 bg-accent-tally/10 text-accent-tally hover:bg-accent-tally/20"
                    >
                      {item.badge}
                    </Badge>
                  )}
                  {/* Tooltip for collapsed state */}
                  {collapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded-md opacity-0 group-hover:opacity-100 pointer-events-none z-50 shadow-md">
                      {item.label}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>

        {/* Bottom Actions */}
        <div
          className={cn(
            "p-2 border-t border-sidebar-border space-y-0.5",
            collapsed && "px-1",
          )}
        >
          {canViewSettings && (
            <Link href="/settings" className="block" onClick={onNavigate}>
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  collapsed && "justify-center px-2",
                  location.startsWith("/settings")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-[inset_2px_0_0_0_hsl(var(--accent-tally))] hover:bg-sidebar-accent/80"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <Settings2
                  className={cn(
                    "w-4 h-4 shrink-0 transition-colors",
                    location.startsWith("/settings") && "text-accent-tally",
                  )}
                />
                {!collapsed && <span>Settings</span>}
              </div>
            </Link>
          )}

          {/* Collapse Button — desktop only; the mobile drawer closes via
              the backdrop or TopBar's menu button instead. */}
          {!isMobile && (
            <button
              onClick={toggleSidebar}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground/50 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors",
                collapsed && "justify-center px-2",
              )}
            >
              {collapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
              {!collapsed && <span>Collapse</span>}
            </button>
          )}
        </div>
      </>
    );
  }

  if (isMobile) {
    return (
      <>
        {mobileNavOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 animate-in fade-in duration-200"
            onClick={() => setMobileNavOpen(false)}
          />
        )}
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-72 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col transition-transform duration-300 ease-in-out",
            mobileNavOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {renderBody(false, () => setMobileNavOpen(false))}
        </div>
      </>
    );
  }

  return (
    <div
      className={cn(
        "flex-shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col h-full transition-all duration-300 ease-in-out",
        sidebarCollapsed ? "w-16" : "w-64",
      )}
    >
      {renderBody(sidebarCollapsed, () => {})}
    </div>
  );
}
