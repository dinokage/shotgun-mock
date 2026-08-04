import { Badge } from '@/components/ui/badge';

const STATUS_STYLES: Record<string, string> = {
  'ON_TRACK': 'bg-green-500/10 text-green-500 border-green-500/20',
  'AT_RISK': 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  'BLOCKED': 'bg-red-500/10 text-red-500 border-red-500/20',
  'COMPLETE': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  'complete': 'bg-green-500/10 text-green-500 border-green-500/20',
  'in-progress': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  'blocked': 'bg-red-500/10 text-red-500 border-red-500/20',
  'review': 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  'todo': 'bg-muted text-muted-foreground',
  'at-risk': 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  'not-started': 'bg-muted text-muted-foreground',
  'cancelled': 'bg-muted text-muted-foreground/60',
};

export function StatusBadge({ status, className = '' }: { status: string, className?: string }) {
  const style = STATUS_STYLES[status] || 'bg-muted text-muted-foreground';
  return (
    <Badge className={`${style} text-[10px] font-semibold ${className}`}>
      {status.replace(/-/g, ' ').replace(/_/g, ' ').toUpperCase()}
    </Badge>
  );
}
