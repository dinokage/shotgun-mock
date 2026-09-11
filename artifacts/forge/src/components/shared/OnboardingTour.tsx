import { useEffect, useLayoutEffect, useState } from "react";
import { useLocation } from "wouter";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth";
import { useUIStore } from "@/store/ui";
import { apiFetch } from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, ListTodo, Film, Box, MessageSquare, CalendarCheck,
  Clock, PlayCircle, Users, Grid3x3, CalendarRange, FolderKanban,
  BarChart3, Truck, Shield, ScrollText, Settings2, Upload, Building2,
} from "lucide-react";

interface Step {
  icon: typeof ListTodo;
  title: string;
  where: string;
  body: string;
  /** The page the tour navigates to for this step. */
  route: string;
  /**
   * The sidebar entry to spotlight, as its path. Matches the `data-tour`
   * attribute Sidebar puts on each nav item. Omitted where the step has no
   * nav entry of its own.
   */
  anchor?: string;
}

// One catalogue of steps, assembled per role below. Written from the reader's
// side of the screen -- what they do here, not what the page is called. Each
// one names the page it lives on, because the tour takes you there and talks
// about what is actually on screen rather than describing it from a card.
const STEPS: Record<string, Step> = {
  tasks: {
    icon: ListTodo,
    title: "My Tasks",
    where: "Your work board",
    route: "/tasks",
    anchor: "/tasks",
    body: "This is everything assigned to you, grouped by stage. Drag a card to move it between columns, or open one to log time, add a comment, or upload your work. Anything under Available Tasks is unclaimed — take it if you have capacity.",
  },
  reviews: {
    icon: PlayCircle,
    title: "Reviews",
    where: "Where work gets checked",
    route: "/review?queue=1",
    anchor: "/review",
    body: "Upload a version, draw notes directly on the frame, and submit it for review. Notes stay pinned to the exact frame they refer to, so nothing gets lost in a chat thread. Awaiting Me is often empty — that only means nothing is blocked on you; use All to see everything else.",
  },
  shots: {
    icon: Film,
    title: "My Shots",
    where: "Shot-level view",
    route: "/shots?mine=1",
    anchor: "/shots",
    body: "Every shot you are responsible for and the stage it has reached. Use this when you want the shot picture rather than the task picture — one shot usually carries several tasks across departments.",
  },
  assets: {
    icon: Box,
    title: "My Assets",
    where: "Characters, props, environments",
    route: "/assets?mine=1",
    anchor: "/assets",
    body: "The reusable pieces you are building, tracked the same way shots are. Assets have dependencies: if a model is late, everything textured or rigged from it waits too, and that chain is visible here.",
  },
  timesheets: {
    icon: Clock,
    title: "Timesheets",
    where: "Your hours",
    route: "/timesheets",
    anchor: "/timesheets",
    body: "Time logged against tasks. You are clocked in automatically when you sign in and out when you sign out, so attendance fills itself in — but logging hours against individual tasks is what makes future estimates accurate.",
  },
  standup: {
    icon: CalendarCheck,
    title: "Daily Standup",
    where: "What you are working on today",
    route: "/daily-standup",
    anchor: "/daily-standup",
    body: "A short daily note. It is posted for you when you sign out, from what you actually did, or you can write it yourself here.",
  },
  chat: {
    icon: MessageSquare,
    title: "Team Chat",
    where: "Talking to the team",
    route: "/chat",
    anchor: "/chat",
    body: "Conversation that does not belong on a specific shot. Anything about a specific shot is better left as a comment on that shot, where it stays findable months later.",
  },
  production: {
    icon: LayoutDashboard,
    title: "Production Dashboard",
    where: "Your department at a glance",
    route: "/production",
    anchor: "/production",
    body: "Shot counts, what is pending review, and what is at risk — scoped to your department. Start your day here; it is the fastest way to see what moved overnight.",
  },
  tracking: {
    icon: Grid3x3,
    title: "Tracking Grid",
    where: "The whole slate in one table",
    route: "/tracking",
    anchor: "/tracking",
    body: "Every shot with its status, assignee and review state. Status is editable directly in the grid and changes are staged until you press Save Changes. This is also where you import an existing tracksheet — it reads your own status codes rather than making you rewrite them.",
  },
  scheduling: {
    icon: CalendarRange,
    title: "Scheduling",
    where: "Who is carrying what",
    route: "/scheduling",
    anchor: "/scheduling",
    body: "Workload across the team, so an overloaded artist is visible before the deadline slips rather than after it.",
  },
  projects: {
    icon: FolderKanban,
    title: "Projects",
    where: "The shows you are running",
    route: "/projects",
    anchor: "/projects",
    body: "Each project with real progress computed from completed tasks, not a percentage somebody typed in.",
  },
  analytics: {
    icon: BarChart3,
    title: "Analytics",
    where: "Throughput and risk",
    route: "/analytics",
    anchor: "/analytics",
    body: "How fast work is moving, where it is piling up, and what looks likely to miss.",
  },
  deliveries: {
    icon: Truck,
    title: "Deliveries",
    where: "What went to the client",
    route: "/delivery",
    anchor: "/delivery",
    body: "A record of what was sent, to whom, and when.",
  },
  people: {
    icon: Users,
    title: "Studio Roster",
    where: "Everyone in the studio",
    route: "/people",
    anchor: "/people",
    body: "Who is here, which department they are in, and whether they are online right now. Online reflects genuine recent activity, not just whether somebody forgot to sign out. This is also where you approve the role somebody asked for when they registered.",
  },
  publishing: {
    icon: Upload,
    title: "Publishing",
    where: "Sending work onward",
    route: "/publishing",
    anchor: "/publishing",
    body: "Where approved work is packaged and shared with the client, using a link and a separate access code so the two can be sent by different means.",
  },
  departments: {
    icon: Building2,
    title: "Departments",
    where: "How the pipeline is ordered",
    route: "/departments",
    anchor: "/departments",
    body: "The departments work passes through, and the order it passes through them.",
  },
  roles: {
    icon: Shield,
    title: "Roles and permissions",
    where: "Who can do what",
    // Roles live inside the Admin Panel rather than on a route of their own.
    route: "/admin",
    anchor: "/admin",
    body: "Permissions are granted to roles and checked on every single request, not just hidden in the interface. Changing the matrix here takes effect immediately, with no redeployment. This is also where you approve a role somebody asked for when they registered.",
  },
  audit: {
    icon: ScrollText,
    title: "Time Travel",
    where: "The audit trail",
    route: "/audit",
    anchor: "/audit",
    body: "A record of significant changes, with who made them and when. Where a change can be safely undone, the rollback is recorded as its own event rather than erasing the history.",
  },
  settings: {
    icon: Settings2,
    title: "Settings",
    where: "Studio configuration",
    route: "/settings",
    anchor: "/settings",
    body: "Studio-wide options, integrations and licences. You can restart this walkthrough from here at any time.",
  },
};

