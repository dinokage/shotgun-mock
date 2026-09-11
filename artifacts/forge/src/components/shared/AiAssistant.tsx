import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import {
  Sparkles,
  X,
  AlertTriangle,
  TrendingUp,
  Info,
  ArrowRight,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store/auth";
import { useTasksStore } from "@/store/tasks";
import { useUserStore } from "@/store/users";
import { useProjectStore } from "@/store/projects";
import { useShotStore } from "@/store/shots";
import { useAssetStore } from "@/store/assets";
import { useDepartmentStore } from "@/store/departments";
import { useEntityProjectMap } from "@/lib/taskShape";
import {
  generateInsights,
  type AIInsight,
  type InsightAudience,
  type InsightSeverity,
} from "@/lib/aiInsights";
import { answerQuestion, SUGGESTED_QUESTIONS } from "@/lib/aiAssistant";

const SEVERITY_STYLE: Record<
  InsightSeverity,
  { icon: typeof AlertTriangle; className: string; ring: string }
> = {
  critical: {
    icon: AlertTriangle,
    className: "text-red-500",
    ring: "border-red-500/30 bg-red-500/5",
  },
  warning: {
    icon: Info,
    className: "text-amber-500",
    ring: "border-amber-500/30 bg-amber-500/5",
  },
  positive: {
    icon: TrendingUp,
    className: "text-emerald-500",
    ring: "border-emerald-500/30 bg-emerald-500/5",
  },
};

/** Which questions this role's insights should answer. */
function audienceForRole(role: string | undefined): InsightAudience {
  if (!role) return "own";
  if (role === "producer" || role === "production_head" || role === "admin")
    return "studio";
  if (role === "lead") return "department";
  return "own";
}

function InsightCard({ insight }: { insight: AIInsight }) {
  const style = SEVERITY_STYLE[insight.severity];
  const Icon = style.icon;
  return (
    <div className={cn("rounded-lg border p-3 space-y-2", style.ring)}>
      <div className="flex items-start gap-2">
        <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", style.className)} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium leading-snug">{insight.title}</div>
          {insight.metric && (
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {insight.metric.label}:{" "}
              <span className="font-mono font-medium text-foreground">
                {insight.metric.value}
              </span>
            </div>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {insight.reasoning}
      </p>
      {insight.recommendation && (
        <p className="text-xs leading-relaxed border-l-2 border-border pl-2 text-foreground/80">
          {insight.recommendation}
        </p>
      )}
      <Link href={insight.actionHref}>
        <button className="text-xs text-primary hover:underline inline-flex items-center gap-1">
          {insight.actionLabel} <ArrowRight className="w-3 h-3" />
        </button>
      </Link>
    </div>
  );
}

/**
 * The floating assistant.
 *
 * Two things live behind one launcher, because they are two halves of the
 * same question: "what should I be looking at" (the computed insight feed)
 * and "let me ask something specific" (a query over the same live data).
 *
 * Both are deterministic — computed from the rows already in the stores,
 * which the API has scoped to what this person may read. Nothing is sent
 * anywhere: the studio network has no outbound internet access, so an
 * assistant that called a hosted model would simply fail here, and one that
 * *appeared* to answer while inventing the numbers would be worse than none.
 */
export function AiAssistant() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"insights" | "ask">("insights");
  const [question, setQuestion] = useState("");
  const [thread, setThread] = useState<
    { role: "you" | "forge"; text: string; href?: string; hrefLabel?: string }[]
  >([]);

  const currentUser = useAuthStore((s) => s.currentUser);
  const tasks = useTasksStore((s) => s.tasks);
  const users = useUserStore((s) => s.users);
  const projects = useProjectStore((s) => s.projects);
  const shots = useShotStore((s) => s.shots);
  const assets = useAssetStore((s) => s.assets);
  const departments = useDepartmentStore((s) => s.departments);
  const entityProjectMap = useEntityProjectMap();

  const audience = audienceForRole(currentUser?.role);
  const departmentName =
    departments.find((d) => d.id === currentUser?.departmentId)?.name ?? null;

  const ctx = useMemo(
    () => ({
      audience,
      currentUserId: currentUser?.id,
      departmentName,
      assets,
      projects,
      shots,
      tasks,
      users,
      departments,
      entityProjectMap,
    }),
    [
      audience,
      currentUser?.id,
      departmentName,
      assets,
      projects,
      shots,
      tasks,
      users,
      departments,
      entityProjectMap,
    ],
  );

  const insights = useMemo(() => generateInsights(ctx), [ctx]);
  const criticalCount = insights.filter((i) => i.severity === "critical").length;

  const ask = (text: string) => {
    const q = text.trim();
    if (!q) return;
    const answer = answerQuestion(q, ctx);
    setThread((prev) => [
      ...prev,
      { role: "you", text: q },
      {
        role: "forge",
        text: answer.text,
        href: answer.href,
        hrefLabel: answer.hrefLabel,
      },
    ]);
    setQuestion("");
  };

  // The review player is a full-screen tool that owns all four corners --
  // its comment composer sits exactly where this launcher would land. Rather
  // than float something on top of it, the assistant stays out of that route.
  if (location.startsWith("/review/")) return null;
  if (!currentUser) return null;

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="fixed bottom-20 right-4 z-40 w-[min(24rem,calc(100vw-2rem))] max-h-[min(32rem,calc(100vh-8rem))] bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">Forge Assistant</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border rounded px-1 py-0.5">
                  Beta
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setOpen(false)}
                aria-label="Close assistant"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex border-b border-border shrink-0">
              {(["insights", "ask"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "flex-1 text-xs py-2 capitalize transition-colors",
                    tab === t
                      ? "text-foreground font-medium border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t === "insights" ? "Insights" : "Ask"}
                </button>
              ))}
            </div>

            {tab === "insights" ? (
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                <p className="text-[11px] text-muted-foreground px-0.5">
                  {audience === "studio"
                    ? "Computed across the studio from live task, review and timesheet data."
                    : audience === "department"
                      ? `Computed across ${departmentName ?? "your department"} from live task and review data.`
                      : "Computed from your own open work."}
                </p>
                {insights.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-8 text-center">
                    Nothing stands out right now — no overdue, stalled or
                    queued work in your scope.
                  </div>
                ) : (
                  insights.map((i) => <InsightCard key={i.id} insight={i} />)
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {thread.length === 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] text-muted-foreground">
                        Ask about your production. Answers are computed from
                        live data, not generated — so they are only ever as
                        current as the board.
                      </p>
                      {SUGGESTED_QUESTIONS[audience].map((q) => (
                        <button
                          key={q}
                          onClick={() => ask(q)}
                          className="block w-full text-left text-xs px-2.5 py-2 rounded-md border border-border hover:bg-muted/50 transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                  {thread.map((m, i) => (
                    <div
                      key={i}
                      className={cn(
                        "text-xs leading-relaxed rounded-lg px-3 py-2",
                        m.role === "you"
                          ? "bg-primary/10 ml-6"
                          : "bg-muted/40 mr-6",
                      )}
                    >
                      <div className="whitespace-pre-wrap">{m.text}</div>
                      {m.href && (
                        <Link href={m.href}>
                          <button className="text-primary hover:underline inline-flex items-center gap-1 mt-1.5">
                            {m.hrefLabel ?? "Open"}{" "}
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
                <form
                  className="p-3 border-t border-border flex gap-2 shrink-0"
                  onSubmit={(e) => {
                    e.preventDefault();
                    ask(question);
                  }}
                >
                  <Input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="What's overdue?"
                    className="h-8 text-xs"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    disabled={!question.trim()}
                    aria-label="Ask"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </form>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Launcher. Deliberately small and in the one corner nothing else
          occupies: the toast viewport shares it, so toast.tsx lifts its
          bottom offset clear of this button rather than stacking on top. */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Forge Assistant"
        className={cn(
          "fixed bottom-4 right-4 z-40 h-11 w-11 rounded-full shadow-lg",
          "bg-primary text-primary-foreground",
          "flex items-center justify-center",
          "hover:scale-105 active:scale-95 transition-transform",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
      >
        <Sparkles className="w-5 h-5" />
        {/* Only ever shown for findings that need a decision today -- a badge
            that is always lit stops being read within a week. */}
        {!open && criticalCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-card">
            {criticalCount}
          </span>
        )}
      </button>
    </>
  );
}
