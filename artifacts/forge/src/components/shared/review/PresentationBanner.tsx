import { motion, AnimatePresence } from 'framer-motion';
import { Radio, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PresentationToggleProps {
  isPresenting: boolean;
  onStart: () => void;
  onStop: () => void;
  variant?: 'internal' | 'client';
  className?: string;
}

/**
 * Toggle for the presenter to start/stop broadcasting their playhead to
 * every other viewer on the same version. Only ever rendered for the
 * internal review player — the client portal never presents.
 */
export function PresentationToggle({ isPresenting, onStart, onStop, variant = 'internal', className }: PresentationToggleProps) {
  const isClient = variant === 'client';
  return (
    <Button
      size="sm"
      variant={isPresenting ? 'default' : 'outline'}
      className={cn(
        'gap-2 transition-colors duration-300',
        isPresenting && (isClient ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-transparent' : 'bg-primary text-primary-foreground hover:bg-primary/90'),
        className,
      )}
      onClick={() => (isPresenting ? onStop() : onStart())}
    >
      <motion.span
        key={isPresenting ? 'on' : 'off'}
        className="flex items-center gap-2"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <Radio className={cn('w-4 h-4', isPresenting && 'animate-pulse')} />
        {isPresenting ? 'Presenting — Stop' : 'Present to Reviewers'}
      </motion.span>
    </Button>
  );
}

interface PresentationLockBannerProps {
  show: boolean;
  presenterName: string | null;
  frame: number;
  maxFrames: number;
  variant?: 'internal' | 'client';
  className?: string;
}

/**
 * "Presentation Mode — locked to presenter" indicator for viewers whose
 * playhead is currently being driven by someone else. Always mount this
 * component and toggle `show` — it manages its own enter/exit animation via
 * AnimatePresence so parents don't need to conditionally render it.
 */
export function PresentationLockBanner({ show, presenterName, frame, maxFrames, variant = 'internal', className }: PresentationLockBannerProps) {
  const isClient = variant === 'client';
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="presentation-lock-banner"
          initial={{ opacity: 0, y: -10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.97 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium backdrop-blur shadow-lg',
            isClient ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-primary/10 border-primary/30 text-primary',
            className,
          )}
        >
          <Lock className="w-3.5 h-3.5 shrink-0" />
          <span>
            Presentation Mode — locked to {presenterName ?? 'presenter'}{' '}
            <span className="opacity-60 font-mono">
              (frame {String(frame).padStart(3, '0')}/{maxFrames})
            </span>
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
