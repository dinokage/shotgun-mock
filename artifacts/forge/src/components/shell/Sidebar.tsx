import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, FolderOpen, PlayCircle, Calendar,
  GitFork, Workflow, Store, Database,
  History, Bot, Settings2, Package, Film, ListTodo,
  Upload, BarChart3, Brain, ChevronLeft, ChevronRight,
  Sparkles, Building2, ChevronDown, Users, MonitorPlay, MessageSquare, Grid3X3
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
];

// Production & Leadership get scheduling, analytics, projects, etc.
const PROD_NAV: NavItem[] = [
  { label: 'Projects', icon: FolderOpen, href: '/projects' },
  { label: 'Tracking Grid', icon: Grid3X3, href: '/tracking' },
  { label: 'Daily Standup', icon: MonitorPlay, href: '/daily-standup' },
  { label: 'Scheduling', icon: Calendar, href: '/scheduling' },
  { label: 'Analytics', icon: BarChart3, href: '/analytics' },
  { label: 'Reviews', icon: PlayCircle, href: '/review', badge: 5 },
];

// Artists get specific focus areas
const ARTIST_NAV: NavItem[] = [
  { label: 'My Shots', icon: Film, href: '/shots' },
  { label: 'My Assets', icon: Package, href: '/assets' },
  { label: 'Reviews', icon: PlayCircle, href: '/review', badge: 2 },
  { label: 'Publishing', icon: Upload, href: '/publishing' },
];

// Global directories
const DIRECTORY_NAV: NavItem[] = [
  { label: 'Departments', icon: Building2, href: '/departments' },
  { label: 'Studio Roster', icon: Users, href: '/people' },
];

// System nav
const SYSTEM_NAV: NavItem[] = [
  { label: 'Knowledge Graph', icon: GitFork, href: '/impact' },
  { label: 'Workflows', icon: Workflow, href: '/workflows' },
  { label: 'Marketplace', icon: Store, href: '/marketplace' },
  { label: 'Schema Builder', icon: Database, href: '/schema' },
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
        "flex-shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col h-[calc(100vh-3.5rem)] sticky top-14 transition-all duration-300 ease-in-out",
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
              <div className="w-7 h-7 rounded-md bg-primary/20 flex items-center justify-center text-sm shrink-0">
                {currentStudio?.logo || '🌌'}
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
                <span className="mr-2">{s.logo}</span>
                {s.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1 scrollbar-thin">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
          return (
            <Link key={item.label} href={item.href}>
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer relative group",
                  isActive 
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" 
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                  sidebarCollapsed && "justify-center px-2"
                )}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <item.icon className={cn(
                  "w-4 h-4 shrink-0 transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground group-hover:text-sidebar-foreground"
                )} />
                {!sidebarCollapsed && (
                  <span className="flex-1 truncate text-sm">{item.label}</span>
                )}
                {!sidebarCollapsed && item.badge && (
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px] h-4 bg-primary/10 text-primary hover:bg-primary/20">
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
        <button
          onClick={toggleAiAssistant}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors",
            sidebarCollapsed && "justify-center px-2"
          )}
        >
          <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
          {!sidebarCollapsed && <span>AI Assistant</span>}
        </button>
        <Link href="/ai-workspace" className="block">
          <div className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
            sidebarCollapsed && "justify-center px-2",
            location.startsWith('/ai-workspace')
              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          )}>
            <Brain className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && <span>AI Workspace</span>}
          </div>
        </Link>
        <Link href="/settings" className="block">
          <div className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
            sidebarCollapsed && "justify-center px-2",
            location.startsWith('/settings')
              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          )}>
            <Settings2 className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && <span>Settings</span>}
          </div>
        </Link>

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
