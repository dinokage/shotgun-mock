import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCapability } from '@/hooks/use-capability';
import { useAuthStore } from '@/store/auth';
import { useBroadcastsStore, type Broadcast } from '@/store/broadcasts';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const SEVERITY_OPTIONS: { value: Broadcast['severity']; label: string }[] = [
  { value: 'info', label: 'Update' },
  { value: 'success', label: 'Good news' },
  { value: 'warning', label: 'Heads up' },
];

interface BroadcastComposerProps {
  projects: { id: string; name: string }[];
  defaultProjectId?: string;
  onPosted?: () => void;
  className?: string;
}

export function BroadcastComposer({ projects, defaultProjectId, onPosted, className }: BroadcastComposerProps) {
  // Gated here (not just at the call site) so this component is safe to
  // mount unconditionally — it renders nothing for anyone without the
  // 'broadcast_updates' capability (store/permissions.ts).
  const canBroadcast = useCapability('broadcast_updates');
  const currentUser = useAuthStore((s) => s.currentUser);
  const addBroadcast = useBroadcastsStore((s) => s.addBroadcast);
  const { toast } = useToast();

  const [text, setText] = useState('');
  const [audience, setAudience] = useState<Broadcast['audience']>('internal');
  const [projectId, setProjectId] = useState<string | undefined>(defaultProjectId);
  const [severity, setSeverity] = useState<Broadcast['severity']>('info');

  if (!canBroadcast) return null;

  const needsProject = audience === 'internal_and_client';
  const canPost = text.trim().length > 0 && (!needsProject || !!projectId) && !!currentUser;

  const handlePost = () => {
    if (!canPost || !currentUser) return;

    addBroadcast({
      id: `bc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      authorId: currentUser.id,
      authorName: currentUser.name,
      authorRole: currentUser.role,
      text: text.trim(),
      timestamp: new Date().toISOString(),
      audience,
      projectId: needsProject ? projectId ?? null : null,
      severity,
    });

    toast({ title: 'Update Posted', description: 'Your status update has been shared.' });

    setText('');
    setAudience('internal');
    setProjectId(defaultProjectId);
    setSeverity('info');
    onPosted?.();
  };

  return (
    <div className={cn('rounded-lg border border-border bg-card p-3 sm:p-4 space-y-3', className)}>
      <Textarea
        placeholder="Share a status update with your team..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="min-h-[80px]"
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={audience === 'internal' ? 'default' : 'outline'}
          size="sm"
          className="touch-target"
          onClick={() => setAudience('internal')}
        >
          Team only
        </Button>
        <Button
          type="button"
          variant={audience === 'internal_and_client' ? 'default' : 'outline'}
          size="sm"
          className="touch-target"
          onClick={() => setAudience('internal_and_client')}
        >
          Team + Client
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {needsProject && (
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={severity} onValueChange={(v) => setSeverity(v as Broadcast['severity'])}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEVERITY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          className="touch-target ml-auto gap-1.5"
          disabled={!canPost}
          onClick={handlePost}
        >
          <Send className="w-3.5 h-3.5" />
          Post
        </Button>
      </div>
    </div>
  );
}
