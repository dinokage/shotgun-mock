import { useMemo } from "react";
import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  CheckCircle2,
  PlayCircle,
  Loader2,
  AlertCircle,
  Clock,
  XCircle,
  Lock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { WORKFLOWS } from "@/data/mockData";
import { useWorkflowsStore, type WorkflowRunState } from "@/store/workflows";
import { useAuthStore } from "@/store/auth";
import { useCapability } from "@/hooks/use-capability";

type RunStepStatus = "complete" | "running" | "paused" | "rejected" | "pending";

interface RunStepView {
  id: string;
  label: string;
  status: RunStepStatus;
  x: number;
}

const STEP_GAP = 200;
const STEP_START = 50;

function stepVisuals(status: RunStepStatus) {
  switch (status) {
    case "complete":
      return { color: "bg-[#1E7A34]", icon: CheckCircle2 };
    case "running":
      return { color: "bg-blue-500", icon: Loader2 };
    case "paused":
      return { color: "bg-[#B5651D]", icon: Clock };
    case "rejected":
      return { color: "bg-destructive", icon: XCircle };
    default:
      return { color: "bg-muted-foreground", icon: PlayCircle };
  }
}

/** Turns a run's flat log into an ordered set of pipeline steps with a
 * per-step status, so the diagram reflects whatever this specific workflow
 * actually did instead of a fixed 4-node demo shape. */
function buildRunSteps(run: WorkflowRunState): RunStepView[] {
  const order: string[] = [];
  const statusByNode = new Map<string, RunStepStatus>();

  for (const entry of run.logs) {
    if (entry.node === "Workflow") continue; // synthetic wrap-up entries, not a pipeline step
    if (!order.includes(entry.node)) order.push(entry.node);
    if (entry.status === "error") statusByNode.set(entry.node, "rejected");
    else if (entry.status === "success")
      statusByNode.set(entry.node, "complete");
    else if (!statusByNode.has(entry.node))
      statusByNode.set(entry.node, "running");
  }

  if (
    run.status === "running" &&
    order.includes(run.currentNode) &&
    statusByNode.get(run.currentNode) !== "rejected"
  ) {
    statusByNode.set(run.currentNode, "paused");
  }

  return order.map((node, i) => ({
    id: node,
    label: node,
    status: statusByNode.get(node) ?? "pending",
    x: STEP_START + i * STEP_GAP,
  }));
}

function headerBadge(status: WorkflowRunState["status"]) {
  switch (status) {
    case "completed":
      return (
        <Badge
          variant="outline"
          className="text-status-green border-status-green/30 bg-status-green/10"
        >
          Completed
        </Badge>
      );
    case "failed":
      return (
        <Badge
          variant="outline"
          className="text-destructive border-destructive/30 bg-destructive/10"
        >
          Rejected
        </Badge>
      );
    default:
      return (
        <Badge
          variant="outline"
          className="text-blue-500 border-blue-500/30 bg-blue-500/10"
        >
          In Progress
        </Badge>
      );
  }
}

