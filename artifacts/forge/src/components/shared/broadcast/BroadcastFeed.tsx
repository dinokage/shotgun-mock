import { Globe, Radio } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { USERS, ROLE_LABELS } from '@/data/mockData';
import type { Broadcast } from '@/store/broadcasts';
import { cn } from '@/lib/utils';

// Maps a Broadcast's severity to the app's shared --status-* tokens
// (StatusBadge, index.css) so a broadcast's urgency reads the same way
// status pills do everywhere else, rather than a one-off color scale.
// 'info' has no status-color equivalent (it isn't good/bad) so it falls
// back to the neutral border/foreground tokens.
const SEVERITY_STYLES: Record<Broadcast['severity'], { border: string; text: string }> = {
  info: { border: 'border-l-border', text: 'text-foreground' },
  success: { border: 'border-l-status-green', text: 'text-status-green' },
  warning: { border: 'border-l-status-orange', text: 'text-status-orange' },
};

interface BroadcastFeedProps {
  broadcasts: Broadcast[];
  className?: string;
}

export function BroadcastFeed({ broadcasts, className }: BroadcastFeedProps) {
  if (broadcasts.length === 0) {
    return (
      <div className={cn('flex flex-col items-center gap-2 text-sm text-muted-foreground text-center py-16', className)}>
        <Radio className="w-6 h-6 opacity-50" />
        No status updates yet.
      </div>
    );
  }

  return (
    <div className={cn('max-w-2xl mx-auto p-4 sm:p-6 space-y-3', className)}>
      {broadcasts.map((broadcast) => (
        <BroadcastCard key={broadcast.id} broadcast={broadcast} />
      ))}
    </div>
  );
}

function BroadcastCard({ broadcast }: { broadcast: Broadcast }) {
  // authorId is a real User['id'] at every real call site, but this feed
  // should never hard-crash on a stale/foreign id, so fall back gracefully.
  const author = USERS.find((u) => u.id === broadcast.authorId);
  const styles = SEVERITY_STYLES[broadcast.severity];

  return (
    <div
      className={cn(
        'flex gap-3 rounded-lg border border-l-4 border-border bg-card p-3 sm:p-4',
        styles.border,
      )}
    >
      <Avatar className="w-10 h-10 shrink-0">
        {author && <AvatarImage src={author.avatar} />}
        <AvatarFallback>{broadcast.authorName.charAt(0)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1 flex-wrap">
          <span className="font-medium text-sm">{broadcast.authorName}</span>
          <span className="text-xs text-muted-foreground">{ROLE_LABELS[broadcast.authorRole]}</span>
          <span className="text-xs text-muted-foreground ml-auto">
            {new Date(broadcast.timestamp).toLocaleString()}
          </span>
        </div>

        <p className={cn('text-sm leading-relaxed whitespace-pre-wrap break-words', styles.text)}>
          {broadcast.text}
        </p>

        {broadcast.audience === 'internal_and_client' && (
          <Badge variant="outline" className="mt-2 gap-1 text-[10px] font-semibold">
            <Globe className="w-3 h-3" />
            Visible to client
          </Badge>
        )}
      </div>
    </div>
  );
}
