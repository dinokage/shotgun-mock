import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUserStore } from "@/store/users";
import { useDepartmentStore } from "@/store/departments";
import { useProjectStore } from "@/store/projects";
import { useAuthStore } from "@/store/auth";
import { useStandupsStore } from "@/store/standups";
import { useBroadcastsStore } from "@/store/broadcasts";
import { useUIStore } from "@/store/ui";
import { useIsLeadership } from "@/hooks/use-capability";
import {
  STUDIO_LEADERSHIP_ROLES,
  DEPARTMENT_LEADERSHIP_ROLES,
} from "@/store/permissions";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  BroadcastComposer,
  BroadcastFeed,
} from "@/components/shared/broadcast";
import {
  AlertCircle,
  CheckCircle2,
  MonitorPlay,
  ListVideo,
  GripVertical,
  PlayCircle,
  Plus,
  X,
  FileText,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Image as ImageIcon, Video, Paperclip, Send } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import {
  useTasks,
  useUpdateTask,
  useDailyLogs,
  useDailyLogsByUser,
  useAddDailyLog,
} from "@/hooks/useTasks";
import { fadeInUp, DURATION } from "@/lib/motion";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function PlaylistItem({
  task,
  index,
  onRemove,
}: {
  task: any;
  index: number;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
  });
  const users = useUserStore((s) => s.users);
  const assignee = users.find((u) => u.id === task.assignedTo);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-4 p-3 bg-card border border-border rounded-lg shadow-sm group"
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
        aria-label={`Drag to reorder ${task.title}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-5 h-5" />
      </button>
      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center font-mono text-xs text-muted-foreground font-bold">
        {String(index + 1).padStart(2, "0")}
      </div>
      <div className="flex-1">
        <div className="font-semibold text-sm">{task.title}</div>
        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
          <Avatar className="w-4 h-4">
            <AvatarImage src={assignee?.avatar} />
          </Avatar>
          {assignee?.name} • v001
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={onRemove}
      >
        Remove
      </Button>
    </div>
  );
}

// One "Recent Progress & Daily Logs" row. Daily logs are a real backend
// resource keyed by taskId (see hooks/useTasks.ts's useDailyLogs), not an
// inline field on the mock Task object anymore, so each row fetches its own
// task's logs and renders nothing if that task has none logged yet.
function DailyLogRow({ task }: { task: any }) {
  const { data: logs = [] } = useDailyLogs(task.id);
  const users = useUserStore((s) => s.users);
  if (logs.length === 0) return null;
  const assignee = users.find((u) => u.id === task.assignedTo);
  const latestLog = logs[logs.length - 1];
  return (
    <div className="p-4 hover:bg-muted/30 transition-colors">
      <div className="flex items-start gap-4">
        <Avatar className="w-8 h-8 mt-1">
          <AvatarImage src={assignee?.avatar} />
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <div className="font-medium text-sm">
              <span className="text-muted-foreground mr-1">
                {assignee?.name} logged
              </span>
              {latestLog.hours}h on {task.title}
            </div>
            <span className="text-xs text-muted-foreground">
              {new Date(latestLog.date).toLocaleDateString()}
            </span>
          </div>
          <div className="text-sm bg-muted/50 p-2.5 rounded-md text-muted-foreground italic border-l-2 border-primary">
            "{latestLog.note}"
          </div>
        </div>
      </div>
    </div>
  );
}

// One "Payroll & Attendance" table row. Hours-today is now a real,
// per-user backend aggregate (useDailyLogsByUser) rather than an inline
// task.dailyLogs field summed across a member's tasks, so hooks can't run
// per-member inside payrollRows's useMemo/loop — each row fetches its own
// member's logs, matching the DailyLogRow pattern above. The computed
// total is also reported up to the parent (onHoursComputed) so the CSV
// export — a synchronous, non-hook button handler — can include real
// numbers instead of always exporting zeroes.
function PayrollRow({
  member,
  memberDept,
  isApproved,
  onViewLogs,
  onHoursComputed,
}: {
  member: any;
  memberDept: any;
  isApproved: boolean;
  onViewLogs: () => void;
  onHoursComputed: (memberId: string, hours: number) => void;
}) {
  const { data: logs = [] } = useDailyLogsByUser(member.id);
  const today = new Date().toISOString().split("T")[0];
  const totalHoursToday = logs
    .filter((log) => log.date.startsWith(today))
    .reduce((acc, log) => acc + log.hours, 0);
  // Real backend User rows have no `capacity` column (mock-only field) --
  // treat it as unknown rather than a verified 0%, so a real employee never
  // silently reads as a healthy/green load.
  const hasCapacity = typeof member.capacity === "number";
  const isOverloaded = hasCapacity && member.capacity > 95;

  useEffect(() => {
    onHoursComputed(member.id, totalHoursToday);
  }, [member.id, totalHoursToday, onHoursComputed]);

  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar className="w-8 h-8">
            <AvatarImage src={member.avatar} />
            <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <span className="font-medium">{member.name}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="text-sm">{member.title}</div>
        <div className="text-xs text-muted-foreground">
          {memberDept?.name}
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        {member.punchedInAt ? (
          <Badge
            variant="outline"
            className="bg-green-500/10 text-green-500 border-green-500/20 text-[10px]"
          >
            PUNCHED IN
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="bg-red-500/10 text-red-500 border-red-500/20 text-[10px]"
          >
            AWAY
          </Badge>
        )}
      </td>
      <td className="px-4 py-3 text-center font-mono relative">
        <span
          className={
            totalHoursToday === 0
              ? "text-muted-foreground opacity-50"
              : totalHoursToday > 8
                ? "text-amber-500 font-bold"
                : "text-primary font-bold"
          }
        >
          {totalHoursToday}h
        </span>
        {isApproved && totalHoursToday > 0 && (
          <CheckCircle2 className="w-3 h-3 text-green-500 absolute top-1/2 -translate-y-1/2 right-4" />
        )}
      </td>
      <td className="px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${!hasCapacity ? "bg-muted-foreground/40" : isOverloaded ? "bg-red-500" : "bg-green-500"}`}
          />
          <span>{hasCapacity ? `${member.capacity}%` : "—"}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={onViewLogs}
        >
          View Logs
        </Button>
      </td>
    </tr>
  );
}

