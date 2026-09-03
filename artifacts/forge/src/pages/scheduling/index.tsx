import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Cpu,
  Download,
  Users,
  CalendarRange,
  LineChart,
  UploadCloud,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTasksStore } from "@/store/tasks";
import { useUserStore } from "@/store/users";
import { useDepartmentStore } from "@/store/departments";
import { useProjectStore } from "@/store/projects";
import { useShots } from "@/hooks/useShots";
import { useCapability } from "@/hooks/use-capability";
import { apiFetch } from "@/lib/apiClient";
import { parseSpreadsheet, getField } from "@/lib/excelImport";
import TeamBoard from "./TeamBoard";
import TeamCalendar from "./TeamCalendar";
import CapacityForecast from "./CapacityForecast";

interface ImportRowResult {
  shotName: string;
  status: "imported" | "skipped";
  reason?: string;
}

type SchedulingView = "board" | "calendar" | "forecast";

const VIEWS: {
  id: SchedulingView;
  label: string;
  icon: typeof Users;
  description: string;
}[] = [
  {
    id: "board",
    label: "Team Board",
    icon: Users,
    description: "Drag tasks onto people to bulk-assign work",
  },
  {
    id: "calendar",
    label: "Team Calendar",
    icon: CalendarRange,
    description: "Per-person schedule with drag-to-reschedule",
  },
  {
    id: "forecast",
    label: "Capacity Forecast",
    icon: LineChart,
    description: "Studio headcount-days vs. availability",
  },
];

