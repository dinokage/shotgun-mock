import { motion } from 'framer-motion';
import { useUIStore } from '@/store/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { stagger, dissolve } from '@/lib/motion';

type Shortcut = { keys: string[]; label: string };
type ShortcutSection = { title: string; description?: string; shortcuts: Shortcut[] };

// Every entry here corresponds to a handler that actually exists in the app
// today (AppShell's global listener, or review.tsx's useHotkeys map) — this
// is a cheatsheet, not an aspirational list.
const SECTIONS: ShortcutSection[] = [
  {
    title: 'Global',
    shortcuts: [
      { keys: ['⌘', 'K'], label: 'Open command palette / search' },
      { keys: ['?'], label: 'Show this shortcuts list' },
      { keys: ['Esc'], label: 'Close dialogs and panels' },
    ],
  },
  {
    title: 'Review Player',
    description: 'Active on the Review page',
    shortcuts: [
      { keys: ['Space'], label: 'Play / pause' },
      { keys: ['K'], label: 'Play / pause' },
      { keys: ['←'], label: 'Step back one frame' },
      { keys: ['→'], label: 'Step forward one frame' },
      { keys: ['J'], label: 'Jump back 5 frames' },
      { keys: ['L'], label: 'Jump forward 5 frames' },
      { keys: ['1'], label: 'Select tool' },
      { keys: ['2'], label: 'Pen tool' },
      { keys: ['3'], label: 'Arrow tool' },
      { keys: ['4'], label: 'Rectangle tool' },
      { keys: ['5'], label: 'Text tool' },
      { keys: ['Delete'], label: 'Delete selected annotation' },
      { keys: ['Esc'], label: 'Deselect / switch to select tool' },
    ],
  },
];

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsDialog() {
  const { shortcutsDialogOpen, setShortcutsDialogOpen } = useUIStore();

  return (
    <Dialog open={shortcutsDialogOpen} onOpenChange={setShortcutsDialogOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>Everything you can do without touching the mouse.</DialogDescription>
        </DialogHeader>

        <motion.div {...dissolve} className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <div className="mb-2 flex items-baseline gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </h3>
                {section.description && (
                  <span className="text-[10px] text-muted-foreground/70">{section.description}</span>
                )}
              </div>
              <div className="space-y-1">
                {section.shortcuts.map((shortcut, i) => (
                  <motion.div
                    key={shortcut.label}
                    {...stagger(i)}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                  >
                    <span className="text-foreground/90">{shortcut.label}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      {shortcut.keys.map((key) => (
                        <Kbd key={key}>{key}</Kbd>
                      ))}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
