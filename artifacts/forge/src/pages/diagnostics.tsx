import { useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import {
  AlertTriangle,
  Server,
  Monitor,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  useErrorEvents,
  useErrorSummary,
  useResolveError,
  type ErrorEventDTO,
} from "@/hooks/useErrorEvents";

/**
 * Diagnostics — every error the platform has caught, from both sides.
 *
 * This studio runs air-gapped, so a hosted error service would never receive
 * anything: the API's Sentry integration stays wired but collects nothing
 * without an outbound route. Errors are written to the studio's own database
 * instead, and this is where they are read.
 *
 * Grouped first, chronological second. A single fault firing a thousand times
 * would otherwise bury every other error in the studio underneath it, and the
 * question worth answering on arrival is "what is happening a lot", not "what
 * happened most recently".
 */
export default function Diagnostics() {
  const [source, setSource] = useState<"" | "api" | "web">("");
  const [resolved, setResolved] = useState<"false" | "">("false");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: summary } = useErrorSummary();
  const { data: events = [], isLoading } = useErrorEvents({
    source: source || undefined,
    resolved: resolved || undefined,
  });
  const resolve = useResolveError();

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold">Diagnostics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Errors caught across the platform — the API and every browser
          session. Collected on this server, because the studio has no
          outbound internet for a hosted service to report to.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
              <AlertTriangle className="w-3.5 h-3.5" /> Unresolved
            </div>
            <div className="text-3xl font-semibold mt-1 tabular-nums">
              {summary?.unresolved ?? "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
              <Server className="w-3.5 h-3.5" /> Distinct faults, 7 days
            </div>
            <div className="text-3xl font-semibold mt-1 tabular-nums">
              {summary?.groups.length ?? "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
              <ShieldCheck className="w-3.5 h-3.5" /> Retention
            </div>
            <div className="text-3xl font-semibold mt-1">30 days</div>
          </CardContent>
        </Card>
      </div>

      {summary && summary.groups.length > 0 && (
        <div>
          <h2 className="text-sm font-medium mb-2">Most frequent, last 7 days</h2>
          <div className="border border-border rounded-lg divide-y divide-border">
            {summary.groups.slice(0, 8).map((g) => (
              <div
                key={`${g.source}:${g.kind}`}
                className="flex items-center gap-3 px-4 py-2.5 text-sm"
              >
                <Badge variant="outline" className="shrink-0 gap-1">
                  {g.source === "api" ? (
                    <Server className="w-3 h-3" />
                  ) : (
                    <Monitor className="w-3 h-3" />
                  )}
                  {g.source}
                </Badge>
                <span className="font-mono text-xs truncate flex-1">{g.kind}</span>
                <span className="text-muted-foreground text-xs">
                  {g.lastSeen
                    ? `${formatDistanceToNowStrict(new Date(g.lastSeen))} ago`
                    : ""}
                </span>
                <span className="font-semibold tabular-nums w-12 text-right">
                  {g.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <Tabs value={source} onValueChange={(v) => setSource(v as typeof source)}>
          <TabsList>
            <TabsTrigger value="">All sources</TabsTrigger>
            <TabsTrigger value="api">API</TabsTrigger>
            <TabsTrigger value="web">Browser</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs
          value={resolved}
          onValueChange={(v) => setResolved(v as typeof resolved)}
        >
          <TabsList>
            <TabsTrigger value="false">Unresolved</TabsTrigger>
            <TabsTrigger value="">Everything</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-10 text-center">
          Loading…
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          <div className="text-sm">
            {resolved === "false"
              ? "Nothing unresolved. The platform hasn't caught an error it hasn't been told about."
              : "No errors recorded."}
          </div>
        </div>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {events.map((e) => (
            <ErrorRow
              key={e.id}
              event={e}
              expanded={expanded === e.id}
              onToggle={() => setExpanded(expanded === e.id ? null : e.id)}
              onResolve={() => resolve.mutate(e.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ErrorRow({
  event,
  expanded,
  onToggle,
  onResolve,
}: {
  event: ErrorEventDTO;
  expanded: boolean;
  onToggle: () => void;
  onResolve: () => void;
}) {
  const Icon = event.source === "api" ? Server : Monitor;
  return (
    <div className={cn(event.resolvedAt && "opacity-55")}>
      <div className="flex items-start gap-3 px-4 py-3">
        <button
          onClick={onToggle}
          className="mt-0.5 text-muted-foreground hover:text-foreground shrink-0"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
        <Icon className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-semibold">{event.kind}</span>
            {event.statusCode && (
              <Badge variant="outline" className="text-[10px]">
                {event.statusCode}
              </Badge>
            )}
            {event.path && (
              <span className="text-xs text-muted-foreground font-mono truncate">
                {event.method ? `${event.method} ` : ""}
                {event.path}
              </span>
            )}
          </div>
          <div className="text-sm mt-0.5 break-words">{event.message}</div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {formatDistanceToNowStrict(new Date(event.createdAt))} ago
            {event.release ? ` · ${event.release}` : ""}
          </div>
        </div>
        {!event.resolvedAt && (
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 text-xs"
            onClick={onResolve}
          >
            Resolve
          </Button>
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-4 pl-14 space-y-3">
          {event.stack && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                Stack
              </div>
              <pre className="text-[11px] bg-muted/40 rounded p-3 overflow-x-auto whitespace-pre-wrap">
                {event.stack}
              </pre>
            </div>
          )}
          {event.context && Object.keys(event.context).length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                Context
              </div>
              <pre className="text-[11px] bg-muted/40 rounded p-3 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(event.context, null, 2)}
              </pre>
            </div>
          )}
          {event.userAgent && (
            <div className="text-[11px] text-muted-foreground break-all">
              {event.userAgent}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