export default function Scheduling() {
  const { toast } = useToast();
  const [view, setView] = useState<SchedulingView>("board");
  const tasks = useTasksStore((s) => s.tasks);
  const reassignTask = useTasksStore((s) => s.reassignTask);
  const updateTaskStatus = useTasksStore((s) => s.updateTaskStatus);
  const setTasks = useTasksStore((s) => s.setTasks);
  const users = useUserStore((s) => s.users);
  const departments = useDepartmentStore((s) => s.departments);
  const projects = useProjectStore((s) => s.projects);
  const canImport = useCapability("create_tasks");

  const [importProjectId, setImportProjectId] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<ImportRowResult[] | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: importShots = [] } = useShots(importProjectId || undefined);

  const active = VIEWS.find((v) => v.id === view)!;

  // Finds every task actually stuck in the 'bottleneck' state and, per task,
  // reassigns it to the least-loaded active person in the same department
  // (falling back to leaving the assignee unchanged if nobody qualifies)
  // then moves it back into 'in-progress' — a real reassign/unblock via the
  // tasks store, not just a toast.
  const handleAutoResolve = () => {
    const bottlenecks = tasks.filter((t) => t.status === "bottleneck");
    if (bottlenecks.length === 0) {
      toast({
        title: "No bottlenecks found",
        description: "Every task is already on track.",
      });
      return;
    }
    bottlenecks.forEach((task) => {
      const dept = departments.find((d) => d.name === task.department);
      const candidates = users
        .filter(
          (u) =>
            u.role !== "client" &&
            u.status === "active" &&
            u.id !== task.assigneeId,
        )
        .filter((u) => !dept || u.departmentId === dept.id)
        .sort(
          (a, b) =>
            (a.capacity ?? Number.POSITIVE_INFINITY) -
            (b.capacity ?? Number.POSITIVE_INFINITY),
        );
      const replacement = candidates[0];
      if (replacement) reassignTask(task.id, replacement.id);
      updateTaskStatus(task.id, "in-progress");
    });
    toast({
      title: "Bottlenecks resolved",
      description: `Reassigned and unblocked ${bottlenecks.length} task${bottlenecks.length === 1 ? "" : "s"}.`,
    });
  };

  // Real Excel/CSV import: rows must reference a shot that already exists
  // in the chosen project (matched by name) -- this deliberately does NOT
  // auto-create shots from partial spreadsheet data, since a shot's
  // episode/sequence/complexity/etc. shouldn't be guessed. A row whose shot
  // can't be found is skipped and reported, not silently dropped.
  //
  // Expected columns (case/spacing-insensitive, see lib/excelImport.ts):
  // Shot Name (or Shot), Department, Assignee Email (or Assignee), Status,
  // Priority, Due Date (or Deadline), Description (or Notes). Adjust the
  // `getField` candidate lists below once real client spreadsheets are on
  // hand -- this is the one place their exact header names matter.
  const handleFileSelected = async (file: File) => {
    if (!importProjectId) {
      toast({
        title: "Select a project first",
        description: "Choose which project these rows belong to.",
        variant: "destructive",
      });
      return;
    }
    setImporting(true);
    setImportResults(null);
    try {
      const rows = await parseSpreadsheet(file);
      const results: ImportRowResult[] = [];
      const newlyCreated: (typeof tasks)[number][] = [];

      for (const row of rows) {
        const shotName = getField(row, ["Shot Name", "Shot", "Shot Code"]);
        if (!shotName) {
          results.push({ shotName: "(blank)", status: "skipped", reason: "No shot name in row" });
          continue;
        }
        const shot = importShots.find(
          (s) => s.name.toLowerCase() === shotName.toLowerCase(),
        );
        if (!shot) {
          results.push({ shotName, status: "skipped", reason: "No matching shot in this project" });
          continue;
        }

        const deptName = getField(row, ["Department", "Dept"]);
        const dept = deptName
          ? departments.find((d) => d.name.toLowerCase() === deptName.toLowerCase())
          : undefined;

        const assigneeEmail = getField(row, ["Assignee Email", "Assignee", "Artist Email", "Artist"]);
        const assignee = assigneeEmail
          ? users.find((u) => u.email.toLowerCase() === assigneeEmail.toLowerCase())
          : undefined;
        if (assigneeEmail && !assignee) {
          results.push({ shotName, status: "skipped", reason: `No user found for "${assigneeEmail}"` });
          continue;
        }
        if (assignee && assignee.role !== "artist") {
          results.push({ shotName, status: "skipped", reason: `${assignee.name} is not an artist` });
          continue;
        }

        const priorityRaw = getField(row, ["Priority"]).toLowerCase();
        const priority = (["low", "medium", "high", "critical"] as const).includes(
          priorityRaw as any,
        )
          ? (priorityRaw as "low" | "medium" | "high" | "critical")
          : "medium";

        const dueDateRaw = getField(row, ["Due Date", "Deadline"]);
        const dueDate = dueDateRaw && !Number.isNaN(Date.parse(dueDateRaw))
          ? new Date(dueDateRaw).toISOString()
          : undefined;

        const title = getField(row, ["Task", "Title"]) || shotName;
        const description = getField(row, ["Description", "Notes"]);

        try {
          const created = await apiFetch<{ id: string; status: string; createdAt: string }>(
            "/tasks",
            {
              method: "POST",
              body: JSON.stringify({
                entityId: shot.id,
                entityType: "shot",
                title,
                description,
                priority,
                department: dept?.name ?? null,
                pipelinePhase: dept?.abbreviation ?? "MAIN",
                dueDate,
                estimatedHours: 8,
                assignedTo: assignee?.id ?? null,
              }),
            },
          );
          newlyCreated.push({
            id: created.id,
            title,
            description,
            projectId: importProjectId,
            shotId: shot.id,
            assigneeId: assignee?.id ?? "",
            assignedById: "",
            status: (created.status as any) || "ready",
            priority,
            dueDate: dueDate ?? "",
            estimatedHours: 8,
            actualHours: 0,
            tags: ["imported"],
            dependencies: [],
            checklist: [],
            comments: [],
            attachments: [],
            department: dept?.name ?? "",
            createdAt: created.createdAt || new Date().toISOString(),
            lastStatusUpdate: new Date().toISOString(),
            dailyLogs: [],
            pipelinePhase: dept?.abbreviation ?? "MAIN",
            approvalHistory: [],
          } as any);
          results.push({ shotName, status: "imported" });
        } catch (err: any) {
          results.push({ shotName, status: "skipped", reason: err?.message || "Failed to create task" });
        }
      }

      if (newlyCreated.length > 0) {
        setTasks([...newlyCreated, ...tasks]);
      }
      setImportResults(results);
      const importedCount = results.filter((r) => r.status === "imported").length;
      toast({
        title: "Import finished",
        description: `${importedCount} of ${results.length} row${results.length === 1 ? "" : "s"} imported.`,
      });
    } catch (err: any) {
      toast({
        title: "Import failed",
        description: err?.message || "Could not read that file.",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="h-16 border-b border-border bg-card flex items-center justify-between px-6 shrink-0 z-20 gap-4">
        <div className="shrink-0">
          <h1 className="text-2xl font-bold tracking-tight">Scheduling</h1>
        </div>

        {/* Segmented view switcher */}
        <div className="flex items-center gap-1 bg-muted p-1 rounded-lg relative shrink-0">
          {VIEWS.map((v) => {
            const isActive = v.id === view;
            const Icon = v.icon;
            return (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={cn(
                  "relative px-3 py-1.5 text-sm font-medium rounded-md flex items-center gap-1.5 transition-colors",
                  isActive
                    ? "text-foreground hover:opacity-80"
                    : "text-muted-foreground hover:text-foreground/80 hover:bg-background/40",
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="scheduling-view-pill"
                    className="absolute inset-0 bg-background rounded-md shadow-sm"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5" />
                  {v.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 flex-1 justify-end min-w-0">
          <span className="text-xs text-muted-foreground hidden xl:block truncate">
            {active.description}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAutoResolve}
            className="border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/10 shrink-0"
          >
            <Cpu className="w-4 h-4 mr-2" /> Auto-Resolve Bottlenecks
          </Button>

          {canImport && (
            <Dialog
              onOpenChange={(open) => {
                if (!open) {
                  setImportProjectId("");
                  setImportResults(null);
                }
              }}
            >
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="shrink-0">
                  <Download className="w-4 h-4 mr-2" /> Import Schedule
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[700px]">
                <div className="space-y-6 py-2">
                  <div>
                    <h2 className="text-lg font-semibold">
                      Import Excel / CSV Schedule
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Bulk-create tasks for existing shots in a project.
                      Expected columns: Shot Name, Department, Assignee
                      Email, Priority, Due Date, Description (header names
                      are matched loosely — spacing/case don't matter).
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      Project
                    </label>
                    <Select
                      value={importProjectId}
                      onValueChange={setImportProjectId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select the project these rows belong to" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelected(file);
                      e.target.value = "";
                    }}
                  />
                  <div
                    className={cn(
                      "border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center justify-center text-center transition-colors group mb-4",
                      importProjectId
                        ? "hover:bg-muted/30 cursor-pointer"
                        : "opacity-50 cursor-not-allowed",
                    )}
                    onClick={() =>
                      importProjectId && fileInputRef.current?.click()
                    }
                  >
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                      <UploadCloud className="w-6 h-6 text-primary" />
                    </div>
                    <div className="font-semibold mb-1 text-sm">
                      {importing ? "Importing…" : "Upload Spreadsheet"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {importProjectId
                        ? "Select a .csv or .xlsx file"
                        : "Choose a project above first"}
                    </div>
                  </div>

                  {importResults && (
                    <div className="space-y-2 border border-border rounded-lg p-4 bg-muted/20 max-h-64 overflow-y-auto">
                      <h3 className="text-sm font-medium border-b border-border/50 pb-2">
                        Results ({importResults.filter((r) => r.status === "imported").length}/
                        {importResults.length} imported)
                      </h3>
                      {importResults.map((r, i) => (
                        <div
                          key={i}
                          className={cn(
                            "text-xs flex items-center justify-between gap-2",
                            r.status === "imported"
                              ? "text-emerald-500"
                              : "text-muted-foreground",
                          )}
                        >
                          <span className="truncate">{r.shotName}</span>
                          <span className="shrink-0">
                            {r.status === "imported" ? "Imported" : r.reason}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
                    <DialogClose asChild>
                      <Button variant="outline">Close</Button>
                    </DialogClose>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* View content */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute inset-0"
          >
            {view === "board" && <TeamBoard />}
            {view === "calendar" && <TeamCalendar />}
            {view === "forecast" && <CapacityForecast />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
