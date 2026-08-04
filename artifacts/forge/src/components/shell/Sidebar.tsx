import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, FolderOpen, PlayCircle, Calendar,
  GitFork, Workflow, Store, Database,
  History, Bot, Settings2, Package, Film, ListTodo,
  Upload, BarChart3, Brain, ChevronLeft, ChevronRight,
  Sparkles, Building2, ChevronDown,
} from 'lucide-react';
import { useUIStore } from '@/store/ui';
import { useWorkspaceStore } from '@/store/workspace';
import { STUDIOS } from '@/data/mockData';
import type { Role } from '@/data/mockData';
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
  roles?: Role[];
};

const MANAGER_NAV: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/' },
  { label: 'Projects', icon: FolderOpen, href: '/projects' },
  { label: 'Assets', icon: Package, href: '/assets' },
  { label: 'Shots', icon: Film, href: '/shots' },
  { label: 'Tasks', icon: ListTodo, href: '/tasks', badge: 12 },
  { label: 'Reviews', icon: PlayCircle, href: '/review', badge: 5 },
  { label: 'Publishing', icon: Upload, href: '/publishing', badge: 3 },
  { label: 'Scheduling', icon: Calendar, href: '/scheduling' },
  { label: 'Knowledge Graph', icon: GitFork, href: '/impact' },
  { label: 'Workflows', icon: Workflow, href: '/workflows' },
  { label: 'Analytics', icon: BarChart3, href: '/analytics' },
  { label: 'Marketplace', icon: Store, href: '/marketplace' },
  { label: 'Schema Builder', icon: Database, href: '/schema' },
  { label: 'Time Travel', icon: History, href: '/audit' },
];

const ANIMATOR_NAV: NavItem[] = [
  { label: 'My Work', icon: LayoutDashboard, href: '/' },
  { label: 'Projects', icon: FolderOpen, href: '/projects' },
  { label: 'My Shots', icon: Film, href: '/shots' },
  { label: 'My Assets', icon: Package, href: '/assets' },
  { label: 'My Tasks', icon: ListTodo, href: '/tasks', badge: 8 },
  { label: 'Reviews', icon: PlayCircle, href: '/review', badge: 2 },
  { label: 'Publishing', icon: Upload, href: '/publishing' },
  { label: 'Knowledge Graph', icon: GitFork, href: '/impact' },
  { label: 'Workflows', icon: Workflow, href: '/workflows' },
];

const REVIEWER_NAV: NavItem[] = [
  { label: 'Review Queue', icon: LayoutDashboard, href: '/' },
  { label: 'Projects', icon: FolderOpen, href: '/projects' },
  { label: 'Reviews', icon: PlayCircle, href: '/review', badge: 9 },
  { label: 'Assets', icon: Package, href: '/assets' },
  { label: 'Shots', icon: Film, href: '/shots' },
  { label: 'Analytics', icon: BarChart3, href: '/analytics' },
  { label: 'Knowledge Graph', icon: GitFork, href: '/impact' },
];

const NAV_MAP: Record<Role, NavItem[]> = {
  manager: MANAGER_NAV,
  animator: ANIMATOR_NAV,
  reviewer: REVIEWER_NAV,
};

export function Sidebar() {
  const [location] = useLocation();
  const { sidebarCollapsed, toggleSidebar, toggleAiAssistant } = useUIStore();
  const { currentRole, currentStudioId, setStudio } = useWorkspaceStore();
  const navItems = NAV_MAP[currentRole];
  const currentStudio = STUDIOS.find(s => s.id === currentStudioId);

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
                    <div className="text-sm font-medium truncate">{currentStudio?.name}</div>
                    <div className="text-[10px] text-sidebar-foreground/50">{currentStudio?.region}</div>
                  </div>
                  <ChevronDown className="w-3 h-3 text-sidebar-foreground/50 shrink-0" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            {STUDIOS.map(studio => (
              <DropdownMenuItem key={studio.id} onClick={() => setStudio(studio.id)} className="gap-2">
                <span className="text-sm">{studio.logo}</span>
                <div>
                  <div className="font-medium text-sm">{studio.name}</div>
                  <div className="text-xs text-muted-foreground">{studio.region}</div>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
          return (
            <Link key={item.href + item.label} href={item.href} className="block">
              <div className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-200",
                sidebarCollapsed && "justify-center px-2",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}>
                <item.icon className="w-4 h-4 shrink-0" />
                {!sidebarCollapsed && (
                  <>
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px] font-bold bg-primary/15 text-primary">
                        {item.badge}
                      </Badge>
                    )}
                  </>
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
