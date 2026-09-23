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
import { useAuthStore } from "@/store/auth";
import { apiFetch } from "@/lib/apiClient";
import { useQueryClient } from "@tanstack/react-query";
import { useEpisodes, type EpisodeDTO } from "@/hooks/useEpisodes";
import { useSequences, type SequenceDTO } from "@/hooks/useSequences";
import { useShots, type ShotDTO } from "@/hooks/useShots";
import { useDepartments, type DepartmentDTO } from "@/hooks/useDepartments";
import { parseWorkbook, getField, parseLooseDate } from "@/lib/excelImport";

interface RowOutcome {
  sheet: string;
  shotCode: string;
  status: "created" | "updated" | "skipped";
  reason?: string;
}

const GENERIC_STATUS_FIELDS = ["Anim_status", "Layout_status", "Status"];

/** Normalizes a column header the same way SEQ#/SC# matching already does
 * elsewhere in this file, for comparing it against a department's own
 * name/abbreviation regardless of spacing, case, or underscores. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]+/g, "");
}

/**
 * Finds which real department (if any) a column like "Layout_status" or
 * "Fx status" refers to, by matching whatever's left after stripping
 * "status" against every department this tenant actually has configured --
 * rather than a fixed guessed list of department names, which would be
 * wrong the moment a studio's roster doesn't match it. Exact abbreviation
 * match is tried first (unambiguous: "roto" against Roto's own "ROTO"),
 * then a substring match against the department's name words in either
 * direction (so both "Light_status" -> "Lighting" and a column literally
 * named "Lighting_status" match). Returns null for a column that isn't a
 * status column at all, or doesn't match any known department -- both
 * cases fall through to extraNotes instead of being guessed at.
 */
function matchDepartmentColumn(
  columnKey: string,
  departments: DepartmentDTO[],
): DepartmentDTO | null {
  const normalized = normalizeKey(columnKey);
  if (!normalized.endsWith("status")) return null;
  const stem = normalized.slice(0, -"status".length);
  if (!stem) return null; // bare "Status" -- generic, not department-specific

  const byAbbr = departments.find((d) => normalizeKey(d.abbr) === stem);
  if (byAbbr) return byAbbr;

  return (
    departments.find((d) =>
      d.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(" ")
        .filter((w) => w.length > 2)
        .some((w) => stem.includes(w) || w.includes(stem)),
    ) ?? null
  );
}

/** A department-specific artist column ("Layout Artist", "FX_Artist"), for
 * when a row assigns different people to different departments rather than
 * one artist for the whole shot. */
function matchDepartmentArtistColumn(
  row: Record<string, string>,
  department: DepartmentDTO,
): string | null {
  for (const key of Object.keys(row)) {
    const normalized = normalizeKey(key);
    if (!normalized.endsWith("artist")) continue;
    const stem = normalized.slice(0, -"artist".length);
    if (!stem) continue;
    if (
      normalizeKey(department.abbr) === stem ||
      department.name.toLowerCase().replace(/[^a-z0-9]+/g, "").includes(stem)
    ) {
      return row[key] || null;
    }
  }
  return null;
}

// A per-episode tracksheet sheet is recognized by its name containing
// "Ep" followed by digits (e.g. "PES1_Ep002") -- every real client
// workbook we've seen also carries non-episode reference sheets
// ("Test", "Duration", "Do's & Don'ts", "Rigs_update") that must NOT be
// imported as shot data.
const EPISODE_SHEET_PATTERN = /ep\s*0*(\d+)/i;

