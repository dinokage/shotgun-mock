import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, FolderOpen, PlayCircle, Calendar,
  GitFork, Workflow, Store, Database,
  History, Bot, Settings2, Package, Film, ListTodo,
  Upload, BarChart3, ChevronLeft, ChevronRight,
  Building2, ChevronDown, Users, MonitorPlay, MessageSquare, Grid3X3, Puzzle, Clock, Boxes
} from 'lucide-react';
import { useUIStore } from '@/store/ui';
import { useWorkspaceStore } from '@/store/workspace';
import { useAuthStore } from '@/store/auth';
import { STUDIOS } from '@/data/mockData';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type NavItem = {
  label: string;
  icon: typeof LayoutDashboard;
  href: string;
  badge?: number;
};

// Base navigation for everyone
const BASE_NAV: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/' },
  { label: 'My Tasks', icon: ListTodo, href: '/tasks' },
  { label: 'Team Chat', icon: MessageSquare, href: '/chat', badge: 3 },
  { label: 'Daily Standup', icon: MonitorPlay, href: '/daily-standup' },
];

// Production & Leadership get scheduling, analytics, projects, etc.
const PROD_NAV: NavItem[] = [
  { label: 'Production Dashboard', icon: LayoutDashboard, href: '/production' },
  { label: 'Projects', icon: FolderOpen, href: '/projects' },
  { label: 'Tracking Grid', icon: Grid3X3, href: '/tracking' },
  { label: 'Scheduling', icon: Calendar, href: '/scheduling' },
  { label: 'Timesheets', icon: Clock, href: '/timesheets' },
  { label: 'Analytics', icon: BarChart3, href: '/analytics' },
  { label: 'Reviews', icon: PlayCircle, href: '/review', badge: 5 },
];

// Artists get specific focus areas
const ARTIST_NAV: NavItem[] = [
  { label: 'My Shots', icon: Film, href: '/shots?mine=1' },
  { label: 'My Assets', icon: Package, href: '/assets?mine=1' },
  { label: 'Timesheets', icon: Clock, href: '/timesheets' },
  { label: 'Reviews', icon: PlayCircle, href: '/review', badge: 2 },
];

// Global directories
const DIRECTORY_NAV: NavItem[] = [
  { label: 'Departments', icon: Building2, href: '/departments' },
  { label: 'Studio Roster', icon: Users, href: '/people' },
];

// System nav
const SYSTEM_NAV: NavItem[] = [
  { label: 'Schema Builder', icon: Boxes, href: '/schema-builder' },
  { label: 'Integrations Hub', icon: Puzzle, href: '/integrations' },
  { label: 'Workflows', icon: Workflow, href: '/workflows' },
  { label: 'Marketplace', icon: Store, href: '/marketplace' },

  { label: 'Time Travel', icon: History, href: '/audit' },
];

export function Sidebar() {
  const [location] = useLocation();
  const { sidebarCollapsed, toggleSidebar, toggleAiAssistant } = useUIStore();
  const { currentStudioId, setStudio } = useWorkspaceStore();
  const { currentUser } = useAuthStore();
  const currentStudio = STUDIOS.find(s => s.id === currentStudioId);

  if (!currentUser) return null;

  const isLeadership = ['vfx_producer', 'production_manager', 'coordinator', 'supervisor', 'lead'].includes(currentUser.role);
  
  const navItems = [
    ...BASE_NAV,
    ...(isLeadership ? PROD_NAV : ARTIST_NAV),
    ...(isLeadership ? DIRECTORY_NAV : [{ label: 'Studio Roster', icon: Users, href: '/people' }]),
    ...(isLeadership ? SYSTEM_NAV : []),
  ];

  return (
    <div
      className={cn(
        "flex-shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col h-full transition-all duration-300 ease-in-out",
        sidebarCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* Workspace Switcher */}
      <div className={cn("p-3 border-b border-sidebar-border", sidebarCollapsed && "px-2")}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={cn(
              "w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-sidebar-accent/50 transition-colors text-left",
              sidebarCollapsed && "justify-center px-0"
            )}>
              <div className="w-7 h-7 rounded-md bg-primary/20 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4 text-primary" />
              </div>
              {!sidebarCollapsed && (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{currentStudio?.name || 'Studio'}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{currentStudio?.region || 'Global'}</div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="start">
            {STUDIOS.map(s => (
              <DropdownMenuItem key={s.id} onClick={() => setStudio(s.id)}>
                <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
                {s.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1 scrollbar-thin">
        {navItems.map((item) => {
          // Compare against the path only — item.href may carry a query string
          // (e.g. artist "My Shots" -> /shots?mine=1) which `location` never includes.
          const itemPath = item.href.split('?')[0];
          const isActive = location === itemPath || (itemPath !== '/' && location.startsWith(itemPath));
          return (
            <Link key={item.label} href={item.href}>
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer relative group",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-[inset_2px_0_0_0_hsl(var(--accent-tally))] hover:bg-sidebar-accent/80"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                  sidebarCollapsed && "justify-center px-2"
                )}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <item.icon className={cn(
                  "w-4 h-4 shrink-0 transition-colors",
                  isActive ? "text-accent-tally" : "text-muted-foreground group-hover:text-sidebar-foreground"
                )} />
                {!sidebarCollapsed && (
                  <span className="flex-1 truncate text-sm">{item.label}</span>
                )}
                {!sidebarCollapsed && item.badge && (
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px] h-4 bg-accent-tally/10 text-accent-tally hover:bg-accent-tally/20">
                    {item.badge}
                  </Badge>
                )}
                {/* Tooltip for collapsed state */}
                {sidebarCollapsed && (
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
      <div className={cn("p-2 border-t border-sidebar-border space-y-0.5", sidebarCollapsed && "px-1")}>
        {isLeadership && (
          <Link href="/settings" className="block">
            <div className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
              sidebarCollapsed && "justify-center px-2",
              location.startsWith('/settings')
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-[inset_2px_0_0_0_hsl(var(--accent-tally))] hover:bg-sidebar-accent/80"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )}>
              <Settings2 className={cn("w-4 h-4 shrink-0 transition-colors", location.startsWith('/settings') && "text-accent-tally")} />
              {!sidebarCollapsed && <span>Settings</span>}
            </div>
          </Link>
        )}

        {/* Collapse Button */}
        <button
          onClick={toggleSidebar}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground/50 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors",
            sidebarCollapsed && "justify-center px-2"
          )}
        >
          {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          {!sidebarCollapsed && <span>Collapse</span>}
        </button>
      </div>
    </div>
  );
}
