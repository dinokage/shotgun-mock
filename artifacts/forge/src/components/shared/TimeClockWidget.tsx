import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Clock, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store/auth";
import { useTasksStore } from "@/store/tasks";
import { isTaskActive } from "@/data/mockData";
import { getAssigneeId } from "@/lib/taskShape";
import { useToast } from "@/hooks/use-toast";
import { useAddDailyLog } from "@/hooks/useTasks";
import { usePunchIn, usePunchOut } from "@/hooks/useUsers";

/**
 * Real punch clock, backed by users.punched_in_at (not a per-browser
 * localStorage timer, and not auto-started on login) -- so punch state
 * survives a reload, is visible on any device, and only ever shows
 * "punched in" after someone has actually clicked Punch In. This used to
 * auto-open a session on every single login, which is exactly why
 * daily-standup.tsx's Payroll table (and everyone else) saw every employee
 * as permanently punched in.
 *
 * Punching in only starts the real timestamp (no time is "logged" yet);
 * punching out posts one real daily log via useAddDailyLog (hooks/
 * useTasks.ts) -- the same backend-synced mutation TaskDrawer and the
 * Timesheets page use -- then clears punched_in_at.
 */
export function TimeClockWidget() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const logout = useAuthStore((s) => s.logout);
  const [, setLocation] = useLocation();
  const tasks = useTasksStore((s) => s.tasks);
  const { toast } = useToast();
  const addDailyLogMutation = useAddDailyLog();
  const punchInMutation = usePunchIn();
  const punchOutMutation = usePunchOut();

  const [seconds, setSeconds] = useState(0);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [note, setNote] = useState("");

  const punchedIn = Boolean(currentUser?.punchedInAt);
  const startTime = currentUser?.punchedInAt
    ? new Date(currentUser.punchedInAt).getTime()
    : null;
  const myTasks = currentUser
    ? tasks.filter(
        (t) => getAssigneeId(t) === currentUser.id && isTaskActive(t.status),
      )
    : [];

  // Default the eventual punch-out log's task once a real session is
  // active. Deliberately keyed on punchedIn (not myTasks) -- this should
  // pick a default once when a session starts, not re-run and clobber a
  // manual selection every time the task list changes while punched in.
  useEffect(() => {
    if (!punchedIn) return;
    setSelectedTaskId(
      (current) =>
        current ||
        myTasks.find((t) => t.status === "in-progress")?.id ||
        myTasks[0]?.id ||
        "",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [punchedIn]);

  useEffect(() => {
    if (!punchedIn || startTime === null) {
      setSeconds(0);
      return;
    }
    const tick = () =>
      setSeconds(Math.max(0, Math.floor((Date.now() - startTime) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [punchedIn, startTime]);

  if (!currentUser) return null;

  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handlePunchIn = async () => {
    try {
      await punchInMutation.mutateAsync();
      setNote("");
    } catch {
      toast({
        title: "Couldn't Punch In",
        description: "Something went wrong — try again.",
        variant: "destructive",
      });
    }
  };

  const resetLocalState = () => {
    setSeconds(0);
    setPopoverOpen(false);
    setNote("");
    setSelectedTaskId("");
  };

  const handleConfirmPunchOut = async () => {
    const hours = Math.round((seconds / 3600) * 100) / 100;
    const task = selectedTaskId
      ? tasks.find((t) => t.id === selectedTaskId)
      : undefined;

    if (task && hours > 0) {
      try {
        await addDailyLogMutation.mutateAsync({
          taskId: task.id,
          date: new Date().toISOString().slice(0, 10),
          hours,
          note: note.trim() || "Clocked time",
        });
        toast({
          title: "Punched Out",
          description: `Logged ${hours}h to ${task.title}. You've been signed out.`,
        });
      } catch {
        toast({
          title: "Punched Out",
          description: `Couldn't log ${hours}h to ${task.title} — you've still been signed out.`,
          variant: "destructive",
        });
      }
    } else if (task) {
      toast({
        title: "Punched Out",
        description:
          "Session was too short to log any time. You've been signed out.",
      });
    } else {
      toast({
        title: "Punched Out",
        description:
          "No task selected — time was not logged. You've been signed out.",
      });
    }
    try {
      await punchOutMutation.mutateAsync();
    } catch {
      // Already logged the time above (or told the user we couldn't) --
      // clearing punched_in_at is best-effort at this point, since the
      // logout below ends the session either way.
    }
    resetLocalState();
    // Punching out ends the work session entirely — for every role, not
    // just artists — so it also signs the user out rather than leaving
    // them logged into an app they've just clocked off of.
    logout();
    setLocation("/login");
  };

  if (!punchedIn) {
    return (
      <button
        type="button"
        onClick={handlePunchIn}
        disabled={punchInMutation.isPending}
        className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted/50 border border-border shrink-0 hover:bg-muted transition-colors disabled:opacity-60"
      >
        <Clock className="w-3.5 h-3.5 hidden sm:block text-muted-foreground" />
        <span className="text-[11px] font-medium text-muted-foreground">
          Clock In
        </span>
      </button>
    );
  }

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted/50 border border-border shrink-0 hover:bg-muted transition-colors"
        >
          <Clock className="w-3.5 h-3.5 hidden sm:block text-primary" />
          <span className="text-[11px] font-medium tabular-nums text-foreground">
            {formatTime(seconds)}
          </span>
          <Badge
            variant="outline"
            className="ml-0.5 h-4 px-1 text-[9px] hidden lg:inline-flex bg-green-500/10 text-green-500 border-green-500/20"
          >
            PUNCHED IN
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div>
          <div className="text-sm font-semibold">Punch Out</div>
          <div className="text-xs text-muted-foreground timecode">
            {formatTime(seconds)} elapsed
          </div>
        </div>
        {myTasks.length > 0 ? (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Log this time to
              </label>
              <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Choose a task..." />
                </SelectTrigger>
                <SelectContent>
                  {myTasks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              placeholder="What did you work on? (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-8 text-xs"
            />
            <Button
              size="sm"
              className="w-full gap-1.5"
              onClick={handleConfirmPunchOut}
              disabled={!selectedTaskId}
            >
              <LogOut className="w-3.5 h-3.5" /> Punch Out & Log Time
            </Button>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              You have no assigned tasks to log this time against.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-1.5"
              onClick={handleConfirmPunchOut}
            >
              <LogOut className="w-3.5 h-3.5" /> Punch Out (no time logged)
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