// Candidate headers for the one column every real shot row must have.
// Kept in one place because it's checked twice: once to decide whether an
// unrecognized sheet name is actually shot data worth importing (see
// hasShotRows below) rather than a reference tab, and again per-row to
// pull the value out.
const SHOT_CODE_FIELDS = ["SC#", "SHOT_CODE", "Shot Code", "Shot", "Shot Name"];

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
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<RowOutcome[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: episodes = [] } = useEpisodes(projectId || undefined);
  const { data: sequences = [] } = useSequences(projectId || undefined);
  const { data: shots = [] } = useShots(projectId || undefined);
  const { data: departments = [] } = useDepartments();

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
      const totalRows = Object.values(sheets).reduce(
        (sum, rows) => sum + rows.filter((row) => getField(row, SHOT_CODE_FIELDS)).length,
        0,
      );
      setProgress({ done: 0, total: totalRows });
      for (const [sheetName, rows] of Object.entries(sheets)) {
        const episodeMatch = sheetName.match(EPISODE_SHEET_PATTERN);
        let episodeName: string;
        if (episodeMatch) {
          episodeName = `Ep${episodeMatch[1].padStart(3, "0")}`;
        } else {
          // Not a recognized "EpNNN" tab name. Rather than assuming every
          // unrecognized sheet is a reference tab (Test/Duration/etc.) and
          // silently importing nothing -- which is indistinguishable from a
          // crash to whoever's watching -- check whether it actually
          // contains real shot rows first. A studio that keeps everything
          // on one flat sheet (no per-episode split at all) still gets a
          // real import instead of a confusing "0 rows" result.
          const hasShotRows = rows.some((row) => getField(row, SHOT_CODE_FIELDS));
          if (!hasShotRows) continue; // genuinely a reference sheet
          episodeName = "General";
        }

        let episodeId = episodeCache.get(episodeName.toLowerCase());
        if (!episodeId) {
          try {
            // Direct apiFetch, not the useCreateEpisode/useCreateSequence/
            // useCreateShot mutation hooks -- each of those invalidates (and,
            // for shots, refetches) its whole list on every single success.
            // Calling them once per row turned an N-row import into O(N^2)
            // work (a growing shots list refetched after every new shot),
            // which is what actually made large tracksheets look hung. One
            // combined refresh happens after the whole loop finishes instead.
            const created = await apiFetch<EpisodeDTO>("/episodes", {
              method: "POST",
              body: JSON.stringify({ projectId, name: episodeName }),
            });
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
          const shotCode = getField(row, SHOT_CODE_FIELDS);
          if (!shotCode) continue; // blank/subtotal row
          const seqName = getField(row, ["SEQ#", "Sequence"]) || "Unassigned";

          let sequenceId = sequenceCache.get(`${episodeId}::${seqName.toLowerCase()}`);
          if (!sequenceId) {
            try {
              const created = await apiFetch<SequenceDTO>("/sequences", {
                method: "POST",
                body: JSON.stringify({ projectId, episodeId, name: seqName }),
              });
              sequenceId = created.id;
              sequenceCache.set(`${episodeId}::${seqName.toLowerCase()}`, sequenceId);
            } catch (err: any) {
              outcomes.push({ sheet: sheetName, shotCode, status: "skipped", reason: `sequence: ${err?.message}` });
              continue;
            }
          }

          const frameRange = getField(row, ["FR", "Frames", "Frame Range"]);
          const durationRaw = getField(row, ["Sec", "Duration"]);
          const duration = Math.round(parseFloat(durationRaw)) || undefined;

          let shotId = shotCache.get(shotCode.toLowerCase());
          let isNewShot = false;
          if (!shotId) {
            try {
              // frameRange/duration go straight into the create call now
              // that the server accepts them there -- avoids a second
              // round-trip per brand-new shot (still needed as a separate
              // PUT below for a shot this same tracksheet already created
              // via an earlier row/sheet, since that's an update not a create).
              const created = await apiFetch<ShotDTO>("/shots", {
                method: "POST",
                body: JSON.stringify({
                  projectId,
                  episodeId,
                  sequenceId,
                  name: shotCode,
                  ...(frameRange ? { frameRange } : {}),
                  ...(duration ? { duration } : {}),
                }),
              });
              shotId = created.id;
              isNewShot = true;
              shotCache.set(shotCode.toLowerCase(), shotId);
            } catch (err: any) {
              outcomes.push({ sheet: sheetName, shotCode, status: "skipped", reason: `shot: ${err?.message}` });
              continue;
            }
          }
          setProgress((p) => ({ ...p, done: p.done + 1 }));

          if (!isNewShot && (frameRange || duration)) {
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

          // Real sheets put short location/vendor codes here too ("Kol",
          // "Vizag", "os" for outsourced) -- a plain substring match wrongly
          // matched "os" against "Debut Gh-os-h". Requiring every word in
          // the sheet's value to appear as a whole word in the candidate's
          // name avoids that false positive while still matching partial
          // real names ("Yathendra" against "Yathendra Sri Sai Hanuma Pudi").
          const resolveArtist = (name: string | null) => {
            const words = (name || "").toLowerCase().trim().split(/\s+/).filter(Boolean);
            if (!words.length) return undefined;
            return users.find((u) => {
              if (u.role !== "artist") return false;
              const nameWords = u.name.toLowerCase().split(/\s+/);
              return words.every((w) => nameWords.includes(w));
            });
          };
          const sharedArtistName = getField(row, ["Artist Name", "Artist"]);

          const startDate = parseLooseDate(getField(row, ["Start Date"]));
          const endDate = parseLooseDate(getField(row, ["End Date"]));

          // Real sheets spread pipeline status across many differently-named
          // columns per episode (Anim_status, Layout_status, Fx status...) --
          // one real task per department found, so each lands with a real
          // department a lead can actually see and approve, instead of one
          // catch-all Animation task no matter how many departments the row
          // actually names. Falls back to today's single generic task only
          // when the row has no department-specific column at all (a sheet
          // with just a bare "Status" column, or one whose column names don't
          // match anything in this tenant's own department roster).
          const departmentColumns = Object.keys(row)
            .map((key) => ({ key, department: matchDepartmentColumn(key, departments) }))
            .filter(
              (c): c is { key: string; department: DepartmentDTO } =>
                !!c.department && !!(row[c.key] || "").trim(),
            );

          const consumedKeys = new Set(
            [...SHOT_CODE_FIELDS, "SEQ#", "Sequence", "FR", "Frames",
             "Frame Range", "Sec", "Duration", "Artist Name", "Artist",
             "Start Date", "End Date", "SL#", ...GENERIC_STATUS_FIELDS,
             ...departmentColumns.map((c) => c.key)]
              .map(normalizeKey),
          );

          const tasksToCreate: { department: DepartmentDTO | null; status: string; assigneeId: string | null }[] =
            departmentColumns.length > 0
              ? departmentColumns.map(({ key, department }) => ({
                  department,
                  status: (row[key] || "").trim() || "ready",
                  assigneeId:
                    resolveArtist(matchDepartmentArtistColumn(row, department))?.id ??
                    resolveArtist(sharedArtistName)?.id ??
                    null,
                }))
              : [
                  {
                    department: departments.find((d) => normalizeKey(d.abbr) === "anim") ?? null,
                    status: getField(row, GENERIC_STATUS_FIELDS) || "ready",
                    assigneeId: resolveArtist(sharedArtistName)?.id ?? null,
                  },
                ];

          const extraNotes = Object.entries(row)
            .filter(([k, v]) => v && !consumedKeys.has(normalizeKey(k)))
            .map(([k, v]) => `${k}: ${v}`)
            .join("; ");

          for (const task of tasksToCreate) {
            const label = task.department
              ? task.department.name
              : "Animation";
            try {
              await apiFetch("/tasks", {
                method: "POST",
                body: JSON.stringify({
                  entityId: shotId,
                  entityType: "shot",
                  title: `${label} — ${shotCode}`,
                  description: extraNotes || `Imported from ${sheetName}.`,
                  status: task.status,
                  priority: "medium",
                  department: task.department?.name ?? null,
                  pipelinePhase: task.department?.abbr ?? "ANIM",
                  startDate,
                  dueDate: endDate,
                  // `duration` comes from the "Sec"/"Duration" column, i.e.
                  // seconds -- dividing by 60 turned a several-minute shot into
                  // a fractional-hour estimate instead of converting seconds to
                  // hours.
                  estimatedHours: duration ? Math.max(duration / 3600, 1) : 8,
                  assignedTo: task.assigneeId,
                }),
              });
              outcomes.push({
                sheet: sheetName,
                shotCode: tasksToCreate.length > 1 ? `${shotCode} (${label})` : shotCode,
                status: "created",
              });
            } catch (err: any) {
              outcomes.push({
                sheet: sheetName,
                shotCode: tasksToCreate.length > 1 ? `${shotCode} (${label})` : shotCode,
                status: "skipped",
                reason: err?.message,
              });
            }
          }
        }
      }

      setResults(outcomes);

      // One combined refresh after the whole file is done, instead of the
      // per-row invalidation this loop used to trigger. fetchMe() re-hydrates
      // every Zustand-backed store the app actually reads shots/tasks from
      // (Dashboard tab, Episodes tab, Shots & Assets tab, Tracking Grid all
      // read useShotStore/useTasksStore directly, not React Query) -- without
      // this, freshly-imported rows stayed invisible in every one of those
      // views until the next 10-second background poll tick.
      await Promise.all([
        useAuthStore.getState().fetchMe(),
        queryClient.invalidateQueries({ queryKey: ["episodes", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["sequences", projectId] }),
      ]);

      const created = outcomes.filter((o) => o.status === "created").length;
      if (outcomes.length === 0) {
        // Every sheet was skipped as non-shot data. Silently reporting
        // "0 of 0 imported" here reads as a success message for a file that
        // did nothing -- tell the user what's actually needed instead.
        toast({
          title: "No shot rows found",
          description:
            "None of the sheets in this file had a recognizable shot column (e.g. \"Shot Code\", \"SC#\", or \"Shot\"). Check the file and try again.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Tracksheet import finished",
          description: `${created} of ${outcomes.length} shot row${outcomes.length === 1 ? "" : "s"} imported.`,
          variant: created === 0 ? "destructive" : undefined,
        });
      }
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
          setProgress({ done: 0, total: 0 });
        }
      }}
    >
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Import Tracksheet</DialogTitle>
          <DialogDescription>
            Import a tracksheet in whatever layout your studio already keeps
            it in -- one sheet per episode (e.g. "Ep002"), or a single flat
            sheet with everything on it. Each row creates or reuses an
            Episode, Sequence, and Shot, plus one task carrying that row's
            status, artist, and dates. Column names don't need to match
            exactly (e.g. "Shot", "Shot Name", "Shot Code" all work); sheets
            with no recognizable shot column are skipped as reference tabs.
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
              {importing
                ? progress.total > 0
                  ? `Importing… (${progress.done}/${progress.total} rows)`
                  : "Importing…"
                : "Upload Tracksheet (.xlsx)"}
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
