import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { useUIStore } from "@/store/ui";
import { useTasksStore } from "@/store/tasks";
import { useUserStore } from "@/store/users";
import { useDepartmentStore } from "@/store/departments";
import { useProjectStore } from "@/store/projects";
import { useEpisodes } from "@/hooks/useEpisodes";
import { useSequences } from "@/hooks/useSequences";
import { useShots } from "@/hooks/useShots";
import { useUploadFile } from "@/hooks/useUploads";
import { apiFetch } from "@/lib/apiClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Task, TaskStatus } from "@/data/mockData";
import { STUDIO_LEADERSHIP_ROLES } from "@/store/permissions";
import { UploadCloud, X, FileIcon } from "lucide-react";

export function CreateTaskModal() {
  const {
    createTaskModalOpen,
    setCreateTaskModalOpen,
    createTaskDefaultAssigneeId,
    setCreateTaskDefaultAssigneeId,
  } = useUIStore();
  const { tasks, setTasks } = useTasksStore();
  const { currentUser } = useAuthStore();
  const { toast } = useToast();
  const users = useUserStore((s) => s.users);
  const departments = useDepartmentStore((s) => s.departments);
  const projects = useProjectStore((s) => s.projects);
  const uploadFile = useUploadFile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [episodeId, setEpisodeId] = useState("");
  const [sequenceId, setSequenceId] = useState("");
  const [shotId, setShotId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] = useState<
    "low" | "medium" | "high" | "critical"
  >("medium");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { data: episodes = [] } = useEpisodes(projectId || undefined);
  const { data: sequences = [] } = useSequences(
    projectId || undefined,
    episodeId || undefined,
  );
  const { data: shots = [] } = useShots(projectId || undefined);
  // The real /shots list has no sequenceId query filter server-side (see
  // hooks/useShots.ts) -- filter client-side once a sequence is chosen,
  // same pattern already used elsewhere in this app (e.g. tracking.tsx).
  const shotsInSequence = sequenceId
    ? shots.filter((s) => s.sequenceId === sequenceId)
    : shots.filter((s) => !episodeId || s.episodeId === episodeId);

  // Changing an upstream picker invalidates whatever was chosen downstream.
  useEffect(() => {
    setEpisodeId("");
    setSequenceId("");
    setShotId("");
  }, [projectId]);
  useEffect(() => {
    setSequenceId("");
    setShotId("");
  }, [episodeId]);
  useEffect(() => {
    setShotId("");
  }, [sequenceId]);

  // Pre-fill the assignee when the modal is opened with a default (e.g. from
  // a person's profile page via "Assign Task").
  useEffect(() => {
    if (createTaskModalOpen && createTaskDefaultAssigneeId) {
      setAssigneeId(createTaskDefaultAssigneeId);
    }
  }, [createTaskModalOpen, createTaskDefaultAssigneeId]);

  const handleOpenChange = (open: boolean) => {
    setCreateTaskModalOpen(open);
    if (!open) {
      setCreateTaskDefaultAssigneeId(null);
      setPendingFiles([]);
    }
  };

  if (!currentUser) return null;

  // VFX Producers / PMs / Coordinators can assign across the whole studio;
  // everyone else (including Supervisors/Leads) can only assign within their
  // own department. Uses the shared STUDIO_LEADERSHIP_ROLES list from
  // store/permissions.ts (also used by home.tsx) instead of a local copy.
  const isStudioLeadership = STUDIO_LEADERSHIP_ROLES.includes(currentUser.role);

  const availableUsers = users.filter(
    (u) => isStudioLeadership || u.departmentId === currentUser.departmentId,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title || !projectId || !shotId || !assigneeId) {
      toast({
        title: "Missing fields",
        description:
          "Please fill out all required fields, including the shot this task belongs to.",
        variant: "destructive",
      });
      return;
    }

    const dept = users.find((u) => u.id === assigneeId)?.departmentId;
    const departmentName =
      departments.find((d) => d.id === dept)?.name || "General";

    setSubmitting(true);
    try {
      // Create against the real backend directly (rather than the
      // optimistic-only useTasksStore.addTask) so this modal gets back the
      // task's REAL id -- attachments must be linked to that real id via
      // POST /tasks/:id/attachments, which doesn't exist until creation
      // succeeds.
      const created = await apiFetch<{
        id: string;
        status: string;
        createdAt: string;
      }>("/tasks", {
        method: "POST",
        body: JSON.stringify({
          entityId: shotId,
          entityType: "shot",
          title,
          description,
          priority,
          department: departmentName,
          pipelinePhase: "MAIN",
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          estimatedHours: 8,
          assignedTo: assigneeId,
        }),
      });

      for (const file of pendingFiles) {
        const uploaded = await uploadFile.mutateAsync(file);
        await apiFetch(`/tasks/${created.id}/attachments`, {
          method: "POST",
          body: JSON.stringify({ url: uploaded.url }),
        });
      }

      // Mirror the real record into the local optimistic store using the
      // mock Task shape the rest of the app still reads (see store/tasks.ts
      // -- full migration off this shape is tracked separately), but keyed
      // by the REAL id this time.
      const newTask: Task = {
        id: created.id,
        title,
        description,
        projectId,
        shotId,
        assigneeId,
        assignedById: currentUser.id,
        status: (created.status as TaskStatus) || "todo",
        priority,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0],
        estimatedHours: 8,
        actualHours: 0,
        tags: [],
        dependencies: [],
        checklist: [],
        comments: [],
        attachments: [],
        department: departmentName,
        createdAt: created.createdAt || new Date().toISOString(),
        lastStatusUpdate: new Date().toISOString(),
        dailyLogs: [],
        pipelinePhase: "MAIN",
        approvalHistory: [],
      };
      setTasks([newTask, ...tasks]);

      toast({
        title: "Task Assigned",
        description: `Successfully assigned "${title}" to ${users.find((u) => u.id === assigneeId)?.name}.`,
      });

      // Reset and close
      setTitle("");
      setDescription("");
      setProjectId("");
      setEpisodeId("");
      setSequenceId("");
      setShotId("");
      setAssigneeId("");
      setPriority("medium");
      setPendingFiles([]);
      setCreateTaskDefaultAssigneeId(null);
      setCreateTaskModalOpen(false);
    } catch (err: any) {
      toast({
        title: "Failed to assign task",
        description: err?.message || "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={createTaskModalOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Assign New Task</DialogTitle>
          <DialogDescription>
            Create a new task and assign it to an artist in your department.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Task Title</Label>
            <Input
              id="title"
              placeholder="e.g. Rig Main Character"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="desc">Description (Optional)</Label>
            <Input
              id="desc"
              placeholder="Brief details about the task..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Project" />
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
            <div className="space-y-2">
              <Label>Assignee</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Artist" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Episode {episodes.length === 0 && "(none)"}</Label>
              <Select
                value={episodeId}
                onValueChange={setEpisodeId}
                disabled={!projectId || episodes.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Episode" />
                </SelectTrigger>
                <SelectContent>
                  {episodes.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sequence {sequences.length === 0 && "(none)"}</Label>
              <Select
                value={sequenceId}
                onValueChange={setSequenceId}
                disabled={!projectId || sequences.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Sequence" />
                </SelectTrigger>
                <SelectContent>
                  {sequences.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Shot *</Label>
              <Select
                value={shotId}
                onValueChange={setShotId}
                disabled={!projectId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Shot" />
                </SelectTrigger>
                <SelectContent>
                  {shotsInSequence.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Priority</Label>
            <Select
              value={priority}
              onValueChange={(val: any) => setPriority(val)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 pt-2">
            <Label>Attachments (Reference Art, Scripts, DCC Files)</Label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                setPendingFiles((prev) => [...prev, ...files]);
                e.target.value = "";
              }}
            />
            <div
              className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const files = Array.from(e.dataTransfer.files ?? []);
                setPendingFiles((prev) => [...prev, ...files]);
              }}
            >
              <UploadCloud className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">
                Drag & drop files here, or click to browse
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Supports any format (.ma, .blend, .pdf, .mp4, .png) up to 200MB
              </p>
            </div>
            {pendingFiles.length > 0 && (
              <ul className="space-y-1 pt-1">
                {pendingFiles.map((file, i) => (
                  <li
                    key={`${file.name}-${i}`}
                    className="flex items-center justify-between text-sm bg-muted/50 rounded px-2 py-1"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <FileIcon className="w-4 h-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{file.name}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setPendingFiles((prev) =>
                          prev.filter((_, idx) => idx !== i),
                        )
                      }
                      className="text-muted-foreground hover:text-foreground shrink-0 ml-2"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Assigning..." : "Assign Task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
