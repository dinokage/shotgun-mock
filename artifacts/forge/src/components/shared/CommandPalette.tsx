import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { useTheme } from 'next-themes';
import { useUIStore } from '@/store/ui';
import { useAuthStore } from '@/store/auth';
import { useProjectStore } from '@/store/projects';
import { useShotStore } from '@/store/shots';
import { useTasksStore } from '@/store/tasks';
import { useToast } from '@/hooks/use-toast';
import { USERS, ASSETS } from '@/data/mockData';
import { stagger, fadeInUp } from '@/lib/motion';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Folder,
  Package,
  Film,
  ListTodo,
  LayoutDashboard,
  PlayCircle,
  Building2,
  Users,
  Bell,
  Settings2,
  Plus,
  Sun,
  Moon,
  Keyboard,
  Clock,
} from 'lucide-react';

const LEADERSHIP_ROLES = ['vfx_producer', 'production_manager', 'coordinator', 'supervisor', 'lead'];
const RESULT_LIMIT = 6;

// Everyday destinations, filtered against the same query as everything else
// so "New Task" or "settings" surfaces a page just as readily as a shot.
const NAV_ITEMS = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'My Tasks', href: '/tasks', icon: ListTodo },
  { label: 'Projects', href: '/projects', icon: Folder },
  { label: 'Shots', href: '/shots', icon: Film },
  { label: 'Assets', href: '/assets', icon: Package },
  { label: 'Review Queue', href: '/review', icon: PlayCircle },
  { label: 'People', href: '/people', icon: Users },
  { label: 'Departments', href: '/departments', icon: Building2 },
  { label: 'Notifications', href: '/notifications', icon: Bell },
  { label: 'Timesheets', href: '/timesheets', icon: Clock },
  { label: 'Settings', href: '/settings', icon: Settings2 },
];

