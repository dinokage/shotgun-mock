import { useUIStore } from '@/store/ui';
import { TASKS, USERS, PROJECTS, ASSETS, SHOTS, AI_SUGGESTIONS } from '@/data/mockData';
import { X, CheckCircle2, Circle, Clock, Tag, Paperclip, MessageSquare, GitBranch, Sparkles, ChevronRight, AlertTriangle, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';

const PRIORITY_COLORS = {
  critical: 'bg-red-500/10 text-red-500 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  low: 'bg-green-500/10 text-green-500 border-green-500/20',
};

const STATUS_COLORS = {
  'todo': 'bg-muted text-muted-foreground',
  'in-progress': 'bg-blue-500/10 text-blue-500',
  'blocked': 'bg-red-500/10 text-red-500',
  'review': 'bg-purple-500/10 text-purple-500',
  'complete': 'bg-green-500/10 text-green-500',
  'cancelled': 'bg-muted text-muted-foreground line-through',
};

export function TaskDrawer() {
  const { activeTaskDrawer, setActiveTaskDrawer } = useUIStore();

  if (!activeTaskDrawer) return null;

  const task = TASKS.find(t => t.id === activeTaskDrawer);
  if (!task) return null;

  const assignee = USERS.find(u => u.id === task.assigneeId);
  const project = PROJECTS.find(p => p.id === task.projectId);
  const asset = task.assetId ? ASSETS.find(a => a.id === task.assetId) : null;
  const shot = task.shotId ? SHOTS.find(s => s.id === task.shotId) : null;
  const depTasks = task.dependencies.map(d => TASKS.find(t => t.id === d)).filter(Boolean);
  const checklistDone = task.checklist.filter(c => c.done).length;
  const checklistTotal = task.checklist.length;
  const relatedSuggestions = AI_SUGGESTIONS.filter(s => s.page === 'tasks').slice(0, 2);

  return (
    <>
      <div
        className="fixed inset-0 bg-background/50 backdrop-blur-sm z-40 animate-in fade-in duration-150"
        onClick={() => setActiveTaskDrawer(null)}
      />
      <div className="fixed inset-y-0 right-0 w-[480px] max-w-[90vw] bg-card border-l border-border shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <Badge className={`${PRIORITY_COLORS[task.priority]} border text-xs font-semibold`}>
              {task.priority.toUpperCase()}
            </Badge>
            <Badge className={`${STATUS_COLORS[task.status]} text-xs`}>
              {task.status.replace('-', ' ').toUpperCase()}
            </Badge>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setActiveTaskDrawer(null)}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-5 space-y-6">
            {/* Title & Description */}
            <div>
              <h2 className="text-xl font-bold mb-2">{task.title}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{task.description}</p>
            </div>

            {/* Meta */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1.5">Assignee</div>
                <div className="flex items-center gap-2">
                  <Avatar className="w-6 h-6">
                    <AvatarImage src={assignee?.avatar} />
                    <AvatarFallback>{assignee?.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{assignee?.name}</span>
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1.5">Project</div>
                <span className="text-sm font-medium">{project?.name}</span>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" /> Due Date
                </div>
                <span className="text-sm font-medium">{task.dueDate}</span>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1.5">Department</div>
                <span className="text-sm font-medium">{task.department}</span>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Time
                </div>
                <span className="text-sm font-medium">{task.actualHours}h / {task.estimatedHours}h</span>
              </div>
              {asset && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1.5">Asset</div>
                  <span className="text-sm font-medium">{asset.name}</span>
                </div>
              )}
              {shot && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1.5">Shot</div>
                  <span className="text-sm font-medium">{shot.name}</span>
                </div>
              )}
            </div>

            {/* Tags */}
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Tag className="w-3 h-3" /> Tags
              </div>
              <div className="flex flex-wrap gap-1.5">
                {task.tags.map(tag => (
                  <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                ))}
              </div>
            </div>

            <Separator />

            {/* Checklist */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold">Checklist</div>
                <span className="text-xs text-muted-foreground">{checklistDone}/{checklistTotal}</span>
              </div>
              <Progress value={(checklistDone / checklistTotal) * 100} className="h-1.5 mb-3" />
              <div className="space-y-2">
                {task.checklist.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {item.done ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                    <span className={item.done ? 'text-muted-foreground line-through' : ''}>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Dependencies */}
            {depTasks.length > 0 && (
              <div>
                <div className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                  <GitBranch className="w-4 h-4" /> Dependencies
                </div>
                <div className="space-y-2">
                  {depTasks.map(dt => dt && (
                    <div key={dt.id} className="flex items-center justify-between p-2.5 rounded-md border border-border bg-muted/20 text-sm">
                      <span className="font-medium">{dt.title}</span>
                      <Badge className={`${STATUS_COLORS[dt.status]} text-[10px]`}>
                        {dt.status.replace('-', ' ')}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Attachments */}
            {task.attachments.length > 0 && (
              <div>
                <div className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                  <Paperclip className="w-4 h-4" /> Attachments
                </div>
                <div className="space-y-1.5">
                  {task.attachments.map((file, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-md border border-border bg-muted/20 text-sm hover:bg-muted/40 cursor-pointer transition-colors">
                      <Paperclip className="w-3 h-3 text-muted-foreground" />
                      {file}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Comments */}
            <div>
              <div className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4" /> Comments ({task.comments.length})
              </div>
              <div className="space-y-4">
                {task.comments.map((comment, i) => {
                  const commenter = USERS.find(u => u.id === comment.userId);
                  return (
                    <div key={i} className="flex gap-3">
                      <Avatar className="w-7 h-7 shrink-0">
                        <AvatarImage src={commenter?.avatar} />
                        <AvatarFallback>{commenter?.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className="text-sm font-medium">{commenter?.name}</span>
                          <span className="text-[10px] text-muted-foreground">{new Date(comment.timestamp).toLocaleDateString()}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{comment.text}</p>
                      </div>
                    </div>
                  );
                })}
                {task.comments.length === 0 && (
                  <p className="text-sm text-muted-foreground">No comments yet.</p>
                )}
              </div>

              {/* Add Comment */}
              <div className="mt-4">
                <textarea
                  className="w-full h-20 bg-muted/50 border border-border rounded-md p-2.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Add a comment..."
                />
                <Button size="sm" className="mt-2">Post Comment</Button>
              </div>
            </div>

            <Separator />

            {/* AI Suggestions */}
            <div>
              <div className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-400" /> AI Suggestions
              </div>
              <div className="space-y-2">
                {relatedSuggestions.map(s => (
                  <div key={s.id} className="p-3 rounded-md border border-purple-500/20 bg-purple-500/5 text-sm">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-medium text-purple-300">{s.title}</div>
                        <p className="text-xs text-muted-foreground mt-1">{s.suggestedAction}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    </>
  );
}
