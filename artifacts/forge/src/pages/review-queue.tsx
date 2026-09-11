import { useMemo, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { PlayCircle, Search, Inbox } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { useAuthStore } from "@/store/auth";
import { useTasksStore } from "@/store/tasks";
import { useUserStore } from "@/store/users";
import { useDepartmentStore } from "@/store/departments";
import { useShotStore } from "@/store/shots";
import { useAssetStore } from "@/store/assets";
import {
  getAssigneeId,
  getShotId,
  getAssetId,
  canApproveAsProductionManager,
} from "@/lib/taskShape";
import { DEPARTMENT_LEADERSHIP_ROLES } from "@/store/permissions";
import { normalizeTaskStatus, isTracksheetStatus } from "@/lib/trackingStatus";

// The approval-chain stages review.tsx recognises. A task at any of these is
// "live" in the review queue; anything else is still being worked on and has
// nothing to review yet. Compared against the *normalized* stage, so
// tracksheet-imported rows (TK_02_APP, Rtk_done, ...) land here too.
const REVIEW_STAGES = ["review", "lead-review", "pm-review", "approved"];

type QueueFilter = "awaiting-me" | "lead-review" | "pm-review" | "approved" | "all";

const FILTER_LABELS: Record<QueueFilter, string> = {
  "awaiting-me": "Awaiting Me",
  "lead-review": "Lead Review",
  "pm-review": "Producer Review",
  approved: "Approved",
  all: "All",
};

/**
 * The index for /review. Without this the Reviews nav entry landed on
 * review.tsx with no :taskId in the route, which renders nothing but
 * "Select a task to open its review." — there was no surface anywhere in the
 * app that listed what was actually waiting to be reviewed, so the only way
 * into the player was to already know a task id.
 */
export default function ReviewQueue() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const tasks = useTasksStore((s) => s.tasks);
  const users = useUserStore((s) => s.users);
  const departments = useDepartmentStore((s) => s.departments);
  const shots = useShotStore((s) => s.shots);
  const assets = useAssetStore((s) => s.assets);

  const [filter, setFilter] = useState<QueueFilter>("awaiting-me");
  const [query, setQuery] = useState("");
  const [, setLocation] = useLocation();

  const rows = useMemo(() => {
    return tasks
      .map((t: any) => ({ t, stage: normalizeTaskStatus(t.status) }))
      .filter(({ stage }) => REVIEW_STAGES.includes(stage))
      .map(({ t, stage }) => {
        const shotId = getShotId(t);
        const assetId = getAssetId(t);
        const shot = shotId ? shots.find((s) => s.id === shotId) : undefined;
        const asset = assetId ? assets.find((a) => a.id === assetId) : undefined;
        return {
          task: t,
          stage,
          entityName: shot?.name ?? asset?.name ?? t.name ?? "Untitled",
          entityKind: shot ? "shot" : asset ? "asset" : "task",
          version: shot?.currentVersion ?? "",
          assigneeId: getAssigneeId(t),
          department: t.department ?? "",
        };
      })
      .sort((a, b) => a.entityName.localeCompare(b.entityName));
  }, [tasks, shots, assets]);

  // "Awaiting me" answers the question the queue exists for: what is blocked
  // on this specific person right now. It is deliberately role-derived rather
  // than a saved filter — an artist sees work sent back to them, a lead sees
  // their department's lead-review tier, a producer sees the pm-review tier.
  const awaitingMe = useMemo(() => {
    if (!currentUser) return [] as typeof rows;
    const isLead = DEPARTMENT_LEADERSHIP_ROLES.includes(currentUser.role);
    return rows.filter((r) => {
      const status = r.stage;
      if (status === "pm-review") {
        return canApproveAsProductionManager(
          currentUser.id,
          r.department,
          users,
          departments,
        );
      }
      if (status === "review" || status === "lead-review") {
        if (!isLead) return false;
        const dept = departments.find((d) => d.name === r.department);
        return !currentUser.departmentId || currentUser.departmentId === dept?.id;
      }
      return false;
    });
  }, [rows, currentUser, users, departments]);

  const visible = useMemo(() => {
    const base =
      filter === "awaiting-me"
        ? awaitingMe
        : filter === "all"
          ? rows
          : rows.filter((r) =>
              filter === "lead-review"
                ? r.stage === "review" || r.stage === "lead-review"
                : r.stage === filter,
            );
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (r) =>
        r.entityName.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q),
    );
  }, [filter, rows, awaitingMe, query]);

  // Open the player straight away instead of making everyone click a row
  // first. Reviewing is what this page is for, and the queue was an extra
  // step between an artist and the shot they came here to upload or check.
  // `?queue=1` is the escape hatch: the player's own Queue button sets it, so
  // choosing to browse the list does not immediately bounce back into a shot.
  const wantsQueue =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("queue");
  const firstReviewable = rows[0]?.task?.id;
  useEffect(() => {
    if (!wantsQueue && firstReviewable) {
      setLocation(`/review/${firstReviewable}`, { replace: true });
    }
  }, [wantsQueue, firstReviewable, setLocation]);

  const counts: Record<QueueFilter, number> = {
    "awaiting-me": awaitingMe.length,
    "lead-review": rows.filter(
      (r) => r.stage === "review" || r.stage === "lead-review",
    ).length,
    "pm-review": rows.filter((r) => r.stage === "pm-review").length,
    approved: rows.filter((r) => r.stage === "approved").length,
    all: rows.length,
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border px-6 py-4 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <PlayCircle className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold">Reviews</h1>
          </div>
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search shot, asset or department"
              className="pl-8 h-9"
            />
          </div>
        </div>
        <Tabs
          value={filter}
          onValueChange={(v) => setFilter(v as QueueFilter)}
          className="mt-4"
        >
          <TabsList>
            {(Object.keys(FILTER_LABELS) as QueueFilter[]).map((key) => (
              <TabsTrigger key={key} value={key}>
                {FILTER_LABELS[key]}
                <span className="ml-1.5 text-[10px] text-muted-foreground">
                  {counts[key]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-auto">
        {visible.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Inbox className="w-8 h-8" />
            <div className="text-sm">
              {filter === "awaiting-me"
                ? "Nothing is waiting on you right now."
                : "No versions in this stage."}
            </div>
            {/* "Awaiting Me" is correctly empty far more often than not --
                it only ever holds work actually blocked on this person right
                now. Without this, an empty inbox here reads as "there are no
                reviews in this app at all" even when the All tab (visible in
                the strip above, just not obviously so) has real ones sitting
                in other stages. */}
            {filter === "awaiting-me" && counts.all > 0 && (
              <button
                onClick={() => setFilter("all")}
                className="text-xs text-primary hover:underline mt-1"
              >
                {counts.all} review{counts.all === 1 ? "" : "s"} in other
                stages — view all
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card border-b border-border">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="font-medium px-6 py-2.5">Shot / Asset</th>
                <th className="font-medium px-4 py-2.5">Department</th>
                <th className="font-medium px-4 py-2.5">Assignee</th>
                <th className="font-medium px-4 py-2.5">Stage</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr
                  key={r.task.id}
                  className="border-b border-border/50 hover:bg-muted/40"
                >
                  <td className="px-6 py-2.5">
                    <Link
                      href={`/review/${r.task.id}`}
                      className="font-medium hover:text-primary"
                    >
                      {r.entityName}
                      {r.version && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {r.version}
                        </span>
                      )}
                    </Link>
                    <div className="text-xs text-muted-foreground capitalize">
                      {r.entityKind}
                      {r.task.name ? ` · ${r.task.name}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {r.department || "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.assigneeId ? (
                      <div className="flex items-center gap-2">
                        <UserAvatar userId={r.assigneeId} />
                        <span className="text-xs text-muted-foreground">
                          {users.find((u) => u.id === r.assigneeId)?.name ??
                            "Unknown"}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={r.stage} />
                    {isTracksheetStatus(r.task.status) && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {r.task.status}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
