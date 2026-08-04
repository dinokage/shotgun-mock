import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { 
  House, FolderOpen, PlayCircle, Calendar, 
  GitFork, Workflow, Store, Database, 
  History, Bot, Settings2 
} from 'lucide-react';
import { useUIStore } from '@/store/ui';

const NAV_ITEMS = [
  { label: 'My Work', icon: House, href: '/' },
  { label: 'Projects', icon: FolderOpen, href: '/projects' },
  { label: 'Review', icon: PlayCircle, href: '/review' },
  { label: 'Scheduling', icon: Calendar, href: '/scheduling' },
  { label: 'Knowledge Graph', icon: GitFork, href: '/impact' },
  { label: 'Workflows', icon: Workflow, href: '/workflows' },
  { label: 'Marketplace', icon: Store, href: '/marketplace' },
  { label: 'Schema Builder', icon: Database, href: '/schema' },
  { label: 'Time Travel', icon: History, href: '/audit' },
];

export function Sidebar() {
  const [location] = useLocation();
  const toggleAiAssistant = useUIStore(state => state.toggleAiAssistant);

  return (
    <div className="w-64 flex-shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col h-[calc(100vh-3.5rem)] sticky top-14">
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} className="block">
              <div className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                isActive 
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm" 
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}>
                <item.icon className="w-4 h-4" />
                {item.label}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="p-3 border-t border-sidebar-border space-y-1">
        <button 
          onClick={toggleAiAssistant}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
        >
          <Bot className="w-4 h-4 text-purple-400" />
          AI Assistant
        </button>
        <Link href="/settings" className="block">
          <div className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
            location.startsWith('/settings')
              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm" 
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          )}>
            <Settings2 className="w-4 h-4" />
            Settings
          </div>
        </Link>
      </div>
    </div>
  );
}
