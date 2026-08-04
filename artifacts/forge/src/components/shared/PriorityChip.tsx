import { cn } from '@/lib/utils';
import { ArrowUp, ArrowRight, ArrowDown, AlertTriangle } from 'lucide-react';

export function PriorityChip({ priority, className }: { priority: string, className?: string }) {
  const p = priority.toLowerCase();
  
  if (p === 'critical') {
    return (
      <div className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-[#A03030] text-white", className)}>
        <AlertTriangle className="w-3 h-3" />
        CRIT
      </div>
    );
  }
  if (p === 'high') {
    return (
      <div className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-[#B5651D]/20 text-[#B5651D] dark:text-[#E8A565]", className)}>
        <ArrowUp className="w-3 h-3" />
        HIGH
      </div>
    );
  }
  if (p === 'medium') {
    return (
      <div className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground", className)}>
        <ArrowRight className="w-3 h-3" />
        MED
      </div>
    );
  }
  return (
    <div className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-muted/50 text-muted-foreground/70", className)}>
      <ArrowDown className="w-3 h-3" />
      LOW
    </div>
  );
}
