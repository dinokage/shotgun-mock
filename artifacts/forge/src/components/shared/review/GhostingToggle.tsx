import { Ghost } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface GhostingToggleProps {
  active: boolean;
  onToggle: () => void;
  /** Visual variant — the client portal uses a darker/zinc palette than the internal app. */
  variant?: 'internal' | 'client';
  className?: string;
}

/**
 * Toggle for real motion-persistence "Ghosting": when on, the {@link
 * AnnotationCanvas} fades recently-ended shape annotations back in for a few
 * frames instead of dropping them outright. Distinct from the internal-only
 * "Onion Skinning" toggle (a flat-opacity edge fade), and available to both
 * the internal review player and the client review portal.
 */
export function GhostingToggle({ active, onToggle, variant = 'internal', className }: GhostingToggleProps) {
  const isClient = variant === 'client';
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onToggle}
      title="Toggle Ghosting (annotation motion trail)"
      aria-label="Toggle Ghosting"
      aria-pressed={active}
      className={cn(
        isClient && 'text-zinc-300 hover:text-white hover:bg-white/10',
        active && (isClient ? 'bg-white/10 text-emerald-400' : 'text-primary bg-primary/10'),
        className,
      )}
    >
      <Ghost className="w-4 h-4" />
    </Button>
  );
}
