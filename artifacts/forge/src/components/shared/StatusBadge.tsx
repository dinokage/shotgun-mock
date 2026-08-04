import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertCircle, Clock, XCircle, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

type StatusType = 'todo' | 'in-progress' | 'review' | 'complete' | 'blocked' | 'on-track' | 'at-risk' | 'pending' | 'approved' | 'rejected' | 'needs-revision';

const statusConfig: Record<string, { colorClass: string, icon: any, label: string }> = {
  'todo': { colorClass: 'bg-muted text-muted-foreground border-muted-foreground/20', icon: MoreHorizontal, label: 'To Do' },
  'in-progress': { colorClass: 'bg-[#B5651D]/10 text-[#B5651D] border-[#B5651D]/30 dark:bg-[#B5651D]/20 dark:text-[#E8A565]', icon: Clock, label: 'In Progress' },
  'review': { colorClass: 'bg-blue-500/10 text-blue-600 border-blue-500/30 dark:bg-blue-500/20 dark:text-blue-400', icon: Clock, label: 'Review' },
  'complete': { colorClass: 'bg-[#1E7A34]/10 text-[#1E7A34] border-[#1E7A34]/30 dark:bg-[#1E7A34]/20 dark:text-[#5FD179]', icon: CheckCircle2, label: 'Complete' },
  'blocked': { colorClass: 'bg-[#A03030]/10 text-[#A03030] border-[#A03030]/30 dark:bg-[#A03030]/20 dark:text-[#E06666]', icon: XCircle, label: 'Blocked' },
  
  'ON_TRACK': { colorClass: 'bg-[#1E7A34]/10 text-[#1E7A34] border-[#1E7A34]/30 dark:bg-[#1E7A34]/20 dark:text-[#5FD179]', icon: CheckCircle2, label: 'On Track' },
  'AT_RISK': { colorClass: 'bg-[#B5651D]/10 text-[#B5651D] border-[#B5651D]/30 dark:bg-[#B5651D]/20 dark:text-[#E8A565]', icon: AlertCircle, label: 'At Risk' },
  'BLOCKED': { colorClass: 'bg-[#A03030]/10 text-[#A03030] border-[#A03030]/30 dark:bg-[#A03030]/20 dark:text-[#E06666]', icon: XCircle, label: 'Blocked' },

  'pending': { colorClass: 'bg-muted text-muted-foreground border-muted-foreground/20', icon: Clock, label: 'Pending' },
  'approved': { colorClass: 'bg-[#1E7A34]/10 text-[#1E7A34] border-[#1E7A34]/30 dark:bg-[#1E7A34]/20 dark:text-[#5FD179]', icon: CheckCircle2, label: 'Approved' },
  'rejected': { colorClass: 'bg-[#A03030]/10 text-[#A03030] border-[#A03030]/30 dark:bg-[#A03030]/20 dark:text-[#E06666]', icon: XCircle, label: 'Rejected' },
  'needs-revision': { colorClass: 'bg-[#B5651D]/10 text-[#B5651D] border-[#B5651D]/30 dark:bg-[#B5651D]/20 dark:text-[#E8A565]', icon: AlertCircle, label: 'Needs Revision' },
};

export function StatusBadge({ status, className }: { status: string, className?: string }) {
  const normStatus = status.toLowerCase() === 'on_track' ? 'ON_TRACK' : 
                     status.toLowerCase() === 'at_risk' ? 'AT_RISK' : 
                     status.toLowerCase() === 'blocked' ? 'BLOCKED' : 
                     status.toLowerCase();
  
  const config = statusConfig[normStatus] || statusConfig['todo'];
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={cn("font-medium gap-1.5 whitespace-nowrap", config.colorClass, className)}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </Badge>
  );
}
