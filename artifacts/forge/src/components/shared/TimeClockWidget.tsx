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
import { isTaskActive, type DailyLog } from "@/data/mockData";
import { useToast } from "@/hooks/use-toast";

const STORAGE_PREFIX = "forge-punch-in-time-";

/**
 * Real punch clock: punching in only starts a local session timer (no time
 * is "logged" yet), and punching out writes one real DailyLog entry into the
 * canonical Task.dailyLogs/actualHours (store/tasks.ts) — the same data
 * TaskDrawer and the Timesheets page read and write — instead of the old
 * ever-growing, un-resettable localStorage counter that never produced any
 * real logged time and had no punch-out control at all.
 */
export function TimeClockWidget() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const logout = useAuthStore((s) => s.logout);
  const [, setLocation] = useLocation();
  const tasks = useTasksStore((s) => s.tasks);
  const logTime = useTasksStore((s) => s.logTime);
  const { toast } = useToast();

  const [punchedIn, setPunchedIn] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [note, setNote] = useState("");

  const storageKey = currentUser ? `${STORAGE_PREFIX}${currentUser.id}` : null;
  const myTasks = currentUser
    ? tasks.filter(
        (t) => t.assigneeId === currentUser.id && isTaskActive(t.status),
      )
    : [];

  // Pick up an in-progress punch session whenever the signed-in user
  // changes; if there isn't one, start one automatically. Every login now
  // begins a work session by itself — clocking in is no longer a separate
  // manual step, matching punch-out's symmetric "punching out ends the
  // session" behavior (which also signs the user out).
  useEffect(() => {
    if (!storageKey) {
      setPunchedIn(false);
      setStartTime(null);
      return;
    }
    const stored = localStorage.getItem(storageKey);
    const start = stored ? parseInt(stored, 10) : Date.now();
    if (!stored) localStorage.setItem(storageKey, start.toString());
    setStartTime(start);
    setPunchedIn(true);
    setSelectedTaskId(
      (current) =>
        current ||
        myTasks.find((t) => t.status === "in-progress")?.id ||
        myTasks[0]?.id ||
        "",
    );
    // Deliberately keyed on storageKey only (not myTasks) — this should run
    // once per login/user-switch to open or resume a session, not re-run
    // (and re-derive selectedTaskId) every time the task list changes while
    // already punched in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

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

  if (!currentUser || !storageKey) return null;

  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handlePunchIn = () => {
    const now = Date.now();
    localStorage.setItem(storageKey, now.toString());
    setStartTime(now);
    setPunchedIn(true);
    // Default the eventual punch-out log to whatever task they're actively working, if any.
    setSelectedTaskId(
      myTasks.find((t) => t.status === "in-progress")?.id ??
        myTasks[0]?.id ??
        "",
    );
    setNote("");
  };

  const resetSession = () => {
    localStorage.removeItem(storageKey);
    setPunchedIn(false);
    setStartTime(null);
    setSeconds(0);
    setPopoverOpen(false);
    setNote("");
    setSelectedTaskId("");
  };

  const handleConfirmPunchOut = () => {
    const hours = Math.round((seconds / 3600) * 100) / 100;
    const task = selectedTaskId
      ? tasks.find((t) => t.id === selectedTaskId)
      : undefined;

    if (task && hours > 0) {
      const newLog: DailyLog = {
        date: new Date().toISOString().slice(0, 10),
        hours,
        note: note.trim() || "Clocked time",
        userId: currentUser.id,
      };
      logTime(task.id, newLog);
      toast({
        title: "Punched Out",
        description: `Logged ${hours}h to ${task.title}. You've been signed out.`,
      });
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
    resetSession();
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
        className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted/50 border border-border shrink-0 hover:bg-muted transition-colors"
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
