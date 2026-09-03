import { useState } from "react";
import { useAuthStore } from "@/store/auth";
import { useUIStore } from "@/store/ui";
import { useCreateProject } from "@/hooks/useProjects";
import { useCreateEpisode } from "@/hooks/useEpisodes";
import { useCreateSequence } from "@/hooks/useSequences";
import { useCreateShot } from "@/hooks/useShots";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, X } from "lucide-react";

interface DraftShot {
  episode: string;
  sequence: string;
  shot: string;
}

// Mirrors the distinct `type` values seeded across mockData.ts's PROJECTS,
// so a project created here reads consistently with the rest of the grid.
const PROJECT_TYPES = [
  "Animated Feature",
  "Animated Series",
  "Animated Short",
  "Ad Campaign",
  "Feature VFX",
  "Game Cinematic",
  "Theme Park",
  "VR Experience",
];

export function CreateProjectModal() {
  const { createProjectModalOpen, setCreateProjectModalOpen } = useUIStore();
  const { mutateAsync: createProject, isPending } = useCreateProject();
  const createEpisode = useCreateEpisode();
  const createSequence = useCreateSequence();
  const createShot = useCreateShot();
  const { currentUser } = useAuthStore();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [type, setType] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [budget, setBudget] = useState("");
  const [description, setDescription] = useState("");
  const [draftShots, setDraftShots] = useState<DraftShot[]>([]);
  const [creatingShots, setCreatingShots] = useState(false);

  if (!currentUser) return null;

  const resetForm = () => {
    setName("");
    setClient("");
    setType("");
    setDueDate("");
    setBudget("");
    setDescription("");
    setDraftShots([]);
  };

  const addDraftShotRow = () =>
    setDraftShots((prev) => [...prev, { episode: "", sequence: "", shot: "" }]);
  const updateDraftShotRow = (i: number, patch: Partial<DraftShot>) =>
    setDraftShots((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeDraftShotRow = (i: number) =>
    setDraftShots((prev) => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !client || !type) {
      toast({
        title: "Missing fields",
        description: "Please fill out all required fields.",
        variant: "destructive",
      });
      return;
    }

    try {
      const project = await createProject({
        name,
        client,
        type,
        // Since we didn't add description and budget to the API DTO, we might ignore them here,
        // but we'll include endDate and a mock code
        code: name.substring(0, 3).toUpperCase(), // Basic mock code
        endDate: dueDate || null,
        status: "active",
      });

      const validShotRows = draftShots.filter((r) => r.shot.trim());
      if (validShotRows.length > 0) {
        setCreatingShots(true);
        const episodeCache = new Map<string, string>();
        const sequenceCache = new Map<string, string>();
        for (const row of validShotRows) {
          try {
            let episodeId: string | undefined;
            if (row.episode.trim()) {
              const key = row.episode.trim().toLowerCase();
              episodeId = episodeCache.get(key);
              if (!episodeId) {
                const created = await createEpisode.mutateAsync({
                  projectId: project.id,
                  name: row.episode.trim(),
                });
                episodeId = created.id;
                episodeCache.set(key, episodeId);
              }
            }

            let sequenceId: string | undefined;
            if (row.sequence.trim()) {
              const key = `${episodeId ?? ""}::${row.sequence.trim().toLowerCase()}`;
              sequenceId = sequenceCache.get(key);
              if (!sequenceId) {
                const created = await createSequence.mutateAsync({
                  projectId: project.id,
                  episodeId,
                  name: row.sequence.trim(),
                });
                sequenceId = created.id;
                sequenceCache.set(key, sequenceId);
              }
            }

            await createShot.mutateAsync({
              projectId: project.id,
              episodeId,
              sequenceId,
              name: row.shot.trim(),
            });
          } catch (err: any) {
            toast({
              title: `Couldn't add shot "${row.shot}"`,
              description: err?.message,
              variant: "destructive",
            });
          }
        }
        setCreatingShots(false);
      }

      toast({
        title: "Project Created",
        description: `"${project.name}" has been added to the roster${validShotRows.length ? ` with ${validShotRows.length} shot${validShotRows.length === 1 ? "" : "s"}` : ""}.`,
      });

      resetForm();
      setCreateProjectModalOpen(false);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to create project.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog
      open={createProjectModalOpen}
      onOpenChange={(open) => {
        setCreateProjectModalOpen(open);
        if (!open) resetForm();
      }}
    >
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Set up a new project for scheduling, asset tracking, and task
            assignment.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Project Name</Label>
            <Input
              id="project-name"
              placeholder="e.g. Starfall"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="project-client">Client</Label>
              <Input
                id="project-client"
                placeholder="e.g. StreamMax Studios"
                value={client}
                onChange={(e) => setClient(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Type" />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="project-due">Due Date</Label>
              <Input
                id="project-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-budget">Budget (USD)</Label>
              <Input
                id="project-budget"
                type="number"
                min="0"
                placeholder="e.g. 2500000"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-desc">Description (Optional)</Label>
            <Textarea
              id="project-desc"
              placeholder="Brief overview of the project..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <Label>Initial Shots (Optional)</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addDraftShotRow}
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Shot
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Set up the same Episode / Sequence / Shot structure used when
              assigning tasks — a new project starts with none, so add a
              few here, or skip this and use "Import Tracksheet" on the
              Tracking Grid later for bulk import.
            </p>
            {draftShots.map((row, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                <Input
                  placeholder="Episode (optional)"
                  value={row.episode}
                  onChange={(e) => updateDraftShotRow(i, { episode: e.target.value })}
                />
                <Input
                  placeholder="Sequence (optional)"
                  value={row.sequence}
                  onChange={(e) => updateDraftShotRow(i, { sequence: e.target.value })}
                />
                <Input
                  placeholder="Shot name *"
                  value={row.shot}
                  onChange={(e) => updateDraftShotRow(i, { shot: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeDraftShotRow(i)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateProjectModalOpen(false)}
              disabled={isPending || creatingShots}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || creatingShots}>
              {isPending
                ? "Creating..."
                : creatingShots
                  ? "Adding shots..."
                  : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