const BY_ROLE: Record<string, string[]> = {
  artist: ["tasks", "reviews", "shots", "assets", "timesheets", "standup", "chat"],
  lead: ["production", "tasks", "reviews", "tracking", "scheduling", "timesheets", "standup", "chat"],
  production_head: ["tracking", "reviews", "projects", "scheduling", "people", "analytics", "deliveries", "publishing"],
  producer: ["tracking", "reviews", "projects", "scheduling", "people", "analytics", "deliveries", "publishing"],
  admin: ["people", "roles", "departments", "audit", "settings", "analytics"],
};

const ROLE_INTRO: Record<string, { hello: string; role: string; note: string }> = {
  artist: {
    hello: "You are set up as an artist.",
    role: "Artist",
    note: "You work on shots assigned to you and submit them for review. You will not see other departments' work, and you cannot assign work to other people — that is your lead's job.",
  },
  lead: {
    hello: "You are set up as a department lead.",
    role: "Lead",
    note: "You run one department: you assign its work, review what your artists submit, and approve it up to production. You act within your own department only.",
  },
  production_head: {
    hello: "You are set up as production head.",
    role: "Production Head",
    note: "You see the whole studio, give final approval after lead review, and are the last check before anything reaches a client.",
  },
  producer: {
    hello: "You are set up as producer.",
    role: "Producer",
    note: "You see the whole studio and hold the final gate before work goes to a client.",
  },
  admin: {
    hello: "You are set up as an administrator.",
    role: "Administrator",
    note: "You manage accounts, roles and configuration, and you can see everything. You deliberately hold no production capability — you cannot be assigned work, and you cannot approve reviews. That separation is intentional, so oversight stays independent of the work being overseen.",
  },
};

/** Padding around the spotlight ring, in px. */
const SPOTLIGHT_PAD = 6;

/**
 * First-run walkthrough.
 *
 * Deliberately *not* a stack of modal cards describing the product. It drives
 * the real application: each step navigates to the page it is about, waits for
 * it to render, highlights the nav entry that got you there, and explains what
 * is on screen. Someone who finishes it has already visited every page they
 * will use and watched the app respond, rather than having read a brochure
 * over the top of a blurred background.
 *
 * The panel is non-modal and nothing is click-blocked: the tour runs alongside
 * the app rather than in front of it, so a reader can look around a page
 * mid-step and carry on.
 */
