import { Badge } from '@/components/ui/badge';

const STATUS_STYLES: Record<string, string> = {
  'ON_TRACK': 'bg-green-500/10 text-green-500 border-green-500/20',
  'AT_RISK': 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  'BOTTLENECK': 'bg-red-500/10 text-red-500 border-red-500/20',
  'COMPLETE': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  'complete': 'bg-green-500/10 text-green-500 border-green-500/20',
  'in-progress': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  'bottleneck': 'bg-red-500/10 text-red-500 border-red-500/20',
  'review': 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  // Approval-chain statuses (Task['status']) — colors match the established
  // convention in TaskDrawer.tsx's own status pill map, so a task reads the
  // same wherever its status is shown.
  'lead-review': 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  'manager-review': 'bg-purple-600/10 text-purple-600 border-purple-600/20',
  'approved': 'bg-green-500/10 text-green-500 border-green-500/20',
  // Shot['status'] client-facing states — colors match the established
  // convention in shots.tsx/tracking.tsx (client-review is kept visually
  // distinct from the internal 'review'/'lead-review' purple).
  'client-review': 'bg-violet-500/10 text-violet-500 border-violet-500/20',
  'published': 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  'todo': 'bg-muted text-muted-foreground',
  'at-risk': 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  'not-started': 'bg-muted text-muted-foreground',
  'cancelled': 'bg-muted text-muted-foreground/60',
  // Version review statuses (Version['status']) — colors match the same
  // rejected/pending/changes-requested convention used inline in tracking.tsx.
  'pending': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  'rejected': 'bg-red-500/10 text-red-500 border-red-500/20',
  'changes-requested': 'bg-orange-500/10 text-orange-500 border-orange-500/20',
};

export function StatusBadge({ status, className = '' }: { status: string, className?: string }) {
  const style = STATUS_STYLES[status] || 'bg-muted text-muted-foreground';
  return (
    <Badge className={`${style} text-[10px] font-semibold ${className}`}>
      {status.replace(/-/g, ' ').replace(/_/g, ' ').toUpperCase()}
    </Badge>
  );
}
