import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

import { GlobalSearch } from '@/components/shared/GlobalSearch';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { CreateTaskModal } from '@/components/shared/CreateTaskModal';
import { TaskDrawer } from '@/components/shared/TaskDrawer';
import { useUIStore } from '@/store/ui';
import { useEffect } from 'react';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { setSearchOpen, setCommandPaletteOpen } = useUIStore();

  // ⌘K keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setSearchOpen, setCommandPaletteOpen]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <TopBar />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 overflow-auto bg-background/50 relative">
          <div className="absolute inset-0 animate-in fade-in zoom-in-95 duration-300 ease-out fill-mode-both">
            {children}
          </div>
        </main>
      </div>

      <GlobalSearch />
      <CommandPalette />
      <TaskDrawer />
      <CreateTaskModal />
    </div>
  );
}
