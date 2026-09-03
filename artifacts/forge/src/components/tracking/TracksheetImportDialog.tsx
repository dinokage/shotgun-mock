import { useRef, useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { UploadCloud } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useProjectStore } from "@/store/projects";
import { useUserStore } from "@/store/users";
import { apiFetch } from "@/lib/apiClient";
import { useCreateEpisode, useEpisodes } from "@/hooks/useEpisodes";
import { useCreateSequence, useSequences } from "@/hooks/useSequences";
import { useCreateShot, useShots } from "@/hooks/useShots";
import { parseWorkbook, getField, parseLooseDate } from "@/lib/excelImport";

interface RowOutcome {
  sheet: string;
  shotCode: string;
  status: "created" | "updated" | "skipped";
  reason?: string;
}

// A per-episode tracksheet sheet is recognized by its name containing
// "Ep" followed by digits (e.g. "PES1_Ep002") -- every real client
// workbook we've seen also carries non-episode reference sheets
// ("Test", "Duration", "Do's & Don'ts", "Rigs_update") that must NOT be
// imported as shot data.
const EPISODE_SHEET_PATTERN = /ep\s*0*(\d+)/i;

export function TracksheetImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const projects = useProjectStore((s) => s.projects);
  const users = useUserStore((s) => s.users);
  const [projectId, setProjectId] = useState("");
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<RowOutcome[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: episodes = [] } = useEpisodes(projectId || undefined);
  const { data: sequences = [] } = useSequences(projectId || undefined);
  const { data: shots = [] } = useShots(projectId || undefined);
  const createEpisode = useCreateEpisode();
  const createSequence = useCreateSequence();
  const createShot = useCreateShot();

  const handleFile = async (file: File) => {
    if (!projectId) {
      toast({
        title: "Select a project first",
        description: "Choose which project this tracksheet belongs to.",
        variant: "destructive",
      });
      return;
    }
    setImporting(true);
    setResults(null);
    const outcomes: RowOutcome[] = [];
    // Local caches so we don't re-create the same episode/sequence for
    // every row, or re-query mid-import -- these accumulate real ids
    // returned by the create calls as they happen.
    const episodeCache = new Map(episodes.map((e) => [e.name.toLowerCase(), e.id]));
    const sequenceCache = new Map(
      sequences.map((s) => [`${s.episodeId ?? ""}::${s.name.toLowerCase()}`, s.id]),
    );
    const shotCache = new Map(shots.map((s) => [s.name.toLowerCase(), s.id]));

    try {
      const sheets = await parseWorkbook(file);
      for (const [sheetName, rows] of Object.entries(sheets)) {
        const episodeMatch = sheetName.match(EPISODE_SHEET_PATTERN);
        if (!episodeMatch) continue; // reference sheet (Test/Duration/etc.), not shot data
        const episodeName = `Ep${episodeMatch[1].padStart(3, "0")}`;

        let episodeId = episodeCache.get(episodeName.toLowerCase());
        if (!episodeId) {
          try {
            const created = await createEpisode.mutateAsync({ projectId, name: episodeName });
            episodeId = created.id;
            episodeCache.set(episodeName.toLowerCase(), episodeId);
          } catch (err: any) {
            outcomes.push({ sheet: sheetName, shotCode: "(episode)", status: "skipped", reason: err?.message });
            continue;
          }
        }

        for (const row of rows) {
          // The column literally labeled "SC#" in these sheets actually
          // holds the full unique shot code (e.g. "pes1_ep003_sc001_sh001"),
          // not just a scene number -- confirmed against the real files.
          // "SHOT_CODE" covers the one sheet (Test) that names it directly.
          const shotCode = getField(row, ["SC#", "SHOT_CODE", "Shot Code"]);
          if (!shotCode) continue; // blank/subtotal row
          const seqName = getField(row, ["SEQ#", "Sequence"]) || "Unassigned";

          let sequenceId = sequenceCache.get(`${episodeId}::${seqName.toLowerCase()}`);
          if (!sequenceId) {
            try {
              const created = await createSequence.mutateAsync({
                projectId,
                episodeId,
                name: seqName,
              });
              sequenceId = created.id;
              sequenceCache.set(`${episodeId}::${seqName.toLowerCase()}`, sequenceId);
            } catch (err: any) {
              outcomes.push({ sheet: sheetName, shotCode, status: "skipped", reason: `sequence: ${err?.message}` });
              continue;
            }
          }

          let shotId = shotCache.get(shotCode.toLowerCase());
          if (!shotId) {
            try {
              const created = await createShot.mutateAsync({
                projectId,
                episodeId,
                sequenceId,
                name: shotCode,
              });
              shotId = created.id;
              shotCache.set(shotCode.toLowerCase(), shotId);
            } catch (err: any) {
              outcomes.push({ sheet: sheetName, shotCode, status: "skipped", reason: `shot: ${err?.message}` });
              continue;
            }
          }

          const frameRange = getField(row, ["FR", "Frames", "Frame Range"]);
          const durationRaw = getField(row, ["Sec", "Duration"]);
          const duration = Math.round(parseFloat(durationRaw)) || undefined;
          if (frameRange || duration) {
            try {
              await apiFetch(`/shots/${shotId}`, {
                method: "PUT",
                body: JSON.stringify({
                  ...(frameRange ? { frameRange } : {}),
                  ...(duration ? { duration } : {}),
                }),
              });
            } catch {
              // Non-fatal -- the shot and its task below still get created.
            }
          }

          // Real sheets spread pipeline status across many differently-named
          // columns per episode (Anim_status, Layout_status, Fx status...).
          // Rather than guess a rigid per-department task split that would
          // be wrong as often as right, one task per shot captures the
          // dominant column present, and every OTHER non-empty column on
          // the row is preserved verbatim in the description so nothing
          // in the source sheet is silently lost.
          const status = getField(row, ["Anim_status", "Layout_status", "Status"]) || "ready";
          const artistName = getField(row, ["Artist Name", "Artist"]);
          const assignee = artistName
            ? users.find(
                (u) =>
                  u.role === "artist" &&
                  u.name.toLowerCase().includes(artistName.toLowerCase()),
              )
            : undefined;

          const startDate = parseLooseDate(getField(row, ["Start Date"]));
          const endDate = parseLooseDate(getField(row, ["End Date"]));

          const consumedKeys = new Set(
            ["SC#", "SHOT_CODE", "Shot Code", "SEQ#", "Sequence", "FR", "Frames",
             "Frame Range", "Sec", "Duration", "Anim_status", "Layout_status",
             "Status", "Artist Name", "Artist", "Start Date", "End Date", "SL#"]
              .map((c) => c.toLowerCase().replace(/[\s_-]+/g, "")),
          );
          const extraNotes = Object.entries(row)
            .filter(([k, v]) => v && !consumedKeys.has(k.toLowerCase().replace(/[\s_-]+/g, "")))
            .map(([k, v]) => `${k}: ${v}`)
            .join("; ");

          try {
            await apiFetch("/tasks", {
              method: "POST",
              body: JSON.stringify({
                entityId: shotId,
                entityType: "shot",
                title: `Animation — ${shotCode}`,
                description: extraNotes || `Imported from ${sheetName}.`,
                status,
                priority: "medium",
                pipelinePhase: "ANIM",
                startDate,
                dueDate: endDate,
                // `duration` comes from the "Sec"/"Duration" column, i.e.
                // seconds -- dividing by 60 turned a several-minute shot into
                // a fractional-hour estimate instead of converting seconds to
                // hours.
                estimatedHours: duration ? Math.max(duration / 3600, 1) : 8,
                assignedTo: assignee?.id ?? null,
              }),
            });
            outcomes.push({ sheet: sheetName, shotCode, status: "created" });
          } catch (err: any) {
            outcomes.push({ sheet: sheetName, shotCode, status: "skipped", reason: err?.message });
          }
        }
      }

      setResults(outcomes);
      const created = outcomes.filter((o) => o.status === "created").length;
      toast({
        title: "Tracksheet import finished",
        description: `${created} of ${outcomes.length} shot row${outcomes.length === 1 ? "" : "s"} imported.`,
      });
    } catch (err: any) {
      toast({
        title: "Import failed",
        description: err?.message || "Could not read that workbook.",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setProjectId("");
          setResults(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Import Tracksheet</DialogTitle>
          <DialogDescription>
            Import a multi-episode production tracksheet (one sheet per
            episode, e.g. "Ep002"). Each row creates or reuses an Episode,
            Sequence, and Shot, plus one task carrying that row's status,
            artist, and dates. Non-episode reference sheets are skipped
            automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Project</label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select the project this tracksheet belongs to" />
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
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          <div
            className={`border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center justify-center text-center transition-colors group ${
              projectId ? "hover:bg-muted/30 cursor-pointer" : "opacity-50 cursor-not-allowed"
            }`}
            onClick={() => projectId && fileInputRef.current?.click()}
          >
            <UploadCloud className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">
              {importing ? "Importing…" : "Upload Tracksheet (.xlsx)"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {projectId ? "Click to browse" : "Choose a project above first"}
            </p>
          </div>

          {results && (
            <div className="space-y-1 border border-border rounded-lg p-3 bg-muted/20 max-h-56 overflow-y-auto">
              <div className="text-sm font-medium border-b border-border/50 pb-1 mb-1">
                {results.filter((r) => r.status === "created").length}/{results.length} rows imported
              </div>
              {results.map((r, i) => (
                <div
                  key={i}
                  className={`text-xs flex items-center justify-between gap-2 ${
                    r.status === "created" ? "text-emerald-500" : "text-muted-foreground"
                  }`}
                >
                  <span className="truncate">{r.sheet} / {r.shotCode}</span>
                  <span className="shrink-0">{r.status === "created" ? "OK" : r.reason}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
