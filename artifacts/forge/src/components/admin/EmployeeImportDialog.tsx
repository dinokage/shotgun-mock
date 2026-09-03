import { useRef, useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UploadCloud } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSendInvite } from "@/hooks/useUsers";
import { useDepartments, type DepartmentDTO } from "@/hooks/useDepartments";
import { useRoles, type TenantRoleDTO } from "@/hooks/useRoles";
import { parseWorkbook, getField } from "@/lib/excelImport";

interface DraftRow {
  name: string;
  sourceDept: string;
  sourceDesignation: string;
  email: string;
  departmentId: string;
  roleId: string;
  outcome?: "sent" | "error" | "skipped";
  error?: string;
}

// Real employee rosters don't put "artist"/"lead"/"producer" in a
// designation column -- they use real job titles. This is a best-effort
// guess from keywords, always defaulting to the LEAST-privileged role
// (artist) when nothing matches, rather than risking an over-privileged
// account from a misread title. The admin can still change any row's
// role before sending.
function guessRoleName(designation: string): string {
  const d = designation.toLowerCase();
  if (d.includes("head")) return "production_head";
  if (d.includes("supervisor") || d.includes("lead")) return "lead";
  if (d.includes("producer") || d.includes("coordinator") || d.includes("manager"))
    return "producer";
  return "artist";
}

function guessDepartment(sourceDept: string, departments: DepartmentDTO[]): DepartmentDTO | undefined {
  const d = sourceDept.trim().toLowerCase();
  if (!d) return undefined;
  // Exact/substring match against real department names first ("Texturing"
  // -> "Texturing / LookDev"), then fall back to abbreviation match.
  return (
    departments.find((dept) => dept.name.toLowerCase() === d) ||
    departments.find((dept) => dept.name.toLowerCase().includes(d) || d.includes(dept.name.toLowerCase())) ||
    departments.find((dept) => dept.abbr.toLowerCase() === d)
  );
}

export function EmployeeImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const { data: departments = [] } = useDepartments();
  const { data: roles = [] } = useRoles();
  const sendInvite = useSendInvite();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<DraftRow[]>([]);
  const [sending, setSending] = useState(false);

  // Falls back to the resolved "artist" role (least-privileged) rather than
  // roles[0] -- roles[0] is whatever order the API happened to return, which
  // could just as easily be "admin", directly contradicting guessRoleName's
  // own "always default to least-privileged" contract above.
  const roleIdByName = (name: string) =>
    roles.find((r: TenantRoleDTO) => r.name === name)?.id ??
    roles.find((r: TenantRoleDTO) => r.name === "artist")?.id ??
    "";

  const handleFile = async (file: File) => {
    try {
      const sheets = await parseWorkbook(file);
      const draft: DraftRow[] = [];
      for (const sheetRows of Object.values(sheets)) {
        for (const row of sheetRows) {
          // Sheet1-shaped: "Name of the employee" in one column.
          // Sheet3-shaped: first/last name in two separate columns, no header
          // row at all in the real file -- handled below by falling back to
          // raw column position when no recognizable header matches.
          let name = getField(row, ["Name of the empolyee", "Name of the employee", "Name", "Employee Name"]);
          const firstName = getField(row, ["FirstName", "First Name"]);
          const lastName = getField(row, ["LastName", "Last Name"]);
          if (!name && (firstName || lastName)) name = `${firstName} ${lastName}`.trim();
          if (!name) continue;

          const sourceDept = getField(row, ["Dept", "Department"]);
          const sourceDesignation = getField(row, ["Designation", "Title"]);
          const dept = guessDepartment(sourceDept, departments);
          const roleName = guessRoleName(sourceDesignation);

          draft.push({
            name,
            sourceDept,
            sourceDesignation,
            email: "",
            departmentId: dept?.id ?? "",
            roleId: roleIdByName(roleName),
          });
        }
      }
      if (draft.length === 0) {
        toast({
          title: "No rows found",
          description: "Couldn't find a name column in that file.",
          variant: "destructive",
        });
        return;
      }
      setRows(draft);
    } catch (err: any) {
      toast({
        title: "Import failed",
        description: err?.message || "Could not read that file.",
        variant: "destructive",
      });
    }
  };

  const updateRow = (i: number, patch: Partial<DraftRow>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const handleSendInvites = async () => {
    setSending(true);
    // Tracked locally rather than read back from `rows` afterward: `rows` is
    // closed over from render and updateRow only ever applies its patches
    // via functional setState, so the `rows` binding in this closure never
    // reflects the "sent"/"error" outcomes written during the loop below —
    // reading rows.filter(...) after the loop always saw the pre-loop state
    // (0 sent), regardless of how many invites actually succeeded.
    let sentCount = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.email || !row.email.includes("@")) {
        updateRow(i, { outcome: "skipped" });
        continue;
      }
      try {
        await sendInvite.mutateAsync({
          email: row.email,
          roleId: row.roleId,
          departmentId: row.departmentId || undefined,
        });
        updateRow(i, { outcome: "sent" });
        sentCount++;
      } catch (err: any) {
        updateRow(i, { outcome: "error", error: err?.message });
      }
    }
    setSending(false);
    toast({
      title: "Invites sent",
      description: `${sentCount} of ${rows.length} invites sent. Rows without an email were skipped.`,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setRows([]);
      }}
    >
      <DialogContent className="sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle>Import Employees</DialogTitle>
          <DialogDescription>
            Reads a roster spreadsheet (name, department, designation) and
            matches each row to a real department and a suggested role.
            These sheets have no email addresses, so add one per person you
            want to actually invite — rows left blank are skipped.
          </DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <>
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
              className="border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center justify-center text-center hover:bg-muted/30 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadCloud className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Upload Roster (.xlsx)</p>
              <p className="text-xs text-muted-foreground mt-1">Click to browse</p>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div className="max-h-96 overflow-y-auto space-y-2">
              {rows.map((row, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1.2fr_1.3fr_1fr_1fr_auto] gap-2 items-center text-sm border-b border-border/50 pb-2"
                >
                  <div className="truncate" title={`${row.sourceDept} / ${row.sourceDesignation}`}>
                    {row.name}
                  </div>
                  <Input
                    type="email"
                    placeholder="email@company.com"
                    value={row.email}
                    onChange={(e) => updateRow(i, { email: e.target.value })}
                  />
                  <Select
                    value={row.departmentId}
                    onValueChange={(v) => updateRow(i, { departmentId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((d: DepartmentDTO) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={row.roleId} onValueChange={(v) => updateRow(i, { roleId: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((r: TenantRoleDTO) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs w-14 text-right">
                    {row.outcome === "sent" && <span className="text-emerald-500">Sent</span>}
                    {row.outcome === "skipped" && <span className="text-muted-foreground">Skipped</span>}
                    {row.outcome === "error" && (
                      <span className="text-destructive" title={row.error}>Error</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t border-border/50">
              <Button variant="outline" onClick={() => setRows([])} disabled={sending}>
                Start Over
              </Button>
              <DialogClose asChild>
                <Button variant="outline" disabled={sending}>Close</Button>
              </DialogClose>
              <Button onClick={handleSendInvites} disabled={sending}>
                {sending ? "Sending…" : `Send Invites (${rows.filter((r) => r.email.includes("@")).length})`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
