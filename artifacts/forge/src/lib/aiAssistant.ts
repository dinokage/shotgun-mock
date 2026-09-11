/**
 * Forge Assistant — question answering over live production data.
 *
 * Deterministic by design, not by compromise. The studio network this runs on
 * has no outbound internet access (NFR-AVL-001), so a hosted model is not an
 * option here at all; and for the questions people actually ask a producer's
 * dashboard — who is overloaded, what is overdue, what is waiting on me — the
 * right answer is a query, not a generation. A model asked "how many tasks are
 * overdue" can only guess at a number this file can simply count.
 *
 * Two consequences are deliberate and visible to the user:
 *   - every answer cites the figures it was computed from, so it can be
 *     checked against the board rather than trusted;
 *   - a question that matches no handler says so plainly. It never produces a
 *     confident-sounding paragraph about data it did not read, which is the
 *     specific failure that makes an assistant like this worse than nothing.
 */

import type { InsightAudience, InsightContext } from "@/lib/aiInsights";
import { normalizeTaskStatus } from "@/lib/trackingStatus";
import { getAssigneeId } from "@/lib/taskShape";
import type { Task } from "@/data/mockData";

export interface AssistantAnswer {
  text: string;
  href?: string;
  hrefLabel?: string;
}

const OPEN_STATUSES = new Set([
  "todo",
  "not-started",
  "in-progress",
  "bottleneck",
  "review",
  "lead-review",
  "pm-review",
]);
const REVIEW_STATUSES = new Set(["review", "lead-review", "pm-review"]);

const DAY_MS = 86_400_000;

interface NormalTask extends Task {
  assigneeId: string;
}

function normalize(ctx: InsightContext): NormalTask[] {
  return ctx.tasks.map((t) => ({
    ...t,
    status: normalizeTaskStatus(t.status),
    assigneeId: getAssigneeId(t) ?? "",
  })) as NormalTask[];
}

function daysSince(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / DAY_MS);
}

function nameOf(ctx: InsightContext, id: string | undefined): string {
  if (!id) return "Unassigned";
  return ctx.users.find((u) => u.id === id)?.name ?? "Unknown";
}

