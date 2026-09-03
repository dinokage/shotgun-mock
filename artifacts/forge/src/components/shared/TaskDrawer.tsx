import { useUIStore } from "@/store/ui";
import { cn } from "@/lib/utils";
import {
  USERS,
  PROJECTS,
  DEPARTMENTS,
  getNextDepartment,
  DEPENDENCY_TYPE_LABELS,
} from "@/data/mockData";
import {
  useTasks,
  useUpdateTask,
  useTaskChecklist,
  useToggleChecklistItem,
  useTaskComments,
  useAddTaskComment,
  useTaskDependencies,
  useTaskAttachments,
  useAddTaskApprovalEvent,
  useDailyLogs,
  useAddDailyLog,
  type TaskDependencyDTO,
} from "@/hooks/useTasks";
import { useShots } from "@/hooks/useShots";
import { useAssets } from "@/hooks/useAssets";
import { useShotStore } from "@/store/shots";
import {
  X,
  CheckCircle2,
  Circle,
  Clock,
  Tag,
  Paperclip,
  MessageSquare,
  GitBranch,
  Sparkles,
  AlertTriangle,
  CalendarDays,
  ArrowRight,
  Play,
  UserCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useAuthStore } from "@/store/auth";
import {
  LEADERSHIP_ROLES,
  DEPARTMENT_LEADERSHIP_ROLES,
} from "@/store/permissions";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import { StepTracker } from "@/components/shared/StepTracker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-500 border-red-500/20",
  high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  low: "bg-green-500/10 text-green-500 border-green-500/20",
};

const STATUS_COLORS: Record<string, string> = {
  todo: "bg-slate-500/10 text-slate-500",
  "not-started": "bg-slate-500/10 text-slate-500",
  "in-progress": "bg-blue-500/10 text-blue-500",
  bottleneck: "bg-red-500/10 text-red-500",
  review: "bg-purple-500/10 text-purple-500",
  "lead-review": "bg-purple-500/10 text-purple-500",
  approved: "bg-green-500/10 text-green-500",
  complete: "bg-green-500/10 text-green-500",
  cancelled: "bg-muted text-muted-foreground line-through",
};