export function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen, setShortcutsDialogOpen, setCreateTaskModalOpen, setActiveTaskDrawer } = useUIStore();
  const { currentUser } = useAuthStore();
  const allProjects = useProjectStore((s) => s.projects);
  const allShots = useShotStore((s) => s.shots);
  const allTasks = useTasksStore((s) => s.tasks);
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState('');

  // Reset search text each time the palette is dismissed so it doesn't
  // reopen mid-search next time.
  useEffect(() => {
    if (!commandPaletteOpen) setQuery('');
  }, [commandPaletteOpen]);

  const isLeadership = !!currentUser && LEADERSHIP_ROLES.includes(currentUser.role);
  const q = query.trim().toLowerCase();

  const nav = useMemo(
    () => (q ? NAV_ITEMS.filter((n) => n.label.toLowerCase().includes(q)) : NAV_ITEMS),
    [q],
  );

  // Entity groups only render once there's a query — with hundreds of
  // tasks/shots/assets in mock data, dumping all of them by default would
  // bury the actions and nav links that matter most on open.
  const projects = useMemo(
    () => (q ? allProjects.filter((p) => p.name.toLowerCase().includes(q)).slice(0, RESULT_LIMIT) : []),
    [q, allProjects],
  );
  const tasks = useMemo(
    () => (q ? allTasks.filter((t) => t.title.toLowerCase().includes(q)).slice(0, RESULT_LIMIT) : []),
    [q, allTasks],
  );
  const shots = useMemo(
    () =>
      q
        ? allShots.filter((s) => s.name.toLowerCase().includes(q) || s.sequence.toLowerCase().includes(q)).slice(0, RESULT_LIMIT)
        : [],
    [q, allShots],
  );
  const assets = useMemo(
    () => (q ? ASSETS.filter((a) => a.name.toLowerCase().includes(q)).slice(0, RESULT_LIMIT) : []),
    [q],
  );
  const people = useMemo(
    () =>
      q
        ? USERS.filter((u) => u.name.toLowerCase().includes(q) || u.title.toLowerCase().includes(q)).slice(0, RESULT_LIMIT)
        : [],
    [q],
  );

  const actions = useMemo(() => {
    const list: { key: string; label: string; icon: typeof Plus; run: () => void }[] = [
      {
        key: 'toggle-theme',
        label: theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme',
        icon: theme === 'dark' ? Sun : Moon,
        run: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      },
      {
        key: 'shortcuts',
        label: 'Keyboard Shortcuts',
        icon: Keyboard,
        run: () => setShortcutsDialogOpen(true),
      },
      {
        key: 'new-project',
        label: 'New Project',
        icon: Plus,
        run: () => {
          setLocation('/projects');
          toast({ title: 'New Project', description: 'Opening project creation wizard...' });
        },
      },
    ];
    if (isLeadership) {
      list.unshift({
        key: 'new-task',
        label: 'New Task',
        icon: Plus,
        run: () => setCreateTaskModalOpen(true),
      });
    }
    return q ? list.filter((a) => a.label.toLowerCase().includes(q)) : list;
  }, [q, theme, isLeadership, setTheme, setShortcutsDialogOpen, setCreateTaskModalOpen, setLocation, toast]);

  const runAndClose = (fn: () => void) => {
    setCommandPaletteOpen(false);
    fn();
  };

  return (
    <CommandDialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} shouldFilter={false}>
      <CommandInput
        placeholder="Search projects, tasks, shots, assets, people..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <motion.div {...fadeInUp}>
          <CommandEmpty>No results for &ldquo;{query}&rdquo;.</CommandEmpty>
        </motion.div>

        {actions.length > 0 && (
          <CommandGroup heading="Actions">
            {actions.map((action, i) => (
              <CommandItem key={action.key} value={action.label} onSelect={() => runAndClose(action.run)}>
                <motion.div {...stagger(i)} className="flex items-center gap-2 w-full">
                  <action.icon className="mr-2 h-4 w-4 text-accent-tally" />
                  <span>{action.label}</span>
                </motion.div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {nav.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Navigate">
              {nav.map((item, i) => (
                <CommandItem
                  key={item.href}
                  value={item.label}
                  onSelect={() => runAndClose(() => setLocation(item.href))}
                >
                  <motion.div {...stagger(i)} className="flex items-center gap-2 w-full">
                    <item.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>{item.label}</span>
                  </motion.div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {projects.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Projects">
              {projects.map((project, i) => (
                <CommandItem
                  key={project.id}
                  value={project.name}
                  onSelect={() => runAndClose(() => setLocation(`/projects/${project.id}`))}
                >
                  <motion.div {...stagger(i)} className="flex items-center gap-2 w-full">
                    <Folder className="mr-2 h-4 w-4 text-blue-500" />
                    <span>{project.name}</span>
                    <Badge variant="outline" className="ml-auto text-[10px] h-4 px-1">
                      {project.status.replace('_', ' ')}
                    </Badge>
                  </motion.div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {tasks.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tasks">
              {tasks.map((task, i) => (
                <CommandItem
                  key={task.id}
                  value={task.title}
                  onSelect={() => runAndClose(() => setActiveTaskDrawer(task.id))}
                >
                  <motion.div {...stagger(i)} className="flex items-center gap-2 w-full">
                    <ListTodo className="mr-2 h-4 w-4 text-orange-500" />
                    <span className="truncate max-w-[280px]">{task.title}</span>
                    <span className="ml-auto text-xs text-muted-foreground shrink-0">{task.status}</span>
                  </motion.div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {shots.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Shots">
              {shots.map((shot, i) => (
                <CommandItem
                  key={shot.id}
                  value={shot.name}
                  onSelect={() => runAndClose(() => setLocation(`/shots/${shot.id}`))}
                >
                  <motion.div {...stagger(i)} className="flex items-center gap-2 w-full">
                    <Film className="mr-2 h-4 w-4 text-purple-500" />
                    <span>{shot.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground shrink-0">{shot.sequence}</span>
                  </motion.div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {assets.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Assets">
              {assets.map((asset, i) => (
                <CommandItem
                  key={asset.id}
                  value={asset.name}
                  onSelect={() => runAndClose(() => setLocation(`/assets/${asset.id}`))}
                >
                  <motion.div {...stagger(i)} className="flex items-center gap-2 w-full">
                    <Package className="mr-2 h-4 w-4 text-amber-500" />
                    <span>{asset.name}</span>
                    <Badge variant="outline" className="ml-auto text-[10px] h-4 px-1 shrink-0">
                      {asset.type}
                    </Badge>
                  </motion.div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {people.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="People">
              {people.map((user, i) => (
                <CommandItem
                  key={user.id}
                  value={`${user.name} ${user.title}`}
                  onSelect={() => runAndClose(() => setLocation(`/people/${user.id}`))}
                >
                  <motion.div {...stagger(i)} className="flex items-center gap-2 w-full">
                    <Avatar className="h-5 w-5 mr-2 shrink-0">
                      <AvatarImage src={user.avatar} />
                      <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span>{user.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground shrink-0">{user.title}</span>
                  </motion.div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
      <div className="flex items-center gap-3 border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <CommandShortcut className="static ml-0 rounded border bg-muted px-1 font-mono">↑↓</CommandShortcut>
          Navigate
        </span>
        <span className="flex items-center gap-1">
          <CommandShortcut className="static ml-0 rounded border bg-muted px-1 font-mono">↵</CommandShortcut>
          Select
        </span>
        <span className="flex items-center gap-1">
          <CommandShortcut className="static ml-0 rounded border bg-muted px-1 font-mono">esc</CommandShortcut>
          Close
        </span>
      </div>
    </CommandDialog>
  );
}
