import { useUIStore } from '@/store/ui';
import { useWorkspaceStore } from '@/store/workspace';
import { CommandDialog, CommandInput, CommandList, CommandGroup, CommandItem, CommandSeparator, CommandEmpty } from '@/components/ui/command';
import { LayoutDashboard, FolderOpen, Package, Film, ListTodo, PlayCircle, Upload, BarChart3, Calendar, GitFork, Workflow, Settings2, Brain, Sun, Moon, Shield, User, Eye, Plus, Search } from 'lucide-react';
import { useLocation } from 'wouter';
import { useTheme } from 'next-themes';
import type { Role } from '@/data/mockData';

export function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen, setSearchOpen } = useUIStore();
  const { setRole } = useWorkspaceStore();
  const [, setLocation] = useLocation();
  const { setTheme, theme } = useTheme();

  const navigate = (href: string) => {
    setLocation(href);
    setCommandPaletteOpen(false);
  };

  const switchRole = (role: Role) => {
    setRole(role);
    setCommandPaletteOpen(false);
  };

  return (
    <CommandDialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => navigate('/')}>
            <LayoutDashboard className="w-4 h-4 mr-2" /> Dashboard
          </CommandItem>
          <CommandItem onSelect={() => navigate('/projects')}>
            <FolderOpen className="w-4 h-4 mr-2" /> Projects
          </CommandItem>
          <CommandItem onSelect={() => navigate('/assets')}>
            <Package className="w-4 h-4 mr-2" /> Assets
          </CommandItem>
          <CommandItem onSelect={() => navigate('/shots')}>
            <Film className="w-4 h-4 mr-2" /> Shots
          </CommandItem>
          <CommandItem onSelect={() => navigate('/tasks')}>
            <ListTodo className="w-4 h-4 mr-2" /> Tasks
          </CommandItem>
          <CommandItem onSelect={() => navigate('/review')}>
            <PlayCircle className="w-4 h-4 mr-2" /> Reviews
          </CommandItem>
          <CommandItem onSelect={() => navigate('/publishing')}>
            <Upload className="w-4 h-4 mr-2" /> Publishing
          </CommandItem>
          <CommandItem onSelect={() => navigate('/analytics')}>
            <BarChart3 className="w-4 h-4 mr-2" /> Analytics
          </CommandItem>
          <CommandItem onSelect={() => navigate('/scheduling')}>
            <Calendar className="w-4 h-4 mr-2" /> Scheduling
          </CommandItem>
          <CommandItem onSelect={() => navigate('/impact')}>
            <GitFork className="w-4 h-4 mr-2" /> Knowledge Graph
          </CommandItem>
          <CommandItem onSelect={() => navigate('/workflows')}>
            <Workflow className="w-4 h-4 mr-2" /> Workflows
          </CommandItem>
          <CommandItem onSelect={() => navigate('/ai-workspace')}>
            <Brain className="w-4 h-4 mr-2" /> AI Workspace
          </CommandItem>
          <CommandItem onSelect={() => navigate('/settings')}>
            <Settings2 className="w-4 h-4 mr-2" /> Settings
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => { setCommandPaletteOpen(false); setSearchOpen(true); }}>
            <Search className="w-4 h-4 mr-2" /> Search Everything
          </CommandItem>
          <CommandItem>
            <Plus className="w-4 h-4 mr-2" /> Create New Task
          </CommandItem>
          <CommandItem>
            <Plus className="w-4 h-4 mr-2" /> Create New Project
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Switch Role">
          <CommandItem onSelect={() => switchRole('manager')}>
            <Shield className="w-4 h-4 mr-2 text-blue-500" /> Switch to Manager
          </CommandItem>
          <CommandItem onSelect={() => switchRole('animator')}>
            <User className="w-4 h-4 mr-2 text-green-500" /> Switch to Animator
          </CommandItem>
          <CommandItem onSelect={() => switchRole('reviewer')}>
            <Eye className="w-4 h-4 mr-2 text-purple-500" /> Switch to Reviewer
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Appearance">
          <CommandItem onSelect={() => { setTheme(theme === 'dark' ? 'light' : 'dark'); setCommandPaletteOpen(false); }}>
            {theme === 'dark' ? <Sun className="w-4 h-4 mr-2" /> : <Moon className="w-4 h-4 mr-2" />}
            Toggle Theme
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
