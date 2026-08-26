import {
  Bell,
  Search,
  Sun,
  Moon,
  User,
  Shield,
  Eye,
  ChevronDown,
  Building2,
  LogOut,
  Menu,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DEPARTMENTS, ROLE_LABELS } from "@/data/mockData";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import { useNotificationStore } from "@/store/notifications";
import { useWorkspaceStore } from "@/store/workspace";
import { useCapability } from "@/hooks/use-capability";
import { useDepartmentScope } from "@/hooks/useDepartmentScope";
import { DEPARTMENT_LEADERSHIP_ROLES } from "@/store/permissions";
import { Link, useLocation } from "wouter";
import { TimeClockWidget } from "@/components/shared/TimeClockWidget";
import { USERS } from "@/data/mockData";

export function TopBar() {
  const { setTheme, resolvedTheme } = useTheme();
  const {
    setCommandPaletteOpen,
    notificationPanelOpen,
    setNotificationPanelOpen,
    setCreateTaskModalOpen,
    toggleMobileNav,
  } = useUIStore();
  const { currentUser, logout } = useAuthStore();
  const { activeDepartmentId, setActiveDepartment } = useWorkspaceStore();
  const canAssignTasks = useCapability("assign_tasks");
  const isUnscoped = useDepartmentScope().scoped === false;
  const [, setLocation] = useLocation();
  const notifications = useNotificationStore((s) => s.notifications);
  const notificationPreferences = useNotificationStore((s) => s.preferences);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  // Muted categories (see Settings > Notifications) are hidden here too, same as the full notifications page.
  const visibleNotifs = notifications.filter(
    (n) => notificationPreferences[n.category]?.push !== false,
  );
  const unreadNotifs = visibleNotifs.filter((n) => !n.read).length;

  if (!currentUser) return null;

  // Global roles can scope their view to a single department via the
  // switcher below (persisted in the workspace store); everyone else always
  // sees their own department. activeDepartmentId is a standalone store, not
  // reset on switchUser, so it must stay gated on role here — otherwise a
  // producer's department filter would leak into whichever department badge
  // renders next after switching to a non-global-role demo user.
  const isGlobalRole = isUnscoped;
  const dept = DEPARTMENTS.find(
    (d) =>
      d.id ===
      (isGlobalRole
        ? (activeDepartmentId ?? currentUser.departmentId)
        : currentUser.departmentId),
  );

  const handleLogout = () => {
    logout();
    setLocation("/login");
  };

  return (
    <header className="h-14 shrink-0 border-b border-border bg-card/80 backdrop-blur-md z-50 flex items-center justify-between px-4 w-full">
      {/* Left: Brand + Role */}
      <div className="flex items-center gap-3 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden h-8 w-8 -ml-1"
          onClick={toggleMobileNav}
          aria-label="Toggle navigation menu"
        >
          <Menu className="w-5 h-5" />
        </Button>

        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
            <div className="w-3.5 h-3.5 bg-card rounded-sm" />
          </div>
          <span className="font-bold text-lg tracking-tight hidden md:inline">
            Forge
          </span>
        </Link>

        <div className="h-5 w-px bg-border hidden md:block" />

        {/* Current User Role/Dept/Tenant Switcher */}
        {isGlobalRole ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border border-accent-tally/30 bg-accent-tally/10 text-xs shadow-sm transition-all hover:shadow-md hover:border-accent-tally/50 shrink-0 outline-none text-accent-tally">
                <Building2 className="w-3.5 h-3.5 shrink-0 text-accent-tally" />
                <span className="font-semibold truncate">
                  {ROLE_LABELS[currentUser.role] || currentUser.title}
                </span>
                <span className="opacity-50 shrink-0">•</span>
                <span className="font-medium opacity-90 shrink-0">
                  {dept ? dept.abbreviation : "All Depts"}
                </span>
                <ChevronDown className="w-3 h-3 ml-1 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuLabel>Switch Department</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setActiveDepartment(null)}
                className={`cursor-pointer font-medium ${activeDepartmentId === null ? "bg-primary/10" : ""}`}
              >
                Global Overview
              </DropdownMenuItem>
              {DEPARTMENTS.map((d) => (
                <DropdownMenuItem
                  key={d.id}
                  onClick={() => setActiveDepartment(d.id)}
                  className={`cursor-pointer ${activeDepartmentId === d.id ? "bg-primary/10" : ""}`}
                >
                  {d.name} ({d.abbreviation})
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div
            className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs shadow-sm transition-all shrink-0 ${
              DEPARTMENT_LEADERSHIP_ROLES.includes(currentUser.role)
                ? "bg-accent-tally/10 border-accent-tally/20 text-accent-tally"
                : "bg-muted/50 border-border text-muted-foreground"
            }`}
          >
            <Shield
              className={`w-3.5 h-3.5 shrink-0 ${DEPARTMENT_LEADERSHIP_ROLES.includes(currentUser.role) ? "text-accent-tally" : "text-muted-foreground"}`}
            />
            <span className="font-semibold truncate">
              {ROLE_LABELS[currentUser.role] || currentUser.title}
            </span>
            {dept && (
              <>
                <span className="opacity-40 shrink-0">•</span>
                <span className="font-medium opacity-90 shrink-0">
                  {dept.abbreviation}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Center: Search */}
      <div className="flex-1 max-w-md relative mx-4 min-w-0 overflow-hidden hidden md:block">
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className="w-full flex items-center gap-2 px-3 py-1.5 bg-muted/50 border border-transparent rounded-lg text-sm text-muted-foreground hover:bg-muted hover:border-border transition-all min-w-0 overflow-hidden"
        >
          <Search className="w-4 h-4 shrink-0" />
          <span className="text-left flex-1 truncate min-w-0">
            Search projects, assets, tasks...
          </span>
          <kbd className="hidden lg:inline-flex shrink-0 h-5 items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 shrink-0 ml-auto justify-end">
        {canAssignTasks && (
          <Button
            onClick={() => setCreateTaskModalOpen(true)}
            className="hidden md:flex bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-full px-5 text-xs h-8 mr-2 transition-all shadow-[0_0_20px_hsl(var(--primary)/0.35)]"
          >
            Assign Task
          </Button>
        )}

        <TimeClockWidget />

        {/* Theme Toggle. `resolvedTheme` (not `theme`) so this reflects what's
            actually on screen — the provider now defaults to 'system', under
            which `theme` stays the literal string 'system' until the user
            overrides it, which would otherwise mismatch the icon/toggle
            against a dark OS preference. */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={
            resolvedTheme === "dark"
              ? "Switch to light theme"
              : "Switch to dark theme"
          }
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          {resolvedTheme === "dark" ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </Button>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative h-8 w-8"
              aria-label={`Notifications, ${unreadNotifs} unread`}
            >
              <Bell className="w-4 h-4" />
              {unreadNotifs > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive text-[10px] font-bold text-destructive-foreground rounded-full flex items-center justify-center animate-in zoom-in">
                  {unreadNotifs > 9 ? "9+" : unreadNotifs}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-80 max-h-96 overflow-y-auto"
          >
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Notifications</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-muted-foreground"
                disabled={unreadNotifs === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  markAllAsRead();
                }}
              >
                Mark all read
              </Button>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {visibleNotifs.slice(0, 10).map((notif) => (
              <DropdownMenuItem
                key={notif.id}
                className="flex-col items-start gap-1 py-3 cursor-pointer"
                onSelect={(e) => {
                  e.preventDefault();
                  if (!notif.read) markAsRead(notif.id);
                }}
              >
                <div className="flex items-center gap-2 w-full">
                  {!notif.read && (
                    <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                  )}
                  <span
                    className={`font-medium text-sm ${notif.read ? "text-muted-foreground" : ""}`}
                  >
                    {notif.title}
                  </span>
                  <Badge
                    variant="outline"
                    className="ml-auto text-[9px] h-4 px-1 capitalize"
                  >
                    {notif.category}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground pl-4 line-clamp-2">
                  {notif.description}
                </p>
                <span className="text-[10px] text-muted-foreground/60 pl-4">
                  {notif.timestamp}
                </span>
              </DropdownMenuItem>
            ))}
            {visibleNotifs.length === 0 && (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                No notifications.
              </div>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="justify-center text-primary">
              <Link href="/notifications">View all notifications</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="relative h-8 w-8 rounded-full ml-1"
            >
              <Avatar className="h-8 w-8 border border-border">
                <AvatarImage src={currentUser.avatar} alt={currentUser.name} />
                <AvatarFallback>{currentUser.name.charAt(0)}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">
                  {currentUser.name}
                </p>
                <p className="text-[10px] leading-none text-muted-foreground">
                  {ROLE_LABELS[currentUser.role] || currentUser.title}
                </p>
                {dept && (
                  <p className="text-[10px] leading-none text-muted-foreground mt-1">
                    {dept.name}
                  </p>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile">Profile</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings">Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-red-500 cursor-pointer flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