function s(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

/** A matcher plus the answer it computes. Order matters: first match wins. */
interface Handler {
  /** Every listed group must have at least one term present in the question. */
  match: RegExp[];
  answer: (ctx: InsightContext, tasks: NormalTask[]) => AssistantAnswer;
}

const HANDLERS: Handler[] = [
  {
    // "what's overdue", "anything late", "past due"
    match: [/overdue|late|past due|behind schedule|missed deadline/],
    answer: (ctx, tasks) => {
      const overdue = tasks
        .filter((t) => OPEN_STATUSES.has(t.status))
        .map((t) => ({ t, late: daysSince(t.dueDate) ?? -1 }))
        .filter((r) => r.late > 0)
        .sort((a, b) => b.late - a.late);

      if (overdue.length === 0)
        return { text: "Nothing in your scope is past its due date." };

      const lines = overdue
        .slice(0, 5)
        .map(
          (r) =>
            `• ${r.t.title} — ${r.late} ${s(r.late, "day")} late, ${nameOf(ctx, r.t.assigneeId)} (${r.t.status.replace(/-/g, " ")})`,
        );
      return {
        text: `${overdue.length} open ${s(overdue.length, "task")} past due.\n\n${lines.join("\n")}${overdue.length > 5 ? `\n\n…and ${overdue.length - 5} more.` : ""}`,
        href: "/tracking",
        hrefLabel: "Open tracking grid",
      };
    },
  },
  {
    // "who is overloaded", "workload", "who has the most work"
    match: [/overload|workload|busiest|most work|capacity|who has too much/],
    answer: (ctx, tasks) => {
      const load = new Map<string, number>();
      for (const t of tasks) {
        if (!OPEN_STATUSES.has(t.status) || !t.assigneeId) continue;
        load.set(t.assigneeId, (load.get(t.assigneeId) ?? 0) + 1);
      }
      if (load.size === 0)
        return { text: "Nobody in your scope has open work assigned." };

      const ranked = Array.from(load.entries()).sort((a, b) => b[1] - a[1]);
      const counts = ranked.map((r) => r[1]).sort((a, b) => a - b);
      const median = counts[Math.floor(counts.length / 2)];
      const lines = ranked
        .slice(0, 5)
        .map(([id, n]) => `• ${nameOf(ctx, id)} — ${n} open ${s(n, "task")}`);

      return {
        text: `Open work per person (team median ${median}):\n\n${lines.join("\n")}\n\n${ranked[0][1] >= median * 2 ? `${nameOf(ctx, ranked[0][0])} is carrying ${(ranked[0][1] / Math.max(1, median)).toFixed(1)}× the team median — worth rebalancing.` : "Load is reasonably even across the team."}`,
        href: "/people",
        hrefLabel: "Open people",
      };
    },
  },
  {
    // "who is free", "idle", "spare capacity"
    match: [/who is free|idle|spare capacity|available|nothing assigned|free capacity/],
    answer: (ctx, tasks) => {
      const busy = new Set(
        tasks
          .filter((t) => OPEN_STATUSES.has(t.status))
          .map((t) => t.assigneeId)
          .filter(Boolean),
      );
      const idle = ctx.users.filter((u) => !busy.has(u.id));
      const unassigned = tasks.filter(
        (t) => OPEN_STATUSES.has(t.status) && !t.assigneeId,
      ).length;

      if (idle.length === 0)
        return { text: "Everyone in your scope currently has open work." };

      return {
        text: `${idle.length} ${s(idle.length, "person", "people")} with no open tasks:\n\n${idle
          .slice(0, 8)
          .map((u) => `• ${u.name}`)
          .join("\n")}${idle.length > 8 ? `\n…and ${idle.length - 8} more.` : ""}${
          unassigned > 0
            ? `\n\nThere ${s(unassigned, "is", "are")} also ${unassigned} unassigned open ${s(unassigned, "task")} that could go to them.`
            : ""
        }`,
        href: "/people",
        hrefLabel: "Open people",
      };
    },
  },
  {
    // "what's waiting on review", "review queue", "pending approval"
    match: [/review|approval|waiting on me|pending sign.?off|queue/],
    answer: (ctx, tasks) => {
      const waiting = tasks
        .filter((t) => REVIEW_STATUSES.has(t.status))
        .map((t) => ({ t, waited: daysSince(t.lastStatusUpdate) ?? 0 }))
        .sort((a, b) => b.waited - a.waited);

      if (waiting.length === 0)
        return {
          text: "Nothing is sitting in a review stage in your scope right now.",
          href: "/review?queue=1",
          hrefLabel: "Open reviews",
        };

      const lines = waiting
        .slice(0, 5)
        .map(
          (r) =>
            `• ${r.t.title} — ${r.waited} ${s(r.waited, "day")} at ${r.t.status.replace(/-/g, " ")}, from ${nameOf(ctx, r.t.assigneeId)}`,
        );
      const stale = waiting.filter((w) => w.waited >= 3).length;

      return {
        text: `${waiting.length} ${s(waiting.length, "submission")} awaiting review${stale > 0 ? `, ${stale} of them 3+ days old` : ""}:\n\n${lines.join("\n")}${waiting.length > 5 ? `\n\n…and ${waiting.length - 5} more.` : ""}`,
        href: "/review?queue=1",
        hrefLabel: "Open reviews",
      };
    },
  },
  {
    // "what's stuck", "stalled", "not moving", "blocked"
    match: [/stuck|stalled|not moving|no progress|blocked|bottleneck/],
    answer: (ctx, tasks) => {
      const stalled = tasks
        .filter((t) => t.status === "in-progress" || t.status === "bottleneck")
        .map((t) => ({ t, idle: daysSince(t.lastStatusUpdate) ?? 0 }))
        .filter((r) => r.idle >= 5)
        .sort((a, b) => b.idle - a.idle);

      if (stalled.length === 0)
        return {
          text: "No in-progress task in your scope has gone 5+ days without a status change.",
        };

      return {
        text: `${stalled.length} ${s(stalled.length, "task")} marked in progress but untouched for 5+ days:\n\n${stalled
          .slice(0, 5)
          .map(
            (r) =>
              `• ${r.t.title} — ${r.idle} days idle, ${nameOf(ctx, r.t.assigneeId)}`,
          )
          .join("\n")}${stalled.length > 5 ? `\n\n…and ${stalled.length - 5} more.` : ""}\n\nStalled work looks identical to healthy work on every board here — only the timestamp separates them.`,
        href: "/tracking",
        hrefLabel: "Open tracking grid",
      };
    },
  },
  {
    // "what's due this week", "coming up"
    match: [/due (this|next) week|due soon|coming up|upcoming|deadline/],
    answer: (ctx, tasks) => {
      const soon = tasks
        .filter((t) => OPEN_STATUSES.has(t.status))
        .map((t) => ({ t, inDays: -(daysSince(t.dueDate) ?? -999) }))
        .filter((r) => r.inDays >= 0 && r.inDays <= 7)
        .sort((a, b) => a.inDays - b.inDays);

      if (soon.length === 0)
        return { text: "Nothing in your scope falls due in the next 7 days." };

      return {
        text: `${soon.length} ${s(soon.length, "task")} due within 7 days:\n\n${soon
          .slice(0, 6)
          .map(
            (r) =>
              `• ${r.t.title} — ${r.inDays === 0 ? "today" : `in ${r.inDays} ${s(r.inDays, "day")}`}, ${nameOf(ctx, r.t.assigneeId)} (${r.t.status.replace(/-/g, " ")})`,
          )
          .join("\n")}${soon.length > 6 ? `\n\n…and ${soon.length - 6} more.` : ""}`,
        href: "/tracking",
        hrefLabel: "Open tracking grid",
      };
    },
  },
  {
    // "how is <department> doing" / "department status"
    match: [/department|team status|how is .* doing|per department/],
    answer: (ctx, tasks) => {
      const byDept = new Map<string, { open: number; overdue: number; review: number }>();
      for (const t of tasks) {
        if (!OPEN_STATUSES.has(t.status)) continue;
        const key = t.department || "Unassigned";
        const e = byDept.get(key) ?? { open: 0, overdue: 0, review: 0 };
        e.open += 1;
        if ((daysSince(t.dueDate) ?? -1) > 0) e.overdue += 1;
        if (REVIEW_STATUSES.has(t.status)) e.review += 1;
        byDept.set(key, e);
      }
      if (byDept.size === 0)
        return { text: "No open work in your scope to break down by department." };

      const ranked = Array.from(byDept.entries()).sort(
        (a, b) => b[1].overdue - a[1].overdue || b[1].open - a[1].open,
      );
      return {
        text: `Open work by department:\n\n${ranked
          .slice(0, 8)
          .map(
            ([d, e]) =>
              `• ${d} — ${e.open} open${e.overdue > 0 ? `, ${e.overdue} overdue` : ""}${e.review > 0 ? `, ${e.review} in review` : ""}`,
          )
          .join("\n")}`,
        href: "/departments",
        hrefLabel: "Open departments",
      };
    },
  },
  {
    // "what am I working on" / "my tasks"
    match: [/my task|what am i|assigned to me|my work|my queue/],
    answer: (ctx, tasks) => {
      const mine = tasks
        .filter(
          (t) => t.assigneeId === ctx.currentUserId && OPEN_STATUSES.has(t.status),
        )
        .sort(
          (a, b) =>
            (new Date(a.dueDate).getTime() || Infinity) -
            (new Date(b.dueDate).getTime() || Infinity),
        );
      if (mine.length === 0)
        return { text: "You have no open tasks assigned right now." };
      return {
        text: `You have ${mine.length} open ${s(mine.length, "task")}:\n\n${mine
          .slice(0, 6)
          .map((t) => {
            const late = daysSince(t.dueDate) ?? -1;
            return `• ${t.title} — ${t.status.replace(/-/g, " ")}${late > 0 ? `, ${late} ${s(late, "day")} overdue` : ""}`;
          })
          .join("\n")}${mine.length > 6 ? `\n\n…and ${mine.length - 6} more.` : ""}`,
        href: "/my-tasks",
        hrefLabel: "Open my tasks",
      };
    },
  },
];

/**
 * Product knowledge. Answers "how do I…" questions about Forge itself, which
 * no amount of querying the production data can cover.
 */
const HOW_TO: { match: RegExp; text: string; href?: string; hrefLabel?: string }[] =
  [
    {
      match: /submit.*(review|approval)|send.*for review|how.*review my/,
      text: "Open the shot in Reviews, upload your version with Insert Video, then press Submit for Lead Review in the header. It moves to your lead's queue; they either approve it up to the producer or send it back with notes on the timeline.",
      href: "/review?queue=1",
      hrefLabel: "Open reviews",
    },
    {
      match: /annotat|draw|pen tool|markup/,
      text: "In the review player, pick a tool from the floating toolbar (or press 2 for pen, 3 for arrow, 4 for rectangle, 5 for text; 1 returns to select). Marks are pinned to the frame you drew them on and saved for everyone on that version. Press Escape to deselect.",
    },
    {
      match: /shortcut|hotkey|keyboard/,
      text: "In the review player: Space plays/pauses, J/K/L shuttle (press J or L again to go faster — 1×, 2×, 4×, 8×), left/right arrows or , and . step one frame, Home and End jump to the ends. Across the app: Ctrl/Cmd+K opens the command palette and ? opens the full shortcut list.",
    },
    {
      match: /clock|attendance|timesheet|hours|punch/,
      text: "You are clocked in automatically when you sign in, and clocked out when you sign out — artists, leads, producers and production heads only. Each shift is written to its own attendance record with its date and length, so hours survive the sign-out rather than being overwritten.",
    },
    {
      match: /import|excel|tracksheet|spreadsheet|csv/,
      text: "The Global Tracking Grid takes your tracksheet in the format you already keep it: Import reads your column headings and your own status codes (TK_02_APP, WFF, Client_Tk02_Rtk and so on) and maps them onto pipeline stages, leaving the original code on the card as the source of truth.",
      href: "/tracking",
      hrefLabel: "Open tracking grid",
    },
    {
      match: /role|permission|capabilit|rbac|access/,
      text: "Forge checks a capability per request, not a role name: roles hold capabilities, and what you can see is scoped separately (studio-wide, your department, or your own work). Anyone registering gets artist; anything above that is granted deliberately by an administrator, which is why a requested role shows as pending until it is approved.",
    },
    {
      match: /register|sign ?up|new user|add (a )?(user|person|artist)/,
      text: "People register themselves at /register — name, work email, password, their department and the role they are asking for. The account is always created as an artist; if they asked for more, an administrator approves it from the People screen, which is what actually changes their access.",
      href: "/people",
      hrefLabel: "Open people",
    },
  ];

export const SUGGESTED_QUESTIONS: Record<InsightAudience, string[]> = {
  studio: [
    "What's overdue across the studio?",
    "Who is overloaded right now?",
    "What's waiting on review?",
    "Who has no work assigned?",
  ],
  department: [
    "What's overdue in my department?",
    "What's stuck and not moving?",
    "What's waiting on review?",
    "Who is overloaded right now?",
  ],
  own: [
    "What am I working on?",
    "What's due this week?",
    "How do I submit for review?",
    "What are the player shortcuts?",
  ],
};

/**
 * Routes a question to the handler that can answer it from real data.
 *
 * The unmatched case is the important one. Rather than reach for something
 * plausible, it says what it does not know and lists what it does — an
 * assistant that is candid about its edges gets trusted on the answers inside
 * them, and one that bluffs does not get trusted anywhere.
 */
export function answerQuestion(
  question: string,
  ctx: InsightContext,
): AssistantAnswer {
  const q = question.toLowerCase();

  // Product questions first: "how do I submit for review" mentions review but
  // is asking how the feature works, not for a list of what is queued.
  const asksHowTo = /how (do|does|can|would)|what is|what are|explain|where do/.test(q);
  if (asksHowTo) {
    const hit = HOW_TO.find((h) => h.match.test(q));
    if (hit)
      return { text: hit.text, href: hit.href, hrefLabel: hit.hrefLabel };
  }

  const tasks = normalize(ctx);
  for (const handler of HANDLERS) {
    if (handler.match.some((re) => re.test(q))) return handler.answer(ctx, tasks);
  }

  // Second pass for product questions phrased without a how/what opener.
  const hit = HOW_TO.find((h) => h.match.test(q));
  if (hit) return { text: hit.text, href: hit.href, hrefLabel: hit.hrefLabel };

  return {
    text: `I can't answer that one from the data I have. I don't guess — an answer here is a query over your live board, so if I can't compute it I'd rather say so.\n\nThings I can answer:\n• What's overdue, stalled, or due soon\n• Who is overloaded and who is free\n• What's waiting on review and for how long\n• How a part of Forge works (reviews, annotation, shortcuts, attendance, roles, tracksheet import)`,
  };
}
