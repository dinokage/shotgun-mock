import { CheckCircle2, Circle, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Mirrors the approval chain modeled in store/tasks.ts
 * (not-started/todo/in-progress -> review/lead-review -> manager-review -> approved),
 * so this stays correct automatically if that pipeline changes shape rather
 * than needing a second source of truth.
 */
const STAGES = [
  { key: 'submitted', label: 'Submitted', statuses: ['not-started', 'todo', 'in-progress', 'changes-requested', 'bottleneck'] },
  { key: 'lead-review', label: 'Lead Review', statuses: ['review', 'lead-review'] },
  { key: 'manager-review', label: 'Manager Review', statuses: ['manager-review'] },
  { key: 'approved', label: 'Approved', statuses: ['approved', 'complete'] },
] as const;

function stageIndexForStatus(status: string): number {
  const idx = STAGES.findIndex(s => (s.statuses as readonly string[]).includes(status));
  return idx === -1 ? 0 : idx;
}

export function StepTracker({
  status,
  className,
  size = 'md',
  compact = false,
}: {
  status: string;
  className?: string;
  size?: 'sm' | 'md';
  compact?: boolean;
}) {
  const isCancelled = status === 'cancelled';
  const isFlagged = status === 'changes-requested' || status === 'bottleneck';
  const currentIndex = stageIndexForStatus(status);
  const dotClass = size === 'sm' ? 'w-5 h-5' : 'w-6 h-6';
  const iconClass = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';
  const connectorMargin = size === 'sm' ? 'mt-2.5' : 'mt-3';

  const stageLabel = STAGES[currentIndex]?.label ?? 'Submitted';
  const statusSuffix = isCancelled ? ', cancelled' : isFlagged ? ', needs attention' : '';

  return (
    <div
      className={cn('flex items-start', className)}
      role="status"
      aria-label={`Approval stage: ${stageLabel}${statusSuffix}`}
    >
      {STAGES.map((stage, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        const showFlag = active && isFlagged;
        const showCancelled = active && isCancelled;

        return (
          <div key={stage.key} className={cn('flex items-center', i < STAGES.length - 1 && 'flex-1')}>
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div
                className={cn(
                  dotClass,
                  'rounded-full flex items-center justify-center border transition-colors',
                  done && 'bg-accent-scope/15 border-accent-scope text-accent-scope',
                  active && !showFlag && !showCancelled && 'bg-accent-tally/15 border-accent-tally text-accent-tally',
                  showFlag && 'bg-orange-500/15 border-orange-500 text-orange-500',
                  showCancelled && 'bg-muted border-border text-muted-foreground',
                  !done && !active && 'bg-muted/40 border-border text-muted-foreground/40',
                )}
              >
                {done ? (
                  <CheckCircle2 className={iconClass} />
                ) : showFlag ? (
                  <AlertTriangle className={iconClass} />
                ) : showCancelled ? (
                  <XCircle className={iconClass} />
                ) : (
                  <Circle className={iconClass} />
                )}
              </div>
              {!compact && (
                <span
                  className={cn(
                    'text-[10px] font-medium whitespace-nowrap',
                    done || active ? 'text-foreground' : 'text-muted-foreground/50',
                  )}
                >
                  {stage.label}
                </span>
              )}
            </div>
            {i < STAGES.length - 1 && (
              <div
                className={cn(
                  'h-px flex-1 mx-1.5 self-start',
                  connectorMargin,
                  done ? 'bg-accent-scope/40' : 'bg-border',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
