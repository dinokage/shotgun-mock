import { useUIStore } from '@/store/ui';
import { TASKS, USERS, PROJECTS, ASSETS, SHOTS, DEPARTMENTS, PIPELINE_ORDER, getNextDepartment } from '@/data/mockData';
import { X, CheckCircle2, Circle, Clock, Tag, Paperclip, MessageSquare, GitBranch, Sparkles, AlertTriangle, CalendarDays, ArrowRight, Play, UserCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { useAuthStore } from '@/store/auth';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';

const PRIORITY_COLORS = {
  critical: 'bg-red-500/10 text-red-500 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  low: 'bg-green-500/10 text-green-500 border-green-500/20',
};

const STATUS_COLORS: Record<string, string> = {
  'todo': 'bg-slate-500/10 text-slate-500',
  'not-started': 'bg-slate-500/10 text-slate-500',
  'in-progress': 'bg-blue-500/10 text-blue-500',
  'bottleneck': 'bg-red-500/10 text-red-500',
  'review': 'bg-purple-500/10 text-purple-500',
  'lead-review': 'bg-purple-500/10 text-purple-500',
  'manager-review': 'bg-purple-600/10 text-purple-600',
  'approved': 'bg-green-500/10 text-green-500',
  'complete': 'bg-green-500/10 text-green-500',
  'cancelled': 'bg-muted text-muted-foreground line-through',
};

export function TaskDrawer() {
  const { activeTaskDrawer, setActiveTaskDrawer } = useUIStore();
  const { currentUser } = useAuthStore();
  const { toast } = useToast();

  if (!activeTaskDrawer || !currentUser) return null;

  const task = TASKS.find(t => t.id === activeTaskDrawer);
  if (!task) return null;

  const assignee = USERS.find(u => u.id === task.assigneeId);
  
  const [commentText, setCommentText] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setCommentText(val);

    const lastAt = val.lastIndexOf('@');
    if (lastAt !== -1 && !val.substring(lastAt).includes(' ')) {
      setShowMentions(true);
      setMentionQuery(val.substring(lastAt + 1).toLowerCase());
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (name: string) => {
    const lastAt = commentText.lastIndexOf('@');
    const newText = commentText.substring(0, lastAt) + '@' + name.replace(' ', '') + ' ';
    setCommentText(newText);
    setShowMentions(false);
  };
  const project = PROJECTS.find(p => p.id === task.projectId);
  const asset = task.assetId ? ASSETS.find(a => a.id === task.assetId) : null;
  const shot = task.shotId ? SHOTS.find(s => s.id === task.shotId) : null;
  const depTasks = task.dependencies.map(d => TASKS.find(t => t.id === d)).filter(Boolean);
  const checklistDone = task.checklist.filter(c => c.done).length;
  const checklistTotal = task.checklist.length;
  
  
  const isLeadership = ['supervisor', 'lead', 'vfx_producer', 'production_manager'].includes(currentUser.role);
  const isAssignee = currentUser.id === task.assigneeId;
  const currentDept = DEPARTMENTS.find(d => d.name === task.department);
  const nextDept = currentDept ? getNextDepartment(currentDept.id) : null;

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
            
            {isAssignee && task.status !== 'approved' && (
              <Button 
                size="sm" 
                variant="outline" 
                className="h-6 text-[10px] bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20"
                onClick={() => {
                  toast({ title: 'Playblast Uploaded', description: 'Saved 1 copy locally. Routed 2 to Leads for review.' });
                  setTimeout(() => {
                    toast({ title: 'Auto-Routing', description: 'Leads approved. Sent 1 playblast to Client Review portal.' });
                  }, 3000);
                }}
              >
                <Play className="w-3 h-3 mr-1" /> Submit Playblast
              </Button>
            )}

            {task.status === 'approved' && nextDept && isLeadership && (
              <Button size="sm" variant="outline" className="h-6 text-[10px] bg-primary/10 text-primary border-primary/20 hover:bg-primary/20">
                Handoff to {nextDept.abbreviation} <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            )}
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
                <div className="text-xs font-medium text-muted-foreground mb-1.5 flex justify-between items-center">
                  Assignee
                  {isLeadership && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <span className="text-primary text-[10px] cursor-pointer hover:underline bg-primary/10 px-1.5 py-0.5 rounded">Reassign</span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <div className="text-xs font-semibold px-2 py-1.5 text-muted-foreground">Department Roster</div>
                        {USERS.filter(u => u.departmentId === currentDept?.id && u.id !== task.assigneeId).slice(0, 4).map(u => (
                          <DropdownMenuItem key={u.id} className="text-xs gap-2 cursor-pointer" onClick={() => {
                            toast({ title: "Task Reassigned", description: `Task assigned to ${u.name}` });
                          }}>
                            <Avatar className="w-4 h-4"><AvatarImage src={u.avatar} /></Avatar>
                            {u.name}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-xs text-red-500 cursor-pointer" onClick={() => {
                          toast({ title: "Task Revoked", description: "Task is now unassigned", variant: "destructive" });
                        }}>
                          Revoke Assignment
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Avatar className="w-6 h-6 border">
                    <AvatarImage src={assignee?.avatar} />
                    <AvatarFallback>{assignee?.name?.charAt(0) || '?'}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{assignee?.name || 'Unassigned'}</span>
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
            
            {/* Action Bar */}
            <div className="flex gap-2">
              {(task.status === 'lead-review' || task.status === 'manager-review') && isLeadership ? (
                (() => {
                  const isMyDeptTask = currentUser?.departmentId === currentDept?.id;
                  const isTopLeadership = currentUser ? ['vfx_producer', 'production_manager', 'coordinator'].includes(currentUser.role) : false;
                  const canApprove = isMyDeptTask || isTopLeadership;

                  if (canApprove) {
                    return (
                      <div className="flex w-full gap-2">
                        <Button className="flex-1 bg-purple-600 hover:bg-purple-700" onClick={() => {
                          toast({ title: "Review Approved", description: `Notification sent to ${assignee?.name || 'artist'}` });
                        }}>
                          <CheckCircle2 className="w-4 h-4 mr-2" /> Approve
                        </Button>
                        <Button variant="outline" className="flex-1 text-red-500 hover:bg-red-500/10" onClick={() => {
                          toast({ title: "Review Rejected", description: `Notes sent back to ${assignee?.name || 'artist'}` });
                        }}>
                          <X className="w-4 h-4 mr-2" /> Reject
                        </Button>
                      </div>
                    );
                  } else {
                    return (
                      <Button className="w-full bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/20" variant="outline" onClick={() => {
                        toast({ title: "Feedback Sent", description: `Your feedback has been forwarded to the ${task.department} manager.` });
                      }}>
                        <MessageSquare className="w-4 h-4 mr-2" /> Suggest Changes to {task.department} Manager
                      </Button>
                    );
                  }
                })()
              ) : task.status !== 'approved' ? (
                <Button className="flex-1" variant={task.status === 'in-progress' ? 'default' : 'outline'} onClick={() => {
                  toast({ title: task.status === 'in-progress' ? 'Submitted for Review' : 'Task Started', description: `Task status updated successfully.` });
                }}>
                  <Play className="w-4 h-4 mr-2" />
                  {task.status === 'in-progress' ? 'Submit for Lead Review' : 'Start Task'}
                </Button>
              ) : null}
              {isAssignee && task.status === 'in-progress' && (
                <Button variant="outline" className="flex-1 bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20" onClick={() => {
                  toast({ title: 'Log Daily Time', description: 'Redirecting to time logging...' });
                }}>
                  <Clock className="w-4 h-4 mr-2" /> Log Daily Time
                </Button>
              )}
            </div>

            {/* Daily Logs (if any) */}
            {task.dailyLogs.length > 0 && (
              <div>
                <div className="text-sm font-semibold mb-3">Recent Logs</div>
                <div className="space-y-2">
                  {task.dailyLogs.map((log, i) => (
                    <div key={i} className="text-xs bg-muted/30 p-2 rounded-md border border-border">
                      <div className="flex justify-between font-medium mb-1">
                        <span>{log.date}</span>
                        <span className="text-primary">{log.hours}h</span>
                      </div>
                      <div className="text-muted-foreground italic">"{log.note}"</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                      <Circle className="w-4 h-4 text-muted-foreground shrink-0 cursor-pointer hover:text-foreground" />
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
              <div className="mt-4 relative">
                <textarea
                  className="w-full h-20 bg-muted/50 border border-border rounded-md p-2.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Add a comment... (Type @ to mention)"
                  value={commentText}
                  onChange={handleCommentChange}
                />
                
                {/* Mentions Dropdown */}
                {showMentions && (
                  <div className="absolute left-2 top-[85px] w-64 max-h-48 overflow-y-auto bg-card border border-border rounded-md shadow-lg z-50 p-1 animate-in fade-in slide-in-from-top-2">
                    {USERS.filter(u => u.name.toLowerCase().includes(mentionQuery)).length === 0 ? (
                      <div className="p-2 text-xs text-muted-foreground text-center">No users found.</div>
                    ) : (
                      USERS.filter(u => u.name.toLowerCase().includes(mentionQuery)).map(u => (
                        <div 
                          key={u.id} 
                          className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer transition-colors"
                          onClick={() => insertMention(u.name)}
                        >
                          <Avatar className="w-5 h-5"><AvatarImage src={u.avatar} /><AvatarFallback>{u.name.charAt(0)}</AvatarFallback></Avatar>
                          <span className="text-sm font-medium">{u.name}</span>
                          <span className="text-xs text-muted-foreground ml-auto">{u.role}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
                
                <Button 
                  size="sm" 
                  className="mt-2"
                  onClick={() => {
                    if (commentText.trim()) {
                      toast({ title: 'Comment Posted', description: 'Your comment has been added.' });
                      setCommentText('');
                      setShowMentions(false);
                    }
                  }}
                >
                  Post Comment
                </Button>
              </div>
            </div>

          </div>
        </ScrollArea>
      </div>
    </>
  );
}