export function OnboardingTour() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const updateCurrentUser = useAuthStore((s) => s.updateCurrentUser);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const [location, setLocation] = useLocation();
  const [index, setIndex] = useState(0);
  const [closing, setClosing] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const role = currentUser?.role ?? "artist";
  const keys = BY_ROLE[role] ?? BY_ROLE.artist;
  const intro = ROLE_INTRO[role] ?? ROLE_INTRO.artist;
  const total = keys.length + 1; // +1 for the welcome panel
  const isWelcome = index === 0;
  const step = isWelcome ? null : STEPS[keys[index - 1]];
  const active = !!currentUser && !currentUser.onboardedAt && !closing;

  // Navigate to the step's page. This is what makes it a walkthrough rather
  // than a slideshow -- the page behind the panel is the real one, with the
  // reader's own data on it.
  useEffect(() => {
    if (!active || !step) return;
    const target = step.route.split("?")[0];
    if (location.split("?")[0] !== target) setLocation(step.route);
  }, [active, step, location, setLocation]);

  // Measure the nav entry to spotlight. Re-measured on step change, on
  // resize, and when the sidebar collapses -- all three move it, and a ring
  // left at a stale position is worse than no ring at all.
  useLayoutEffect(() => {
    if (!active || !step?.anchor) {
      setRect(null);
      return;
    }
    let raf = 0;
    const measure = () => {
      const el = document.querySelector(`[data-tour="${step.anchor}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    // One frame's delay: the route change above has to commit before the
    // target exists and before its active styling settles its size.
    raf = requestAnimationFrame(() => {
      measure();
      // A second pass after the navigation animation, so the ring lands on
      // the final position rather than a mid-transition one.
      window.setTimeout(measure, 320);
    });
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [active, step, location, sidebarCollapsed]);

  // Arrow keys and Escape, because a walkthrough that can only be driven by
  // clicking its own buttons is one more thing to learn.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && index < total - 1) setIndex((i) => i + 1);
      if (e.key === "ArrowLeft" && index > 0) setIndex((i) => i - 1);
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index, total]);

  const finish = async (replay = false) => {
    setClosing(true);
    // Update locally first so the panel closes immediately; the /me poll
    // would otherwise take up to ten seconds to reflect it.
    updateCurrentUser({ onboardedAt: replay ? null : new Date().toISOString() });
    try {
      await apiFetch("/auth/onboarding", {
        method: "POST",
        body: JSON.stringify({ replay }),
      });
    } catch {
      // A failed write only means the tour may appear once more. Not worth
      // interrupting a first-run experience with an error.
    }
  };

  if (!active) return null;

  const Icon = step?.icon ?? LayoutDashboard;

  return createPortal(
    <>
      {/* Dimmer. `pointer-events-none` throughout: this directs attention, it
          does not trap the reader. Clicking the page underneath works
          normally, and the tour keeps its place. */}
      <div className="fixed inset-0 z-[60] pointer-events-none bg-black/35 transition-opacity" />

      {/* Spotlight ring — a hole punched over the real nav entry rather than a
          drawn copy of it, so it stays correct as the sidebar collapses,
          the window resizes, or the badge counts change its width. */}
      {rect && (
        <div
          className="fixed z-[61] pointer-events-none rounded-md ring-2 ring-primary transition-all duration-200"
          style={{
            top: rect.top - SPOTLIGHT_PAD,
            left: rect.left - SPOTLIGHT_PAD,
            width: rect.width + SPOTLIGHT_PAD * 2,
            height: rect.height + SPOTLIGHT_PAD * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.0), 0 0 24px 4px hsl(var(--primary) / 0.45)",
            background: "hsl(var(--primary) / 0.10)",
          }}
        />
      )}

      {/* The panel. Anchored bottom-left: the bottom-right corner belongs to
          the assistant launcher and the toast stack, and centring it would
          cover the page the step is asking the reader to look at. */}
      <div
        className={cn(
          "fixed z-[62] bottom-4 left-4 w-[min(26rem,calc(100vw-2rem))]",
          "bg-card border border-border rounded-xl shadow-2xl p-5",
          "animate-in fade-in slide-in-from-bottom-2 duration-200",
        )}
        role="dialog"
        aria-label="Forge walkthrough"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="w-4.5 h-4.5 text-primary" />
          </div>
          <div className="min-w-0">
            {isWelcome ? (
              <>
                <h2 className="text-lg font-semibold leading-tight">
                  Welcome to Forge
                </h2>
                <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                  Forge is where this studio tracks every shot, reviews it, and
                  gets it approved. This walkthrough opens each page you will
                  actually use and explains what is on it. About a minute.
                </p>
              </>
            ) : (
              <>
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Step {index} of {total - 1} · {step!.where}
                </div>
                <h2 className="text-lg font-semibold leading-tight mt-0.5">
                  {step!.title}
                </h2>
                <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                  {step!.body}
                </p>
              </>
            )}
          </div>
        </div>

        {isWelcome && (
          <div className="mt-4 rounded-md border border-border bg-muted/40 p-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              {intro.role}
            </div>
            <p className="text-sm text-foreground/90 leading-relaxed">
              {intro.hello} {intro.note}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-4 mt-5">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {Array.from({ length: total }).map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === index ? "w-5 bg-primary" : "w-1.5 bg-border hover:bg-muted-foreground",
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {index === 0 ? (
              <Button variant="ghost" size="sm" onClick={() => finish()}>
                Skip
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setIndex(index - 1)}>
                Back
              </Button>
            )}
            {index < total - 1 ? (
              <Button size="sm" onClick={() => setIndex(index + 1)}>
                Next
              </Button>
            ) : (
              <Button size="sm" onClick={() => finish()}>
                Get started
              </Button>
            )}
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground mt-3">
          Arrow keys move between steps · Escape closes · You can run this again
          from Settings.
        </p>
      </div>
    </>,
    document.body,
  );
}
