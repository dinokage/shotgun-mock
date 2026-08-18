import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

import { CommandPalette } from '@/components/shared/CommandPalette';
import { KeyboardShortcutsDialog } from '@/components/shared/KeyboardShortcutsDialog';
import { CreateTaskModal } from '@/components/shared/CreateTaskModal';
import { CreateProjectModal } from '@/components/shared/CreateProjectModal';
import { TaskDrawer } from '@/components/shared/TaskDrawer';
import { useUIStore } from '@/store/ui';
import { useEffect } from 'react';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { commandPaletteOpen, setCommandPaletteOpen, setShortcutsDialogOpen } = useUIStore();

  // App-wide keyboard listeners live here so every screen inherits them.
  //   ⌘K / Ctrl+K → toggle the command palette (works even while typing in
  //   another field, per platform convention for palette launchers).
  //   ?           → open the keyboard-shortcuts cheatsheet, but only outside
  //                 text inputs so a literal "?" can still be typed.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
        return;
      }

      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement;
        const tag = target?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return;
        e.preventDefault();
        setShortcutsDialogOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [commandPaletteOpen, setCommandPaletteOpen, setShortcutsDialogOpen]);

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground flex flex-col">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-y-auto bg-background/50 relative">
          <div className="absolute inset-0 animate-in fade-in zoom-in-95 duration-300 ease-out fill-mode-both">
            {children}
          </div>
        </main>
      </div>

      <CommandPalette />
      <KeyboardShortcutsDialog />
      <TaskDrawer />
      <CreateTaskModal />
      <CreateProjectModal />
    </div>
  );
}