export function TaskDrawer() {
  const { activeTaskDrawer, setActiveTaskDrawer } = useUIStore();
  const { currentUser } = useAuthStore();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const { data: liveTasks = [] } = useTasks();
  const updateTaskMutation = useUpdateTask();
  const { data: checklist = [] } = useTaskChecklist(
    activeTaskDrawer ?? undefined,
  );
  const toggleChecklistItemMutation = useToggleChecklistItem(
    activeTaskDrawer ?? undefined,
  );
  const { data: comments = [] } = useTaskComments(
    activeTaskDrawer ?? undefined,
  );
  const addCommentMutation = useAddTaskComment(activeTaskDrawer ?? undefined);
  const { data: dependencies = [] } = useTaskDependencies(
    activeTaskDrawer ?? undefined,
  );
  const { data: attachments = [] } = useTaskAttachments(
    activeTaskDrawer ?? undefined,
  );
  const addApprovalEventMutation = useAddTaskApprovalEvent(
    activeTaskDrawer ?? undefined,
  );
  const { data: dailyLogs = [] } = useDailyLogs(activeTaskDrawer ?? undefined);
  const addDailyLogMutation = useAddDailyLog();
  const { data: liveShots = [] } = useShots();
  const { data: liveAssets = [] } = useAssets();
  const updateShotStatus = useShotStore((state) => state.updateShot);

  const [commentText, setCommentText] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [logFormOpen, setLogFormOpen] = useState(false);
  const [logHours, setLogHours] = useState("8");
  const [logNote, setLogNote] = useState("");

  // "Approve & Send to Client" forwards a shot to the external, unauthenticated
  // client portal (client-review.tsx) in one action — a one-way door that
  // deserves a look-before-you-leap step, not a single click. This just gates
  // the existing action behind an inline confirm; it changes no store logic.
  const [clientSendConfirmOpen, setClientSendConfirmOpen] = useState(false);

  if (!activeTaskDrawer || !currentUser) return null;

  const task = liveTasks.find((t) => t.id === activeTaskDrawer);
  if (!task) return null;

  const assignee = USERS.find((u) => u.id === task.assignedTo);

  const handleAddDailyLog = () => {
    const hoursNum = parseFloat(logHours);
    if (!hoursNum || hoursNum <= 0) {
      toast({
        title: "Missing Info",
        description: "Enter valid hours.",
        variant: "destructive",
      });
      return;
    }
    addDailyLogMutation.mutate(
      {
        taskId: task.id,
        date: new Date().toISOString().slice(0, 10),
        hours: hoursNum,
        note: logNote.trim() || "No notes provided.",
      },
      {
        onSuccess: () => {
          toast({
            title: "Log Submitted",
            description: "Your daily update has been recorded successfully.",
          });
          setLogFormOpen(false);
          setLogHours("8");
          setLogNote("");
        },
        onError: () => {
          toast({
            title: "Log Failed",
            description: "Couldn't record your update. Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setCommentText(val);

    const lastAt = val.lastIndexOf("@");
    if (lastAt !== -1 && !val.substring(lastAt).includes(" ")) {
      setShowMentions(true);
      setMentionQuery(val.substring(lastAt + 1).toLowerCase());
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (name: string) => {
    const lastAt = commentText.lastIndexOf("@");
    const newText =
      commentText.substring(0, lastAt) + "@" + name.replace(" ", "") + " ";
    setCommentText(newText);
    setShowMentions(false);
  };
  // Task has no projectId column server-side — resolve it indirectly via
  // its entityId -> shot/asset -> projectId (per the task hooks' field
  // mapping notes).
  const asset =
    task.entityType === "asset"
      ? liveAssets.find((a) => a.id === task.entityId)
      : null;
  const shot =
    task.entityType === "shot"
      ? liveShots.find((s) => s.id === task.entityId)
      : null;
  const project = PROJECTS.find(
    (p) => p.id === (asset?.projectId ?? shot?.projectId),
  );
  const depTasks = dependencies
    .map((dep) => ({
      dep,
      depTask: liveTasks.find((t) => t.id === dep.dependsOnTaskId),
    }))
    .filter(
      (
        x,
      ): x is {
        dep: TaskDependencyDTO;
        depTask: NonNullable<typeof x.depTask>;
      } => Boolean(x.depTask),
    );
  const checklistDone = checklist.filter((c) => c.done).length;
  const checklistTotal = checklist.length;

  const isLeadership = LEADERSHIP_ROLES.includes(currentUser.role);
  const isAssignee = currentUser.id === task.assignedTo;
  const currentDept = DEPARTMENTS.find((d) => d.name === task.department);
  const nextDept = currentDept ? getNextDepartment(currentDept.id) : null;

  return (
    <>
      <div
        className="fixed inset-0 bg-background/50 backdrop-blur-sm z-40 animate-in fade-in duration-150"
        onClick={() => setActiveTaskDrawer(null)}
      />
      <div
        className={cn(
          "fixed bg-card shadow-2xl z-50 flex flex-col",
          isMobile
            ? "inset-x-0 bottom-0 top-auto max-h-[85vh] rounded-t-xl border-t border-border animate-in slide-in-from-bottom duration-300"
            : "inset-y-0 right-0 w-[480px] max-w-[90vw] border-l border-border animate-in slide-in-from-right duration-300",
        )}
      >
        {/* Mobile drag handle — visual affordance for the bottom sheet */}
        {isMobile && (
          <div className="flex justify-center pt-2.5 pb-1 shrink-0">
            <div className="h-1.5 w-10 rounded-full bg-muted" />
          </div>
        )}

        {/* Header */}
        <div className="border-b border-border shrink-0">
          <div className="flex items-center justify-between gap-2 p-4 pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                className={`${PRIORITY_COLORS[task.priority]} border text-xs font-semibold`}
              >
                {task.priority.toUpperCase()}
              </Badge>
              <Badge className={`${STATUS_COLORS[task.status]} text-xs`}>
                {task.status.replace("-", " ").toUpperCase()}
              </Badge>

              {task.status === "approved" && nextDept && isLeadership && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px] bg-accent-tally/10 text-accent-tally border-accent-tally/20 hover:bg-accent-tally/20"
                  onClick={() => {
                    updateTaskMutation.mutate({
                      id: task.id,
                      department: nextDept.name,
                      status: "not-started",
                    });
                    toast({
                      title: "Task Handed Off",
                      description: `${task.title} moved to ${nextDept.name}.`,
                    });
                  }}
                >
                  Handoff to {nextDept.abbreviation}{" "}
                  <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className={cn(isMobile && "touch-target")}
              onClick={() => setActiveTaskDrawer(null)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="px-4 pb-3">
            <StepTracker status={task.status} size="sm" compact={isMobile} />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-5 space-y-6">
            {/* Title & Description */}
            <div>
              <h2 className="text-xl font-bold mb-2">{task.title}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {task.description}
              </p>
            </div>

            {/* Meta */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1.5 flex justify-between items-center">
                  Assignee
                  {isLeadership && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <span className="text-accent-scope text-[10px] cursor-pointer hover:underline bg-accent-scope/10 px-1.5 py-0.5 rounded">
                          Reassign
                        </span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <div className="text-xs font-semibold px-2 py-1.5 text-muted-foreground">
                          Department Roster
                        </div>
                        {USERS.filter(
                          (u) =>
                            u.departmentId === currentDept?.id &&
                            u.id !== task.assignedTo,
                        )
                          .slice(0, 4)
                          .map((u) => (
                            <DropdownMenuItem
                              key={u.id}
                              className="text-xs gap-2 cursor-pointer"
                              onClick={() => {
                                updateTaskMutation.mutate({
                                  id: task.id,
                                  assignedTo: u.id,
                                });
                                toast({
                                  title: "Task Reassigned",
                                  description: `Task assigned to ${u.name}`,
                                });
                              }}
                            >
                              <Avatar className="w-4 h-4">
                                <AvatarImage src={u.avatar} />
                              </Avatar>
                              {u.name}
                            </DropdownMenuItem>
                          ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-xs text-red-500 cursor-pointer"
                          onClick={() => {
                            updateTaskMutation.mutate({
                              id: task.id,
                              assignedTo: null,
                            });
                            toast({
                              title: "Task Revoked",
                              description: "Task is now unassigned",
                              variant: "destructive",
                            });
                          }}
                        >
                          Revoke Assignment
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Avatar className="w-6 h-6 border">
                    <AvatarImage src={assignee?.avatar} />
                    <AvatarFallback>
                      {assignee?.name?.charAt(0) || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">
                    {assignee?.name || "Unassigned"}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1.5">
                  Project
                </div>
                <span className="text-sm font-medium">{project?.name}</span>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" /> Due Date
                </div>
                <span className="text-sm font-medium">{task.dueDate}</span>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1.5">
                  Department
                </div>
                <span className="text-sm font-medium">{task.department}</span>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Time
                </div>
                <span className="text-sm font-medium timecode">
                  {task.actualHours}h / {task.estimatedHours}h
                </span>
              </div>
              {asset && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1.5">
                    Asset
                  </div>
                  <span className="text-sm font-medium">{asset.name}</span>
                </div>
              )}
              {shot && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1.5">
                    Shot
                  </div>
                  <span className="text-sm font-medium">{shot.name}</span>
                </div>
              )}
            </div>

            {/* Action Bar */}
            <div className="flex gap-2">
              {/* Self-claim: an unassigned task can be picked up directly by
                  any artist (the artist-only gate here is purely a client-side
                  UI restriction — the server's self-claim exception itself
                  isn't role-gated, it just requires assignedTo === the
                  caller's own id). Routed through updateTaskMutation (the
                  same useUpdateTask() mutation used by Reassign/Revoke above)
                  rather than the Zustand claimTask action, so the ["tasks"]
                  query is only invalidated in onSuccess — after the PUT
                  actually lands — avoiding a race with an unawaited
                  fire-and-forget sync. */}
              {!task.assignedTo && currentUser.role === "artist" && (
                <Button
                  className="flex-1 border-accent-tally/40 text-accent-tally hover:bg-accent-tally/10"
                  variant="outline"
                  onClick={() => {
                    updateTaskMutation.mutate(
                      { id: task.id, assignedTo: currentUser.id },
                      {
                        onSuccess: () => {
                          toast({
                            title: "Task Claimed",
                            description: `You've claimed ${task.title}.`,
                          });
                        },
                        onError: () => {
                          toast({
                            title: "Failed to claim task",
                            variant: "destructive",
                          });
                        },
                      },
                    );
                  }}
                >
                  <UserCircle2 className="w-4 h-4 mr-2" />
                  Claim Task
                </Button>
              )}

              {/* Assignee Actions */}
              {isAssignee &&
                [
                  "not-started",
                  "todo",
                  "in-progress",
                  "wip",
                  "changes-requested",
                ].includes(task.status) && (
                  <Button
                    className={cn(
                      "flex-1",
                      task.status === "in-progress"
                        ? "bg-accent-tally text-accent-tally-foreground border-accent-tally hover:bg-accent-tally/90"
                        : "border-accent-tally/40 text-accent-tally hover:bg-accent-tally/10",
                    )}
                    variant={
                      task.status === "in-progress" ? "default" : "outline"
                    }
                    onClick={() => {
                      if (task.status === "in-progress") {
                        // Recording the approval event and advancing status
                        // are two separate server calls — the approval-events
                        // endpoint only appends the audit-trail entry, it
                        // does not itself change tasksTable.status.
                        updateTaskMutation.mutate({
                          id: task.id,
                          status: "review",
                        });
                        addApprovalEventMutation.mutate({
                          action: "submitted-for-lead-review",
                        });
                        toast({ title: "Submitted for Lead Review" });
                      } else {
                        updateTaskMutation.mutate({
                          id: task.id,
                          status: "in-progress",
                        });
                        toast({
                          title: "Task Started",
                          description: `${task.title} is now in progress.`,
                        });
                      }
                    }}
                  >
                    <Play className="w-4 h-4 mr-2" />
                    {task.status === "in-progress"
                      ? "Submit for Lead Review"
                      : "Start Task"}
                  </Button>
                )}

              {/* Approve/Reject Actions: only once the task has actually been
                  submitted for review. Assignees reach that queue two ways in
                  this app - the quick "Submit for Review" actions in this
                  drawer (which set status to 'review'), and the formal chain
                  driven from the review player (which sets 'lead-review'
                  directly) - so both values are treated as "awaiting review"
                  here. This is the final internal sign-off (the former
                  separate Manager tier is gone — approving here goes straight
                  to 'approved'). Gated to the department's own
                  Lead/Supervisor (Producer/Lead merge into the single
                  surviving `lead` role per this phase's spec — studio-level
                  production_head/admin get a dashboard/reporting view over
                  already-approved work, not a second blocking gate here). If
                  the task is linked to a shot, approving also forwards that
                  shot into the client-facing review queue (client-review.tsx
                  filters shots on exactly this status). */}
              {DEPARTMENT_LEADERSHIP_ROLES.includes(currentUser.role) &&
                currentUser.departmentId === currentDept?.id &&
                ["review", "lead-review"].includes(task.status) &&
                (clientSendConfirmOpen ? (
                  <div className="w-full rounded-md border border-accent-tally/30 bg-accent-tally/5 p-3 space-y-3">
                    <p className="text-sm">
                      {task.entityType === "shot" ? (
                        <>
                          This forwards <b>{shot?.name ?? task.title}</b> to the
                          external client portal — the client will be able to
                          view and comment on it immediately.
                        </>
                      ) : (
                        <>
                          This approves <b>{task.title}</b> internally. It isn't
                          linked to a shot, so nothing is forwarded to the
                          client portal.
                        </>
                      )}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        className="flex-1 bg-[#1E7A34] hover:bg-[#1E7A34]/90 text-white touch-target"
                        onClick={() => {
                          updateTaskMutation.mutate({
                            id: task.id,
                            status: "approved",
                          });
                          addApprovalEventMutation.mutate({
                            action: "published",
                          });
                          if (task.entityType === "shot") {
                            updateShotStatus(task.entityId, {
                              status: "client-review",
                            });
                            toast({
                              title: "Sent to Client Review",
                              description: `${task.title} approved and forwarded to the client portal.`,
                            });
                          } else {
                            toast({
                              title: "Approved",
                              description: `Published to production dashboard.`,
                            });
                          }
                          setClientSendConfirmOpen(false);
                        }}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" /> Confirm & Send
                      </Button>
                      <Button
                        variant="outline"
                        className="touch-target"
                        onClick={() => setClientSendConfirmOpen(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex w-full gap-2">
                    <Button
                      className="flex-1 bg-[#1E7A34] hover:bg-[#1E7A34]/90 text-white"
                      onClick={() => setClientSendConfirmOpen(true)}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" /> Approve & Send
                      to Client
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 text-red-500 hover:bg-red-500/10"
                      onClick={() => {
                        updateTaskMutation.mutate({
                          id: task.id,
                          status: "in-progress",
                        });
                        addApprovalEventMutation.mutate({
                          action: "rejected",
                        });
                        toast({
                          title: "Review Rejected",
                          description: `Sent back to team.`,
                        });
                      }}
                    >
                      <X className="w-4 h-4 mr-2" /> Reject
                    </Button>
                  </div>
                ))}
            </div>

            {/* Daily Time Logging — /daily-logs, keyed by this task's id
                (hooks/useTasks.ts's useDailyLogs/useAddDailyLog). Gated the
                same way the pre-Task-18 mock-store version was: only the
                assignee can log time, and only while the task is actively
                in progress. */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold flex items-center gap-1.5">
                  <Clock className="w-4 h-4" /> Daily Time Logs
                </div>
                {isAssignee && task.status === "in-progress" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setLogFormOpen((prev) => !prev)}
                  >
                    {logFormOpen ? "Cancel" : "Log Daily Time"}
                  </Button>
                )}
              </div>
              {logFormOpen && (
                <div className="space-y-2.5 mb-3 p-3 rounded-md border border-border bg-muted/20">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      Hours Spent
                    </label>
                    <input
                      type="number"
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      value={logHours}
                      onChange={(e) => setLogHours(e.target.value)}
                      min="0"
                      max="24"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      Notes
                    </label>
                    <textarea
                      className="w-full h-16 bg-background border border-input rounded-md p-2.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="What did you accomplish today?"
                      value={logNote}
                      onChange={(e) => setLogNote(e.target.value)}
                    />
                  </div>
                  <Button size="sm" className="w-full" onClick={handleAddDailyLog}>
                    Submit Log
                  </Button>
                </div>
              )}
              {dailyLogs.length > 0 ? (
                <div className="space-y-2">
                  {dailyLogs
                    .slice()
                    .reverse()
                    .slice(0, 5)
                    .map((log) => {
                      const loggedBy = USERS.find((u) => u.id === log.userId);
                      return (
                        <div
                          key={log.id}
                          className="p-2.5 rounded-md border border-border bg-muted/20 text-sm"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium">
                              {loggedBy?.name ?? "Unknown"} — {log.hours}h
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(log.date).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground italic">
                            "{log.note}"
                          </p>
                        </div>
                      );
                    })}
                </div>
              ) : (
                !logFormOpen && (
                  <p className="text-sm text-muted-foreground">
                    No time logged yet.
                  </p>
                )
              )}
            </div>

            <Separator />

            {/* Checklist (guarded on checklistTotal > 0 — with no items,
                checklistDone / checklistTotal is 0/0 = NaN, which Progress
                can't render meaningfully) */}
            {checklistTotal > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold">Checklist</div>
                  <span className="text-xs text-muted-foreground">
                    {checklistDone}/{checklistTotal}
                  </span>
                </div>
                <Progress
                  value={(checklistDone / checklistTotal) * 100}
                  className="h-1.5 mb-3"
                />
                <div className="space-y-2">
                  {checklist.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          toggleChecklistItemMutation.mutate({
                            itemId: item.id,
                            done: !item.done,
                          })
                        }
                        className="shrink-0 flex items-center justify-center rounded-full p-0.5 -m-0.5 hover:bg-muted transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                        aria-label={
                          item.done ? "Mark as not done" : "Mark as done"
                        }
                      >
                        <AnimatePresence mode="wait" initial={false}>
                          {item.done ? (
                            <motion.span
                              key="done"
                              initial={{ scale: 0.4, opacity: 0, rotate: -45 }}
                              animate={{ scale: 1, opacity: 1, rotate: 0 }}
                              exit={{ scale: 0.4, opacity: 0 }}
                              transition={{ duration: 0.15, ease: "easeOut" }}
                              className="block"
                            >
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            </motion.span>
                          ) : (
                            <motion.span
                              key="undone"
                              initial={{ scale: 0.4, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0.4, opacity: 0 }}
                              transition={{ duration: 0.15, ease: "easeOut" }}
                              className="block"
                            >
                              <Circle className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </button>
                      <span
                        className={`transition-colors duration-200 ${item.done ? "text-muted-foreground line-through" : ""}`}
                      >
                        {item.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Dependencies */}
            {depTasks.length > 0 && (
              <div>
                <div className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                  <GitBranch className="w-4 h-4" /> Dependencies
                </div>
                <div className="space-y-2">
                  {depTasks.map(({ dep, depTask }, i) => (
                    <motion.div
                      key={depTask.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.2,
                        delay: i * 0.04,
                        ease: "easeOut",
                      }}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-md border border-border bg-muted/20 text-sm"
                    >
                      <span className="font-medium truncate">
                        {depTask.title}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge
                          variant="outline"
                          className="text-[9px] font-mono border-primary/30 text-primary bg-primary/5"
                          title={
                            DEPENDENCY_TYPE_LABELS[
                              dep.type as keyof typeof DEPENDENCY_TYPE_LABELS
                            ]
                          }
                        >
                          {dep.type}
                          {dep.lagDays ? ` +${dep.lagDays}d` : ""}
                        </Badge>
                        <Badge
                          className={`${STATUS_COLORS[depTask.status]} text-[10px]`}
                        >
                          {depTask.status.replace("-", " ")}
                        </Badge>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Attachments */}
            {attachments.length > 0 && (
              <div>
                <div className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                  <Paperclip className="w-4 h-4" /> Attachments
                </div>
                <div className="space-y-1.5">
                  {attachments.map((att) => (
                    <a
                      key={att.id}
                      href={att.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 p-2 rounded-md border border-border bg-muted/20 text-sm hover:bg-muted/40 cursor-pointer transition-colors"
                    >
                      <Paperclip className="w-3 h-3 text-muted-foreground" />
                      {att.url}
                    </a>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Link into the lightweight Feedback view (see
                components/shared/review/FeedbackList.tsx) for anyone who
                just wants to read review notes on this submission, without
                opening the full frame-accurate Player. Only shown once the
                task has actually entered the review chain — nothing to read
                before that. */}
            {["review", "lead-review", "approved"].includes(task.status) && (
              <Link
                href="/review?mode=feedback"
                className="touch-target flex items-center justify-center gap-2 w-full px-3 rounded-md border border-border text-sm font-medium hover-elevate active-elevate-2"
              >
                <MessageSquare className="w-4 h-4" /> View Review Feedback
              </Link>
            )}

            {/* Comments */}
            <div>
              <div className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4" /> Comments (
                {comments.length})
              </div>
              <div className="space-y-4">
                <AnimatePresence initial={false}>
                  {comments.map((comment) => {
                    const commenter = USERS.find(
                      (u) => u.id === comment.userId,
                    );
                    return (
                      <motion.div
                        key={comment.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className="flex gap-3"
                      >
                        <Avatar className="w-7 h-7 shrink-0">
                          <AvatarImage src={commenter?.avatar} />
                          <AvatarFallback>
                            {commenter?.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-baseline gap-2 mb-0.5">
                            <span className="text-sm font-medium">
                              {commenter?.name}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(comment.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {comment.text}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                {comments.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No comments yet.
                  </p>
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
                    {USERS.filter((u) =>
                      u.name.toLowerCase().includes(mentionQuery),
                    ).length === 0 ? (
                      <div className="p-2 text-xs text-muted-foreground text-center">
                        No users found.
                      </div>
                    ) : (
                      USERS.filter((u) =>
                        u.name.toLowerCase().includes(mentionQuery),
                      ).map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer transition-colors"
                          onClick={() => insertMention(u.name)}
                        >
                          <Avatar className="w-5 h-5">
                            <AvatarImage src={u.avatar} />
                            <AvatarFallback>{u.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium">{u.name}</span>
                          <span className="text-xs text-muted-foreground ml-auto">
                            {u.role}
                          </span>
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
                      addCommentMutation.mutate(
                        { text: commentText.trim() },
                        {
                          onSuccess: () => {
                            toast({
                              title: "Comment Posted",
                              description: "Your comment has been added.",
                            });
                            setCommentText("");
                            setShowMentions(false);
                          },
                          onError: () => {
                            toast({
                              title: "Failed to post comment",
                              variant: "destructive",
                            });
                          },
                        },
                      );
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