export default function WorkflowRun() {
  const [, params] = useRoute("/workflows/run/:id");
  const workflowId = params?.id;
  const workflow = workflowId
    ? WORKFLOWS.find((wf) => wf.id === workflowId)
    : undefined;

  const { toast } = useToast();
  const currentUser = useAuthStore((s) => s.currentUser);
  const canApprove = useCapability("approve_reviews");

  const run = useWorkflowsStore((s) =>
    workflowId ? s.getRun(workflowId) : undefined,
  );
  const approveRunStep = useWorkflowsStore((s) => s.approveRunStep);
  const rejectRunStep = useWorkflowsStore((s) => s.rejectRunStep);

  const steps = useMemo(() => (run ? buildRunSteps(run) : []), [run]);
  const gateStep = steps.find((s) => s.status === "paused");

  if (!workflowId || !workflow || !run) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <div className="h-14 border-b border-border bg-card flex items-center px-4 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            asChild
            className="h-8 w-8 text-muted-foreground"
          >
            <Link href="/workflows">
              <ChevronLeft className="w-5 h-5" />
            </Link>
          </Button>
        </div>
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <AlertCircle className="w-6 h-6" />
            </EmptyMedia>
            <EmptyTitle>Workflow not found</EmptyTitle>
            <EmptyDescription>
              This workflow doesn't exist or may have been removed.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const handleApprove = () => {
    if (!canApprove || !gateStep) return;
    approveRunStep(workflowId, currentUser?.name ?? "Unknown User");
    toast({
      title: "Workflow completed",
      description: "All steps executed successfully.",
    });
  };

  const handleReject = () => {
    if (!canApprove || !gateStep) return;
    rejectRunStep(workflowId, currentUser?.name ?? "Unknown User");
    toast({
      title: "Step rejected",
      description: `${gateStep.label} was rejected. The run has been halted.`,
      variant: "destructive",
    });
  };

  return (
    <div className="flex flex-col h-screen bg-background relative">
      <div className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            asChild
            className="h-8 w-8 text-muted-foreground"
          >
            <Link href="/workflows">
              <ChevronLeft className="w-5 h-5" />
            </Link>
          </Button>
          <div>
            <div className="font-semibold flex items-center gap-2">
              Run: {workflow.name}
              {headerBadge(run.status)}
            </div>
            <div className="text-[11px] text-muted-foreground">{run.id}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-muted/10 relative overflow-hidden flex flex-col">
        <div className="flex-1 relative overflow-auto">
          {steps.length === 0 ? (
            <Empty className="h-full">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PlayCircle className="w-6 h-6" />
                </EmptyMedia>
                <EmptyTitle>No runs yet</EmptyTitle>
                <EmptyDescription>
                  This workflow hasn't been triggered yet, so there's nothing to
                  show.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ minWidth: STEP_START + steps.length * STEP_GAP + 160 }}
              >
                {steps.slice(0, steps.length - 1).map((n, i) => {
                  const next = steps[i + 1];
                  const isComplete = n.status === "complete";
                  return (
                    <path
                      key={n.id}
                      d={`M ${n.x + 160} 140 L ${next.x} 140`}
                      stroke={
                        isComplete ? "hsl(134 60% 30%)" : "hsl(var(--border))"
                      }
                      strokeWidth={isComplete ? "3" : "2"}
                      fill="none"
                    />
                  );
                })}
              </svg>

              {steps.map((step) => {
                const { color, icon: Icon } = stepVisuals(step.status);
                const isPaused = step.status === "paused";
                return (
                  <div
                    key={step.id}
                    className={`absolute w-40 p-4 bg-card border-2 rounded-lg shadow-sm flex flex-col items-center justify-center text-center ${step.status === "running" ? "border-blue-500 animate-pulse" : step.status === "rejected" ? "border-destructive" : "border-border"}`}
                    style={{ left: step.x, top: 100 }}
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-white mb-3 ${color} ${step.status === "running" ? "animate-spin" : ""}`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="font-medium text-sm">{step.label}</div>
                    <div className="text-xs text-muted-foreground capitalize mt-1">
                      {step.status}
                    </div>

                    {isPaused && (
                      <div className="absolute -bottom-10 whitespace-nowrap bg-orange-500/20 text-orange-500 text-xs px-2 py-1 rounded border border-orange-500/30">
                        Awaiting approval
                      </div>
                    )}

                    {isPaused && canApprove && (
                      <div className="absolute -bottom-24 flex gap-2">
                        <Button
                          size="sm"
                          className="bg-status-green hover:bg-status-green/90 text-white shadow-lg"
                          onClick={handleApprove}
                        >
                          Approve Step
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="shadow-lg"
                          onClick={handleReject}
                        >
                          Reject
                        </Button>
                      </div>
                    )}

                    {isPaused && !canApprove && (
                      <div className="absolute -bottom-16 flex items-center gap-1.5 text-[11px] text-muted-foreground whitespace-nowrap">
                        <Lock className="w-3 h-3" /> You can't approve this gate
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Execution Log */}
        <div className="h-64 border-t border-border bg-card flex flex-col">
          <div className="p-2 border-b border-border font-semibold text-sm px-4 bg-muted/30 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-muted-foreground" /> Execution
            Log
          </div>
          <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1.5">
            {run.logs.length === 0 ? (
              <div className="text-muted-foreground">
                No log entries for this run yet.
              </div>
            ) : (
              run.logs.map((entry, i) => (
                <div key={i} className="text-muted-foreground">
                  [{entry.timestamp}]{" "}
                  <span
                    className={
                      entry.status === "success"
                        ? "text-status-green"
                        : entry.status === "error"
                          ? "text-destructive"
                          : entry.status === "warning"
                            ? "text-status-orange"
                            : "text-foreground"
                    }
                  >
                    {entry.node !== "Workflow" ? `${entry.node}: ` : ""}
                    {entry.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