export default function DailyStandup() {
  const { currentUser } = useAuthStore();
  const users = useUserStore((s) => s.users);
  const departments = useDepartmentStore((s) => s.departments);
  const projects = useProjectStore((s) => s.projects);
  const { data: tasks = [] } = useTasks();
  const updateTaskMutation = useUpdateTask();
  const addDailyLog = useAddDailyLog();
  const standupUpdates = useStandupsStore((s) => s.updates);
  const addStandupUpdate = useStandupsStore((s) => s.addUpdate);
  const playlistIds = useStandupsStore((s) => s.playlist);
  const addToPlaylistStore = useStandupsStore((s) => s.addToPlaylist);
  const removeFromPlaylistStore = useStandupsStore((s) => s.removeFromPlaylist);
  const setPlaylistStore = useStandupsStore((s) => s.setPlaylist);
  const clearPlaylistStore = useStandupsStore((s) => s.clearPlaylist);
  const broadcasts = useBroadcastsStore((s) => s.broadcasts);
  const { setActiveTaskDrawer } = useUIStore();
  const isLeadership = useIsLeadership();
  const [selectedDeptId, setSelectedDeptId] = useState<string>("ALL");
  const [sessionActive, setSessionActive] = useState(false);
  const [approvedUsers, setApprovedUsers] = useState<Set<string>>(new Set());
  const [updateText, setUpdateText] = useState("");
  const [updateHours, setUpdateHours] = useState("8");
  const [postTaskId, setPostTaskId] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [logTaskId, setLogTaskId] = useState("");
  const [logHours, setLogHours] = useState("8");
  const [logNote, setLogNote] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  // Per-member hours-today, reported up from each PayrollRow (which fetches
  // its own member's logs via useDailyLogsByUser — see that component's
  // comment). Feeds both the payroll table and the CSV export, which can't
  // call hooks itself.
  const [hoursByMemberId, setHoursByMemberId] = useState<
    Record<string, number>
  >({});
  const reportMemberHours = useCallback((memberId: string, hours: number) => {
    setHoursByMemberId((prev) =>
      prev[memberId] === hours ? prev : { ...prev, [memberId]: hours },
    );
  }, []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const playlistSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Tasks now come from the real backend (useTasks(), above); standup
  // updates still live in a persisted Zustand store (see
  // src/store/standups.ts). This poll is a connectivity heartbeat against
  // the (decorative) apiClient stub, kept so a real backend could slot in
  // later; a failed poll surfaces as a stale-data banner instead of only
  // logging to the console.
  const fetchData = async () => {
    try {
      await apiClient.get("/tasks");
      setSyncError(false);
    } catch (e) {
      console.error(e);
      setSyncError(true);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const isAllDepts = selectedDeptId === "ALL";
  const dept = isAllDepts
    ? null
    : departments.find((d) => d.id === selectedDeptId);
  const team = isAllDepts
    ? users
    : users.filter((u) => u.departmentId === selectedDeptId);

  // Playlist entries derived live from the persisted id order + the current
  // task list, so it always reflects real task data (title/status/assignee)
  // instead of a stale snapshot captured at add-time.
  const playlist = useMemo(
    () =>
      playlistIds
        .map((id) => tasks.find((t) => t.id === id))
        .filter((t): t is (typeof tasks)[number] => Boolean(t)),
    [playlistIds, tasks],
  );

  // A task is "awaiting lead/supervisor review" once it's either been
  // quick-submitted (status 'review') or pushed through the formal review
  // player chain (status 'lead-review' directly) - same two-status
  // convention TaskDrawer.tsx uses for gating Approve/Reject actions.
  // Filtering on 'review' alone silently dropped every lead-review task
  // from the Dailies Playlist Builder's "Ready for Review" queue.
  const pendingReviewTasks = tasks.filter(
    (t) =>
      (isAllDepts || t.department === dept?.name) &&
      ["review", "lead-review", "pm-review"].includes(t.status),
  );

  // Updates posted from the "My Updates" form, mapped with the full user
  // object + a display time, the same shape the feed previously expected
  // from the apiClient stub.
  const feedUpdates = standupUpdates
    .map((update) => {
      const user = users.find((u) => u.id === update.userId) || currentUser;
      return {
        ...update,
        user,
        time: new Date(update.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
    })
    .filter((update) => {
      if (!currentUser) return false;
      // RBAC: Main production managers see everything.
      if (STUDIO_LEADERSHIP_ROLES.includes(currentUser.role)) return true;

      // RBAC: Dept managers/leads see their dept + their own updates
      if (DEPARTMENT_LEADERSHIP_ROLES.includes(currentUser.role)) {
        return (
          update.user?.departmentId === currentUser.departmentId ||
          update.userId === currentUser.id
        );
      }

      // RBAC: Artists only see their own updates
      return update.userId === currentUser.id;
    });

  // Hours-today per member is fetched per-row by PayrollRow (real backend
  // data, see that component) and reported back into hoursByMemberId — this
  // memo just joins that with the roster/department/approval info the table
  // and CSV export both need. See PayrollRow's comment for why the fetch
  // can't happen here directly (hooks can't run inside a loop/useMemo).
  const payrollRows = useMemo(
    () =>
      team.map((member) => {
        const memberDept = departments.find(
          (d) => d.id === member.departmentId,
        );
        return {
          member,
          memberDept,
          totalHoursToday: hoursByMemberId[member.id] ?? 0,
          isOverloaded:
            typeof member.capacity === "number" && member.capacity > 95,
          isApproved: approvedUsers.has(member.id),
        };
      }),
    [team, approvedUsers, hoursByMemberId],
  );

  if (!currentUser) return null;

  const myTasks = tasks.filter((t) => t.assignedTo === currentUser.id);

  const addToPlaylist = (task: any) => {
    if (!playlistIds.includes(task.id)) {
      addToPlaylistStore(task.id);
      toast({
        title: "Added to Playlist",
        description: `${task.title} queued for dailies.`,
      });
    }
  };

  const handlePlaylistDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = playlistIds.indexOf(active.id as string);
    const newIndex = playlistIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    setPlaylistStore(arrayMove(playlistIds, oldIndex, newIndex));
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setAttachedFiles((prev) => [...prev, ...Array.from(files)]);
    toast({
      title: "Attachment Added",
      description: `${files.length} file(s) staged for this update.`,
    });
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUnblock = (taskId: string) => {
    updateTaskMutation.mutate({ id: taskId, status: "in-progress" });
    toast({
      title: "Task Unbottleneck",
      description: "The task has been moved back to in-progress.",
    });
  };

  const handlePostUpdate = () => {
    if (!updateText.trim()) return;
    setIsPosting(true);
    // Small delay so the existing "Posting..." spinner state remains
    // visible, using the shared fast-cut duration from lib/motion.
    setTimeout(() => {
      addStandupUpdate({
        id: `su-${Date.now()}`,
        userId: currentUser.id,
        taskId: postTaskId || myTasks[0]?.id || null,
        text: updateText,
        hours: Number(updateHours) || 0,
        timestamp: new Date().toISOString(),
      });
      toast({
        title: "Update Posted!",
        description: "Your daily progress has been shared.",
      });
      setUpdateText("");
      setAttachedFiles([]);
      setIsPosting(false);
    }, DURATION.fast * 1000);
  };

  const handleLogUpdateSubmit = () => {
    const resolvedTaskId = logTaskId || myTasks[0]?.id;
    const hoursNum = parseFloat(logHours);
    if (!resolvedTaskId || !hoursNum || hoursNum <= 0) {
      toast({
        title: "Missing Info",
        description: "Select a task and enter valid hours.",
        variant: "destructive",
      });
      return;
    }
    addDailyLog.mutate(
      {
        taskId: resolvedTaskId,
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
          setLogDialogOpen(false);
          setLogTaskId("");
          setLogHours("8");
          setLogNote("");
        },
        onError: () => {
          toast({
            title: "Log Failed",
            description:
              "Couldn't record your update — the selected task may not exist on the backend yet.",
            variant: "destructive",
          });
        },
      },
    );
  };

  // Simplified from the old logic, which prioritized opening a task that
  // already had logs (memberTasks.find((t) => t.dailyLogs.length > 0)):
  // dailyLogs is no longer an inline field, so "has logs" can't be checked
  // without a full per-task fetch. Always opens the member's first task —
  // a minor UX trade-off; the drawer itself still shows that task's real
  // logs correctly via useDailyLogs, whichever task ends up open.
  const handleViewLogs = (memberId: string, memberName: string) => {
    const memberTasks = tasks.filter((t) => t.assignedTo === memberId);
    const taskToOpen = memberTasks[0];
    if (taskToOpen) {
      setActiveTaskDrawer(taskToOpen.id);
    } else {
      toast({
        title: "No Timesheet Data",
        description: `${memberName} has no logged tasks yet.`,
      });
    }
  };

  const escapePayrollCSVValue = (value: unknown) => {
    const s = String(value ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const handleExportPayrollCSV = () => {
    const headers = [
      "Employee",
      "Role",
      "Department",
      "Status",
      "Hours Today",
      "Capacity %",
      "Timesheet Approved",
    ];
    const rows = payrollRows.map(
      ({ member, memberDept, totalHoursToday, isApproved }) => [
        member.name,
        member.title,
        memberDept?.name ?? "",
        member.punchedInAt ? "Punched In" : "Away",
        totalHoursToday,
        typeof member.capacity === "number" ? member.capacity : "",
        isApproved ? "Yes" : "No",
      ],
    );
    const csv = [headers, ...rows]
      .map((r) => r.map(escapePayrollCSVValue).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-attendance-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Export Complete",
      description: `${payrollRows.length} employee records exported to CSV.`,
    });
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <MonitorPlay className="w-8 h-8 text-primary" />
            Daily Standup
          </h1>
          <p className="text-muted-foreground mt-1">
            Review team progress, blockers, and build daily playlists
          </p>
        </div>

        {/* Department Switcher */}
        {isLeadership && (
          <select
            className="h-10 rounded-md border border-border bg-card px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            value={selectedDeptId}
            onChange={(e) => setSelectedDeptId(e.target.value)}
          >
            <option value="ALL">All Departments (Studio-Wide)</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <AnimatePresence>
        {syncError && (
          <motion.div
            {...fadeInUp}
            className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400"
          >
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            Live sync failed — showing last known data. Retrying automatically…
          </motion.div>
        )}
      </AnimatePresence>

      <Tabs
        defaultValue={isLeadership ? "overview" : "updates"}
        className="w-full"
      >
        <TabsList className="mb-4">
          {isLeadership && (
            <>
              <TabsTrigger value="overview">Team Overview</TabsTrigger>
              <TabsTrigger value="playlist" className="flex items-center gap-2">
                <ListVideo className="w-4 h-4" /> Dailies Playlist Builder
              </TabsTrigger>
            </>
          )}
          <TabsTrigger value="updates" className="flex items-center gap-2">
            <ListVideo className="w-4 h-4" /> My Updates & Feed
          </TabsTrigger>
          <TabsTrigger value="broadcasts" className="flex items-center gap-2">
            <Radio className="w-4 h-4" /> Broadcasts
          </TabsTrigger>
          {["production_head", "producer"].includes(
            currentUser.role,
          ) && (
            <TabsTrigger
              value="payroll"
              className="flex items-center gap-2 text-amber-600 dark:text-amber-400"
            >
              <CheckCircle2 className="w-4 h-4" /> Payroll & Attendance
            </TabsTrigger>
          )}
        </TabsList>

        {isLeadership && (
          <>
            <TabsContent value="overview">
              <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                {/* Left Column: Team Status Overview */}
                <div className="xl:col-span-1 space-y-4">
                  <Card className="border-border/50 bg-muted/20">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
                        Team Roster
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {team.map((member) => {
                        const hasCapacity =
                          typeof member.capacity === "number";
                        const isOverloaded =
                          hasCapacity && member.capacity > 95;
                        const isAway = member.status !== "active";

                        return (
                          <div
                            key={member.id}
                            className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <Avatar className="w-8 h-8">
                                <AvatarImage src={member.avatar} />
                                <AvatarFallback>
                                  {member.name.charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="text-sm font-medium">
                                  {member.name}
                                </div>
                                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  {isAway ? (
                                    <span className="text-red-500">
                                      Away/Leave
                                    </span>
                                  ) : (
                                    <>
                                      <div
                                        className={`w-1.5 h-1.5 rounded-full ${!hasCapacity ? "bg-muted-foreground/40" : isOverloaded ? "bg-red-500" : "bg-green-500"}`}
                                      />
                                      Cap:{" "}
                                      {hasCapacity
                                        ? `${member.capacity}%`
                                        : "—"}
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            {isOverloaded && (
                              <AlertCircle className="w-4 h-4 text-red-500" />
                            )}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                </div>

                {/* Right Columns: Active Tasks & Blockers */}
                <div className="xl:col-span-3 space-y-6">
                  {/* Bottleneck or At Risk */}
                  <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                      <AlertCircle className="w-5 h-5 text-red-500" />
                      Bottleneck / Needs Attention
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {tasks
                        .filter(
                          (t) =>
                            (isAllDepts || t.department === dept?.name) &&
                            (t.status === "bottleneck" ||
                              t.weeklyRating === "at-risk" ||
                              t.weeklyRating === "behind"),
                        )
                        .slice(0, 4)
                        .map((task) => {
                          const assignee = users.find(
                            (u) => u.id === task.assignedTo,
                          );
                          return (
                            <Card
                              key={task.id}
                              className="border-red-500/20 bg-red-500/5"
                            >
                              <CardContent className="p-4">
                                <div className="flex justify-between items-start mb-2">
                                  <div className="flex gap-2">
                                    <StatusBadge status={task.status} />
                                    {task.weeklyRating && (
                                      <Badge
                                        variant="outline"
                                        className="text-red-500 border-red-500/30 bg-red-500/10 text-[10px] uppercase"
                                      >
                                        Rating: {task.weeklyRating}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <div className="font-semibold text-sm mb-3">
                                  {task.title}
                                </div>
                                <div className="flex items-center justify-between mt-auto pt-3 border-t border-border/50">
                                  <div className="flex items-center gap-2">
                                    <Avatar className="w-6 h-6">
                                      <AvatarImage src={assignee?.avatar} />
                                    </Avatar>
                                    <span className="text-xs text-muted-foreground">
                                      {assignee?.name}
                                    </span>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs border-red-500/20 hover:bg-red-500/10 hover:text-red-500"
                                    onClick={() => handleUnblock(task.id)}
                                  >
                                    Unblock
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                    </div>
                  </div>

                  {/* Yesterday's Progress / Daily Logs */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                        Recent Progress & Daily Logs
                      </h3>
                      <Dialog
                        open={logDialogOpen}
                        onOpenChange={(open) => {
                          setLogDialogOpen(open);
                          if (open) setLogTaskId(myTasks[0]?.id ?? "");
                        }}
                      >
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            className="bg-primary text-primary-foreground hover:bg-primary/90"
                          >
                            <Plus className="w-4 h-4 mr-2" /> Log Update
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Submit Daily Log</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <Label>Task</Label>
                              <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                value={logTaskId}
                                onChange={(e) => setLogTaskId(e.target.value)}
                              >
                                {myTasks.length === 0 && (
                                  <option value="">No tasks assigned</option>
                                )}
                                {myTasks.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.title}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-2">
                              <Label>Hours Spent</Label>
                              <Input
                                type="number"
                                value={logHours}
                                onChange={(e) => setLogHours(e.target.value)}
                                min="0"
                                max="24"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Update Notes</Label>
                              <textarea
                                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                placeholder="What did you accomplish today? Any blockers?"
                                value={logNote}
                                onChange={(e) => setLogNote(e.target.value)}
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button
                              onClick={handleLogUpdateSubmit}
                              disabled={myTasks.length === 0}
                            >
                              Submit Update
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <Card className="border-border/50">
                      <CardContent className="p-0">
                        <div className="divide-y divide-border">
                          {/* Daily logs are a real, per-task backend resource
                              now (useDailyLogs), not an inline task.dailyLogs
                              array, so which tasks actually have logs can't
                              be known before fetching. Each candidate task
                              (dept-filtered, capped at 8) gets its own
                              DailyLogRow, which fetches that task's logs and
                              renders nothing if there are none — so this list
                              may show fewer than 8 rows even when more than 8
                              tasks in the department have logged time. */}
                          {tasks
                            .filter(
                              (t) => isAllDepts || t.department === dept?.name,
                            )
                            .slice(0, 8)
                            .map((task) => (
                              <DailyLogRow key={task.id} task={task} />
                            ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="playlist">
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Left: Pending Reviews */}
                <div className="xl:col-span-1 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-lg">Ready for Review</h3>
                    <Badge variant="secondary">
                      {pendingReviewTasks.length}
                    </Badge>
                  </div>
                  <Card className="border-border/50 bg-muted/10 h-[600px] overflow-y-auto">
                    <CardContent className="p-3 space-y-2">
                      {pendingReviewTasks.map((task) => {
                        const assignee = users.find(
                          (u) => u.id === task.assignedTo,
                        );
                        return (
                          <div
                            key={task.id}
                            className="p-3 bg-card border border-border rounded-lg group hover:border-primary/50 transition-colors"
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div className="font-medium text-sm">
                                {task.title}
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-primary"
                                onClick={() => addToPlaylist(task)}
                              >
                                <Plus className="w-4 h-4" />
                              </Button>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Avatar className="w-5 h-5">
                                <AvatarImage src={assignee?.avatar} />
                              </Avatar>
                              {assignee?.name}
                            </div>
                          </div>
                        );
                      })}
                      {pendingReviewTasks.length === 0 && (
                        <div className="text-center py-10 text-muted-foreground text-sm">
                          No tasks pending review in this department.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Right: Playlist Builder timeline */}
                <div className="xl:col-span-2 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      <ListVideo className="w-5 h-5 text-purple-500" /> Morning
                      Dailies Playlist
                    </h3>
                    <Button
                      className={
                        sessionActive
                          ? "bg-green-600 hover:bg-green-700 text-white"
                          : "bg-purple-600 hover:bg-purple-700 text-white"
                      }
                      disabled={playlist.length === 0 && !sessionActive}
                      onClick={() => {
                        if (sessionActive) {
                          setSessionActive(false);
                          clearPlaylistStore();
                          toast({
                            title: "Session Ended",
                            description: "Playlist cleared.",
                          });
                        } else {
                          setSessionActive(true);
                          toast({
                            title: "Dailies Session Started",
                            description: `Launched RV with ${playlist.length} shots queued.`,
                          });
                        }
                      }}
                    >
                      <PlayCircle className="w-4 h-4 mr-2" />{" "}
                      {sessionActive ? "End Session" : "Start Dailies Session"}
                    </Button>
                  </div>

                  <Card className="border-purple-500/20 bg-purple-500/5 h-[600px]">
                    <CardContent className="p-6">
                      {playlist.length === 0 ? (
                        <Empty className="h-full border-2 border-purple-500/20 rounded-xl bg-card/50">
                          <EmptyHeader>
                            <EmptyMedia
                              variant="icon"
                              className="bg-purple-500/10 text-purple-500"
                            >
                              <ListVideo className="w-8 h-8" />
                            </EmptyMedia>
                            <EmptyTitle>No shots queued</EmptyTitle>
                            <EmptyDescription>
                              Click the '+' on a task to add it to today's
                              playlist
                            </EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      ) : (
                        <DndContext
                          sensors={playlistSensors}
                          collisionDetection={closestCenter}
                          onDragEnd={handlePlaylistDragEnd}
                        >
                          <SortableContext
                            items={playlistIds}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="space-y-3">
                              {playlist.map((task, idx) => (
                                <PlaylistItem
                                  key={task.id}
                                  task={task}
                                  index={idx}
                                  onRemove={() =>
                                    removeFromPlaylistStore(task.id)
                                  }
                                />
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>
          </>
        )}

        {/* --- NEW TAB: MY UPDATES --- */}
        <TabsContent value="updates">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Log Update Form */}
            <div className="lg:col-span-1 space-y-6">
              <Card className="border-border/50 bg-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Plus className="w-5 h-5 text-primary" /> Post Daily Update
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Select Task</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      value={postTaskId || myTasks[0]?.id || ""}
                      onChange={(e) => setPostTaskId(e.target.value)}
                    >
                      {myTasks.length === 0 && (
                        <option value="">No tasks assigned</option>
                      )}
                      {myTasks.map((t) => (
                        <option
                          key={t.id}
                          value={t.id}
                          className="bg-background"
                        >
                          {t.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label>Hours Logged</Label>
                    <Input
                      type="number"
                      value={updateHours}
                      onChange={(e) => setUpdateHours(e.target.value)}
                      min="0"
                      max="24"
                      className="h-9"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>What did you accomplish?</Label>
                    <Textarea
                      placeholder="Write your update here... Mention any blockers."
                      value={updateText}
                      onChange={(e) => setUpdateText(e.target.value)}
                      className="min-h-[100px] resize-none"
                    />
                  </div>

                  {/* Media Upload Area */}
                  <div className="space-y-2">
                    <Label>Attachments (Optional)</Label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="video/mp4,video/quicktime,image/jpeg,image/png"
                      className="hidden"
                      onChange={(e) => {
                        handleFilesSelected(e.target.files);
                        e.target.value = "";
                      }}
                    />
                    <div
                      role="button"
                      tabIndex={0}
                      className={cn(
                        "border-2 border-dashed rounded-lg p-4 text-center hover:bg-muted/30 transition-colors cursor-pointer group",
                        isDraggingFile
                          ? "border-primary bg-primary/5"
                          : "border-border/50",
                      )}
                      onClick={() => fileInputRef.current?.click()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          fileInputRef.current?.click();
                        }
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDraggingFile(true);
                      }}
                      onDragLeave={() => setIsDraggingFile(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDraggingFile(false);
                        handleFilesSelected(e.dataTransfer.files);
                      }}
                    >
                      <div className="flex justify-center gap-4 mb-2 text-muted-foreground group-hover:text-primary transition-colors">
                        <ImageIcon className="w-6 h-6" />
                        <Video className="w-6 h-6" />
                        <Paperclip className="w-6 h-6" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Drag & drop images, shorts, or videos here, or click to
                        browse
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Supports MP4, MOV, JPG, PNG (Max 50MB)
                      </p>
                    </div>
                    {attachedFiles.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        {attachedFiles.map((file, i) => (
                          <div
                            key={`${file.name}-${i}`}
                            className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-muted/30 px-2.5 py-1.5 text-xs"
                          >
                            <span className="flex items-center gap-1.5 min-w-0 text-foreground/90">
                              <FileText className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                              <span className="truncate">{file.name}</span>
                              <span className="text-muted-foreground flex-shrink-0">
                                ({Math.max(1, Math.round(file.size / 1024))} KB)
                              </span>
                            </span>
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-red-500 flex-shrink-0"
                              onClick={() => handleRemoveAttachment(i)}
                              aria-label={`Remove ${file.name}`}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <Button
                    className="w-full mt-2"
                    onClick={handlePostUpdate}
                    disabled={isPosting}
                  >
                    {isPosting ? (
                      <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    {isPosting ? "Posting..." : "Post Update"}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Right: Team Feed */}
            <div className="lg:col-span-2 space-y-4">
              <h3 className="font-semibold text-lg mb-4">Team Updates Feed</h3>

              {/* Dynamic User Updates */}
              {feedUpdates.map((update) => (
                <Card
                  key={update.id}
                  className="border-primary/50 bg-primary/5 overflow-hidden animate-in fade-in slide-in-from-bottom-2"
                >
                  <CardContent className="p-0">
                    <div className="p-4 flex items-start gap-3">
                      <Avatar className="w-10 h-10 border border-primary/50">
                        <AvatarImage src={update.user?.avatar} />
                        <AvatarFallback>
                          {update.user?.name?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-baseline justify-between">
                          <div className="font-semibold text-sm">
                            {update.user?.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {update.time}
                          </div>
                        </div>
                        <div className="text-xs text-primary mb-2 flex items-center gap-1">
                          <Badge
                            variant="outline"
                            className="text-[10px] h-5 border-primary/30 bg-primary/10"
                          >
                            Recent Update
                          </Badge>
                          <span className="text-muted-foreground ml-1">
                            logged {update.hours}h
                          </span>
                        </div>
                        <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                          {update.text}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* --- NEW TAB: BROADCASTS --- */}
        <TabsContent value="broadcasts">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Renders nothing for roles without the broadcast_updates
                capability (see store/permissions.ts) — no visibility
                gating needed here. */}
            <BroadcastComposer
              projects={projects.map((p) => ({ id: p.id, name: p.name }))}
            />
            <BroadcastFeed broadcasts={broadcasts} />
          </div>
        </TabsContent>

        {/* --- NEW TAB: PAYROLL & ATTENDANCE --- */}
        {["production_head", "producer"].includes(
          currentUser.role,
        ) && (
          <TabsContent value="payroll">
            <Card className="border-border/50 bg-card">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xl">
                    Studio Payroll & Attendance
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Monitor logged hours and active statuses for{" "}
                    {isAllDepts ? "the entire studio" : dept?.name}.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportPayrollCSV}
                  >
                    Export CSV
                  </Button>
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                    onClick={() => {
                      const allMemberIds = new Set(team.map((m) => m.id));
                      setApprovedUsers(allMemberIds);
                      toast({
                        title: "Timesheets Approved",
                        description: `Approved hours for ${team.length} employees.`,
                      });
                    }}
                  >
                    Approve Timesheets
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border border-border">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold">
                      <tr>
                        <th className="px-4 py-3">Artist / Employee</th>
                        <th className="px-4 py-3">Role & Dept</th>
                        <th className="px-4 py-3 text-center">Status</th>
                        <th className="px-4 py-3 text-center">Hours Today</th>
                        <th className="px-4 py-3 text-center">Capacity</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {payrollRows.map(({ member, memberDept, isApproved }) => (
                        <PayrollRow
                          key={member.id}
                          member={member}
                          memberDept={memberDept}
                          isApproved={isApproved}
                          onViewLogs={() => handleViewLogs(member.id, member.name)}
                          onHoursComputed={reportMemberHours}
                        />
                      ))}
                    </tbody>
                  </table>
                  {team.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground">
                      No employees found in this view.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
