import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useUIStore } from '@/store/ui';
import { USERS, PROJECTS, DEPARTMENTS, ASSETS, SHOTS, TASKS } from '@/data/mockData';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Folder, User, Package, Film, ListTodo, Building2, Search } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

export function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen } = useUIStore();
  const [, setLocation] = useLocation();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  const handleSelect = (callback: () => void) => {
    setCommandPaletteOpen(false);
    callback();
  };

  return (
    <CommandDialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
      <CommandInput placeholder="Type a command or search for anything..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        
        <CommandGroup heading="Projects">
          {PROJECTS.map((project) => (
            <CommandItem
              key={project.id}
              value={project.name}
              onSelect={() => handleSelect(() => setLocation(`/projects/${project.id}`))}
            >
              <Folder className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>{project.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        
        <CommandSeparator />

        <CommandGroup heading="Shots & Assets">
          {SHOTS.slice(0, 10).map((shot) => (
            <CommandItem
              key={shot.id}
              value={shot.name}
              onSelect={() => handleSelect(() => setLocation(`/shots/${shot.id}`))}
            >
              <Film className="mr-2 h-4 w-4 text-purple-500" />
              <span>{shot.name}</span>
              <span className="ml-2 text-xs text-muted-foreground opacity-50">{shot.sequence}</span>
            </CommandItem>
          ))}
          {ASSETS.slice(0, 5).map((asset) => (
            <CommandItem
              key={asset.id}
              value={asset.name}
              onSelect={() => handleSelect(() => setLocation(`/assets/${asset.id}`))}
            >
              <Package className="mr-2 h-4 w-4 text-amber-500" />
              <span>{asset.name}</span>
              <Badge variant="outline" className="ml-auto text-[10px] h-4 px-1">{asset.type}</Badge>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Tasks">
          {TASKS.slice(0, 5).map((task) => (
            <CommandItem
              key={task.id}
              value={task.title}
              onSelect={() => handleSelect(() => setLocation(`/tasks`))} // Typically this would open a task drawer or specific page
            >
              <ListTodo className="mr-2 h-4 w-4 text-blue-500" />
              <span className="truncate max-w-[250px]">{task.title}</span>
              <span className="ml-auto text-xs text-muted-foreground">{task.department}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />
        
        <CommandGroup heading="People & Departments">
          {USERS.map((user) => (
            <CommandItem
              key={user.id}
              value={`${user.name} ${user.title}`}
              onSelect={() => handleSelect(() => setLocation(`/people/${user.id}`))}
            >
              <Avatar className="h-5 w-5 mr-2">
                <AvatarImage src={user.avatar} />
                <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <span>{user.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">{user.title}</span>
            </CommandItem>
          ))}
          {DEPARTMENTS.map((dept) => (
            <CommandItem
              key={dept.id}
              value={dept.name}
              onSelect={() => handleSelect(() => setLocation(`/departments/${dept.id}`))}
            >
              <Building2 className="mr-2 h-4 w-4 text-green-500" />
              <span>{dept.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>

      </CommandList>
    </CommandDialog>
  );
}
