import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability, denyClientAccess } from "../middleware/rbac";
import { generateAccessCode } from "../lib/accessCode";
import { createNotification } from "./notifications";
import * as crypto from "crypto";

export const workflowsRouter = Router();

workflowsRouter.use(tenantAuthMiddleware);
// Automation that rewires the studio's own pipeline is internal process; a
// client-access session has no legitimate use for it.
workflowsRouter.use(denyClientAccess);

const WORKFLOW_STATUSES = ["active", "draft", "paused"] as const;

const MAX_NAME = 120;
const MAX_DESCRIPTION = 500;
const MAX_TRIGGER = 60;
const MAX_NODES = 500;
const MAX_EDGES = 2000;
const MAX_REJECT_REASON = 500;

interface Graph {
  nodes: unknown[];
  edges: unknown[];
}

// `graph` is free-form JSON in the column, so anything read back out has to be
// re-validated rather than trusted -- a row written before a validation rule
// existed must not crash a read.
function parseGraph(value: unknown): Graph {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { nodes: [], edges: [] };
  const raw = value as Record<string, unknown>;
  return {
    nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
    edges: Array.isArray(raw.edges) ? raw.edges : [],
  };
}

type RunLogStatus = "success" | "info" | "error" | "warning";

interface RunLogEntry {
  timestamp: string;
  node: string;
  message: string;
  status: RunLogStatus;
}

const LOG_STATUSES: RunLogStatus[] = ["success", "info", "error", "warning"];

function parseLogs(value: unknown): RunLogEntry[] {
  if (!Array.isArray(value)) return [];
  const out: RunLogEntry[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    if (typeof entry.node !== "string" || typeof entry.message !== "string") continue;
    out.push({
      timestamp: typeof entry.timestamp === "string" ? entry.timestamp : "",
      node: entry.node,
      message: entry.message,
      status: LOG_STATUSES.includes(entry.status as RunLogStatus)
        ? (entry.status as RunLogStatus)
        : "info",
    });
  }
  return out;
}

/**
 * Validates a graph submitted by the editor. React Flow hands back whatever
 * node/edge shape the canvas holds, so only the structural invariants the
 * editor itself relies on are enforced (unique node ids, edges that resolve to
 * a node); the rest of each node -- position, data, styling -- is stored as
 * authored.
 */
function validateGraph(value: unknown): { graph: Graph } | { error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { error: "graph must be an object with nodes and edges" };
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.edges))
    return { error: "graph.nodes and graph.edges must be arrays" };
  if (raw.nodes.length > MAX_NODES)
    return { error: `graph.nodes must hold at most ${MAX_NODES} nodes` };
  if (raw.edges.length > MAX_EDGES)
    return { error: `graph.edges must hold at most ${MAX_EDGES} edges` };

  const nodeIds = new Set<string>();
  for (const node of raw.nodes) {
    if (!node || typeof node !== "object" || Array.isArray(node))
      return { error: "Every graph node must be an object" };
    const id = (node as Record<string, unknown>).id;
    if (typeof id !== "string" || !id)
      return { error: "Every graph node needs a non-empty string id" };
    if (nodeIds.has(id)) return { error: `Duplicate graph node id: ${id}` };
    nodeIds.add(id);
  }

  for (const edge of raw.edges) {
    if (!edge || typeof edge !== "object" || Array.isArray(edge))
      return { error: "Every graph edge must be an object" };
    const { id, source, target } = edge as Record<string, unknown>;
    if (typeof id !== "string" || !id)
      return { error: "Every graph edge needs a non-empty string id" };
    if (typeof source !== "string" || typeof target !== "string")
      return { error: `Edge ${id} needs string source and target` };
    if (!nodeIds.has(source) || !nodeIds.has(target))
      return { error: `Edge ${id} references a node that isn't in the graph` };
  }

  return { graph: { nodes: raw.nodes, edges: raw.edges } };
}

function trimmedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > max ? null : trimmed;
}

type WorkflowRow = {
  id: string;
  name: string;
  description: string;
  trigger: string;
  status: string;
  graph: unknown;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function workflowSummaryDTO(row: WorkflowRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    trigger: row.trigger,
    status: row.status,
    nodeCount: parseGraph(row.graph).nodes.length,
    createdById: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function workflowDTO(row: WorkflowRow) {
  return { ...workflowSummaryDTO(row), graph: parseGraph(row.graph) };
}

type RunRow = {
  id: string;
  workflowId: string;
  status: string;
  currentNode: string;
  entityId: string | null;
  triggeredById: string | null;
  startedAt: Date;
  completedAt: Date | null;
  logs: unknown;
  triggeredBy?: { name: string } | null;
};

function runDTO(row: RunRow) {
  return {
    id: row.id,
    workflowId: row.workflowId,
    status: row.status,
    currentNode: row.currentNode,
    entityId: row.entityId,
    triggeredById: row.triggeredById,
    triggeredByName: row.triggeredBy?.name ?? null,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    logs: parseLogs(row.logs),
  };
}

// A foreign key proves the workflow exists, not that this tenant owns it --
// every id arriving from a request body or URL is resolved through the
// caller's own tenant before anything is read or written.
async function workflowInTenant(id: string, tenantId: string) {
  return prisma.workflow.findFirst({ where: { id, tenantId } });
}

workflowsRouter.get("/", async (req, res) => {
  try {
    const rows = await prisma.workflow.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    });
    return res.json(rows.map(workflowSummaryDTO));
  } catch (err) {
    req.log.error(err, "Failed to fetch workflows");
    return res.status(500).json({ error: "Internal server error" });
  }
});

workflowsRouter.get("/:id", async (req, res) => {
  try {
    const row = await workflowInTenant(req.params.id, req.tenantId!);
    if (!row) return res.status(404).json({ error: "Workflow not found" });
    return res.json(workflowDTO(row));
  } catch (err) {
    req.log.error(err, "Failed to fetch workflow");
    return res.status(500).json({ error: "Internal server error" });
  }
});

workflowsRouter.post("/", requireCapability("manage_pipeline"), async (req, res) => {
  try {
    const { name, description, trigger, status, graph } = req.body ?? {};

    const cleanName = trimmedString(name, MAX_NAME);
    if (!cleanName)
      return res
        .status(400)
        .json({ error: `name is required and must be at most ${MAX_NAME} characters` });

    const cleanDescription = description === undefined ? "" : trimmedString(description, MAX_DESCRIPTION);
    if (cleanDescription === null)
      return res.status(400).json({ error: `description must be at most ${MAX_DESCRIPTION} characters` });

    const cleanTrigger = trigger === undefined ? "" : trimmedString(trigger, MAX_TRIGGER);
    if (cleanTrigger === null)
      return res.status(400).json({ error: `trigger must be at most ${MAX_TRIGGER} characters` });

    if (status !== undefined && !WORKFLOW_STATUSES.includes(status))
      return res.status(400).json({ error: `status must be one of: ${WORKFLOW_STATUSES.join(", ")}` });

    let graphValue: Graph = { nodes: [], edges: [] };
    if (graph !== undefined) {
      const parsed = validateGraph(graph);
      if ("error" in parsed) return res.status(400).json({ error: parsed.error });
      graphValue = parsed.graph;
    }

    const created = await prisma.workflow.create({
      data: {
        id: crypto.randomUUID(),
        tenantId: req.tenantId!,
        name: cleanName,
        description: cleanDescription,
        trigger: cleanTrigger,
        status: status ?? "draft",
        graph: JSON.parse(JSON.stringify(graphValue)),
        createdById: req.userId!,
      },
    });

    return res.status(201).json(workflowDTO(created));
  } catch (err) {
    req.log.error(err, "Failed to create workflow");
    return res.status(500).json({ error: "Internal server error" });
  }
});

workflowsRouter.patch("/:id", requireCapability("manage_pipeline"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    // Cast needed: combining requireCapability() (typed against the generic,
    // path-agnostic Express Request) with this route's "/:id" path typing
    // makes TS widen req.params.id to `string | string[]`.
    const workflowId = req.params.id as string;

    const existing = await workflowInTenant(workflowId, tenantId);
    if (!existing) return res.status(404).json({ error: "Workflow not found" });

    const body = req.body ?? {};
    const updates: Record<string, unknown> = {};

    if ("name" in body) {
      const cleanName = trimmedString(body.name, MAX_NAME);
      if (!cleanName)
        return res
          .status(400)
          .json({ error: `name must be a non-empty string of at most ${MAX_NAME} characters` });
      updates.name = cleanName;
    }
    if ("description" in body) {
      const cleanDescription = trimmedString(body.description, MAX_DESCRIPTION);
      if (cleanDescription === null)
        return res.status(400).json({ error: `description must be at most ${MAX_DESCRIPTION} characters` });
      updates.description = cleanDescription;
    }
    if ("trigger" in body) {
      const cleanTrigger = trimmedString(body.trigger, MAX_TRIGGER);
      if (cleanTrigger === null)
        return res.status(400).json({ error: `trigger must be at most ${MAX_TRIGGER} characters` });
      updates.trigger = cleanTrigger;
    }
    if ("status" in body) {
      if (!WORKFLOW_STATUSES.includes(body.status))
        return res.status(400).json({ error: `status must be one of: ${WORKFLOW_STATUSES.join(", ")}` });
      updates.status = body.status;
    }
    if ("graph" in body) {
      const parsed = validateGraph(body.graph);
      if ("error" in parsed) return res.status(400).json({ error: parsed.error });
      updates.graph = JSON.parse(JSON.stringify(parsed.graph));
    }

    if (Object.keys(updates).length === 0)
      return res.status(400).json({ error: "No updatable fields supplied" });

    const updated = await prisma.workflow.update({ where: { id: workflowId }, data: updates });
    return res.json(workflowDTO(updated));
  } catch (err) {
    req.log.error(err, "Failed to update workflow");
    return res.status(500).json({ error: "Internal server error" });
  }
});

workflowsRouter.delete("/:id", requireCapability("manage_pipeline"), async (req, res) => {
  try {
    const workflowId = req.params.id as string;
    const existing = await workflowInTenant(workflowId, req.tenantId!);
    if (!existing) return res.status(404).json({ error: "Workflow not found" });

    // WorkflowRun cascades on workflow_id, so the run history goes with it.
    await prisma.workflow.delete({ where: { id: workflowId } });
    return res.status(204).send();
  } catch (err) {
    req.log.error(err, "Failed to delete workflow");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// Execution
//
// Everything above this point is graph CRUD plus the manual approve/reject
// gate on an already-running run. Nothing ever actually started one: no
// endpoint or background process called prisma.workflowRun.create, so a
// saved workflow never did anything beyond exist as a diagram. This section
// is the minimal real executor -- scoped to a manual "Run" against a single
// shot, walking the graph node by node from whichever node(s) are of kind
// "trigger". It does NOT handle scheduled/event-driven triggers, parallel
// branches, or arbitrary node kinds beyond the five in the editor's palette
// -- an unrecognized node kind is logged and skipped rather than guessed at.
// ---------------------------------------------------------------------------

type GraphNode = {
  id: string;
  data?: {
    label?: string;
    kind?: string;
    config?: Record<string, unknown>;
  };
};
type GraphEdge = { id: string; source: string; target: string };

function outgoingEdges(edges: GraphEdge[], nodeId: string): GraphEdge[] {
  return edges.filter((e) => e.source === nodeId);
}

// Deliberately not a general expression evaluator (no eval/Function) -- a
// condition node's config.expression is user-authored text that ends up
// executing server-side, so this only ever recognizes `field == "value"` /
// `field != "value"` against a fixed allowlist of real Shot columns. Any
// other shape (a typo, an unsupported field, unsupported syntax) fails
// closed -- logged as a warning and treated as false, not thrown.
const CONDITION_FIELDS = ["status", "internalReviewStatus", "clientReviewStatus", "complexity"] as const;
const CONDITION_PATTERN = /^\s*([a-zA-Z]+)\s*(==|!=)\s*"([^"]*)"\s*$/;

function evaluateCondition(
  expression: string | undefined,
  shot: Record<string, unknown>,
): { result: boolean; reason: string } {
  if (!expression || !expression.trim()) return { result: true, reason: "No condition set -- treated as true." };
  const match = CONDITION_PATTERN.exec(expression);
  if (!match) {
    return {
      result: false,
      reason: `Couldn't evaluate "${expression}" -- only field == "value" / field != "value" is supported.`,
    };
  }
  const [, field, op, value] = match;
  if (!(CONDITION_FIELDS as readonly string[]).includes(field)) {
    return { result: false, reason: `"${field}" isn't a recognized field (${CONDITION_FIELDS.join(", ")}).` };
  }
  const actual = String(shot[field] ?? "");
  const result = op === "==" ? actual === value : actual !== value;
  return { result, reason: `${field} (${JSON.stringify(actual)}) ${op} ${JSON.stringify(value)} -> ${result}` };
}

interface ExecContext {
  tenantId: string;
  triggeredById: string;
  shot: { id: string; name: string; projectId: string; status: string; internalReviewStatus: string; clientReviewStatus: string; complexity: string };
  logs: RunLogEntry[];
}

function logStep(ctx: ExecContext, node: string, message: string, status: RunLogStatus) {
  ctx.logs.push({ timestamp: new Date().toISOString().slice(11, 19), node, message, status });
}

/**
 * Runs one node's real side effect. Returns false to halt traversal past
 * this node (a false condition, or a node kind that needs a human -- see
 * "Internal Review" below); true to continue to its outgoing edges.
 */
async function executeNode(ctx: ExecContext, node: GraphNode): Promise<boolean> {
  const label = node.data?.label ?? node.id;
  const kind = node.data?.kind ?? "";

  if (kind === "trigger") {
    logStep(ctx, label, `${label} fired for shot "${ctx.shot.name}".`, "info");
    return true;
  }

  if (label === "Dept Stage (2D/3D/VFX)") {
    const config = node.data?.config ?? {};
    await prisma.task.create({
      data: {
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        entityId: ctx.shot.id,
        entityType: "shot",
        title: `${label} — ${ctx.shot.name}`,
        description: typeof config.description === "string" ? config.description : "",
        status: "not-started",
        priority: "medium",
        pipelinePhase: typeof config.actionType === "string" ? config.actionType : null,
      },
    });
    logStep(ctx, label, `Created a task on "${ctx.shot.name}".`, "success");
    return true;
  }

  if (label === "Client Feedback") {
    // Reuses an existing still-valid link for this shot's most recent
    // version, same "don't mint a new code every run" reasoning as the
    // Review page's own "Share with Client" button (client-access.ts).
    const version = await prisma.version.findFirst({
      where: { tenantId: ctx.tenantId, entityType: "shot", entityId: ctx.shot.id },
      orderBy: { createdAt: "desc" },
    });
    const scopeWhere = version ? { versionId: version.id } : { projectId: ctx.shot.projectId };
    let link = await prisma.clientAccessLink.findFirst({
      where: {
        tenantId: ctx.tenantId,
        ...scopeWhere,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (!link) {
      link = await prisma.clientAccessLink.create({
        data: {
          id: crypto.randomUUID(),
          tenantId: ctx.tenantId,
          code: generateAccessCode(),
          projectId: version ? null : ctx.shot.projectId,
          versionId: version?.id ?? null,
          createdByUserId: ctx.triggeredById,
        },
      });
    }

    // Notify every real signed-in client account already granted this
    // project -- an anonymous link with no account behind it has no inbox
    // to notify, so this can only ever reach clients who can actually log
    // in and see it land.
    const grants = await prisma.clientProjectAccess.findMany({
      where: { tenantId: ctx.tenantId, projectId: ctx.shot.projectId },
      select: { userId: true },
    });
    await Promise.all(
      grants.map((g) =>
        createNotification({
          tenantId: ctx.tenantId,
          recipientUserId: g.userId,
          category: "review",
          title: `New footage ready for feedback: "${ctx.shot.name}"`,
          description: `"${ctx.shot.name}" is ready for your review -- your access code is ${link!.code} if you need it again.`,
          entityType: "shot",
          entityId: ctx.shot.id,
          actionUrl: "/client-review",
        }),
      ),
    );

    logStep(
      ctx,
      label,
      grants.length > 0
        ? `Shared "${ctx.shot.name}" with ${grants.length} client account(s) (code ${link.code}).`
        : `Minted a client access code (${link.code}) for "${ctx.shot.name}" -- no client account holds this project yet, so nobody was notified in-app.`,
      "success",
    );
    return true;
  }

  if (label === "Branch / Condition") {
    const config = node.data?.config as { expression?: string } | undefined;
    const { result, reason } = evaluateCondition(config?.expression, ctx.shot);
    logStep(ctx, label, reason, result ? "success" : "warning");
    return result;
  }

  // "Internal Review" and anything unrecognized both pause here -- Internal
  // Review because it's a human approval gate (see the existing
  // POST /:id/runs/:runId/decision endpoint below, which is the only thing
  // that ever moves a run past this node), and an unknown kind because
  // guessing what it should do server-side is worse than stopping and
  // saying so.
  if (label === "Internal Review") {
    logStep(ctx, label, `Awaiting manual approval at "${label}".`, "info");
  } else {
    logStep(ctx, label, `"${label}" has no automated action -- skipped.`, "warning");
  }
  return false;
}

/**
 * Walks the graph breadth-first from `startNodes` (every trigger node on a
 * fresh run; the outgoing edges of an approved gate when resuming one),
 * executing each reached node's real side effect in order. Stops at the
 * first node whose executeNode() returns false (a human-approval gate, a
 * false condition, or an unrecognized node) -- that node becomes the run's
 * currentNode.
 */
async function runWorkflow(
  ctx: ExecContext,
  nodes: GraphNode[],
  edges: GraphEdge[],
  startNodes?: GraphNode[],
): Promise<{ status: "completed" | "running"; currentNode: string }> {
  const triggers = startNodes ?? nodes.filter((n) => n.data?.kind === "trigger");
  if (triggers.length === 0) {
    logStep(
      ctx,
      "Workflow",
      startNodes
        ? "Nothing further to run after this gate."
        : "No Start/Trigger node in this workflow -- nothing to run.",
      startNodes ? "info" : "error",
    );
    return { status: "completed", currentNode: "Done" };
  }

  const queue = [...triggers];
  const visited = new Set<string>();
  let haltedAt: GraphNode | null = null;

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (visited.has(node.id)) continue;
    visited.add(node.id);

    const shouldContinue = await executeNode(ctx, node);
    if (!shouldContinue) {
      haltedAt = node;
      break;
    }
    for (const edge of outgoingEdges(edges, node.id)) {
      const next = nodes.find((n) => n.id === edge.target);
      if (next && !visited.has(next.id)) queue.push(next);
    }
  }

  if (haltedAt && haltedAt.data?.label === "Internal Review") {
    return { status: "running", currentNode: haltedAt.data?.label ?? haltedAt.id };
  }

  logStep(ctx, "Workflow", "WORKFLOW FINISHED.", "success");
  return { status: "completed", currentNode: "Done" };
}

// Starts a real run: creates the WorkflowRun row, then executes synchronously
// (this is the "minimal" part of "minimal real executor" -- a graph with
// many Dept Stage nodes fanning out will hold the request open for as long
// as their task-creation calls take; there's no queue/background worker
// here). requireCapability matches POST / above -- authoring a workflow and
// running it against real shot data are the same trust level.
workflowsRouter.post(
  "/:id/runs",
  requireCapability("manage_pipeline"),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const workflowId = req.params.id as string;
      const { shotId } = req.body ?? {};

      const workflow = await workflowInTenant(workflowId, tenantId);
      if (!workflow) return res.status(404).json({ error: "Workflow not found" });

      if (typeof shotId !== "string" || !shotId)
        return res.status(400).json({ error: "shotId is required" });
      const shot = await prisma.shot.findFirst({ where: { id: shotId, tenantId } });
      if (!shot) return res.status(400).json({ error: "Invalid shotId" });

      const graph = parseGraph(workflow.graph);
      const ctx: ExecContext = {
        tenantId,
        triggeredById: req.userId!,
        shot: {
          id: shot.id,
          name: shot.name,
          projectId: shot.projectId,
          status: shot.status,
          internalReviewStatus: shot.internalReviewStatus,
          clientReviewStatus: shot.clientReviewStatus,
          complexity: shot.complexity,
        },
        logs: [],
      };

      const outcome = await runWorkflow(ctx, graph.nodes as GraphNode[], graph.edges as GraphEdge[]);

      const created = await prisma.workflowRun.create({
        data: {
          id: crypto.randomUUID(),
          tenantId,
          workflowId,
          entityId: shot.id,
          triggeredById: req.userId!,
          status: outcome.status,
          currentNode: outcome.currentNode,
          completedAt: outcome.status === "completed" ? new Date() : null,
          logs: JSON.parse(JSON.stringify(ctx.logs)),
        },
        include: { triggeredBy: { select: { name: true } } },
      });

      return res.status(201).json(runDTO(created));
    } catch (err) {
      req.log.error(err, "Failed to start workflow run");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

workflowsRouter.get("/:id/runs", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const workflowId = req.params.id as string;
    if (!(await workflowInTenant(workflowId, tenantId)))
      return res.status(404).json({ error: "Workflow not found" });

    const runs = await prisma.workflowRun.findMany({
      where: { tenantId, workflowId },
      orderBy: { startedAt: "desc" },
      include: { triggeredBy: { select: { name: true } } },
    });
    return res.json(runs.map(runDTO));
  } catch (err) {
    req.log.error(err, "Failed to fetch workflow runs");
    return res.status(500).json({ error: "Internal server error" });
  }
});

workflowsRouter.get("/:id/runs/:runId", async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const workflowId = req.params.id as string;
    const runId = req.params.runId as string;

    const run = await prisma.workflowRun.findFirst({
      where: { id: runId, tenantId, workflowId },
      include: { triggeredBy: { select: { name: true } } },
    });
    if (!run) return res.status(404).json({ error: "Run not found" });
    return res.json(runDTO(run));
  } catch (err) {
    req.log.error(err, "Failed to fetch workflow run");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * The Approve / Reject gate on a run's Run page. This is the whole of the
 * decision: the run's log is appended to and its status/currentNode move,
 * server-side, so a refresh (or a second reviewer) sees the same outcome
 * rather than one browser's local state.
 */
workflowsRouter.post(
  "/:id/runs/:runId/decision",
  requireCapability("approve_reviews"),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const workflowId = req.params.id as string;
      const runId = req.params.runId as string;
      const { decision, reason } = req.body ?? {};

      if (decision !== "approve" && decision !== "reject")
        return res.status(400).json({ error: 'decision must be "approve" or "reject"' });

      const cleanReason = reason === undefined ? "" : trimmedString(reason, MAX_REJECT_REASON);
      if (cleanReason === null)
        return res.status(400).json({ error: `reason must be at most ${MAX_REJECT_REASON} characters` });

      const run = await prisma.workflowRun.findFirst({ where: { id: runId, tenantId, workflowId } });
      if (!run) return res.status(404).json({ error: "Run not found" });
      if (run.status !== "running")
        return res.status(409).json({ error: `Run is ${run.status} and no longer awaiting a decision` });

      const actor = await prisma.user.findFirst({
        where: { id: req.userId!, tenantId },
        select: { name: true },
      });
      const actorName = actor?.name ?? "Unknown User";
      const gateNode = run.currentNode || "Review Gate";
      const now = new Date();
      const timestamp = now.toISOString().slice(11, 19);
      const logs = parseLogs(run.logs);

      let finalStatus: "completed" | "running" | "failed";
      let finalCurrentNode: string;

      if (decision === "approve") {
        logs.push(
          { timestamp, node: gateNode, message: `Manual approval received from ${actorName}.`, status: "success" },
          { timestamp, node: gateNode, message: `${gateNode} completed successfully.`, status: "success" },
        );

        // Approval isn't the end of the workflow -- anything wired after this
        // gate (a Client Feedback node, another Dept Stage, another Internal
        // Review) still needs to actually run. Resume real execution from
        // the gate's outgoing edges instead of just marking the run done,
        // which previously meant nothing placed after an Internal Review
        // node in the graph ever fired.
        const workflow = await workflowInTenant(workflowId, tenantId);
        const graph = workflow ? parseGraph(workflow.graph) : { nodes: [], edges: [] };
        const nodes = graph.nodes as GraphNode[];
        const edges = graph.edges as GraphEdge[];
        const gateNodeObj = nodes.find((n) => (n.data?.label ?? n.id) === gateNode);
        const shot = run.entityId ? await prisma.shot.findFirst({ where: { id: run.entityId, tenantId } }) : null;

        if (gateNodeObj && shot) {
          const resumeFrom = outgoingEdges(edges, gateNodeObj.id)
            .map((e) => nodes.find((n) => n.id === e.target))
            .filter((n): n is GraphNode => !!n);

          const ctx: ExecContext = {
            tenantId,
            triggeredById: req.userId!,
            shot: {
              id: shot.id,
              name: shot.name,
              projectId: shot.projectId,
              status: shot.status,
              internalReviewStatus: shot.internalReviewStatus,
              clientReviewStatus: shot.clientReviewStatus,
              complexity: shot.complexity,
            },
            logs: [],
          };
          const outcome = await runWorkflow(ctx, nodes, edges, resumeFrom);
          logs.push(...ctx.logs);
          finalStatus = outcome.status;
          finalCurrentNode = outcome.currentNode;
        } else {
          // No graph/shot to resume against (workflow or shot deleted since
          // the run started) -- can't continue, but the approval itself is
          // still real and recorded above.
          logs.push({ timestamp, node: "Workflow", message: "WORKFLOW FINISHED.", status: "success" });
          finalStatus = "completed";
          finalCurrentNode = "Done";
        }
      } else {
        logs.push(
          {
            timestamp,
            node: gateNode,
            message: cleanReason
              ? `Review rejected by ${actorName}: ${cleanReason}`
              : `Review rejected by ${actorName}.`,
            status: "error",
          },
          {
            timestamp,
            node: "Workflow",
            message: `WORKFLOW HALTED — rejected at ${gateNode}.`,
            status: "error",
          },
        );
        finalStatus = "failed";
        // A rejected run stops where it stands: the gate it halted at is the
        // useful thing to keep pointing at.
        finalCurrentNode = gateNode;
      }

      const updated = await prisma.workflowRun.update({
        where: { id: runId },
        data: {
          status: finalStatus,
          currentNode: finalCurrentNode,
          completedAt: finalStatus === "completed" || finalStatus === "failed" ? now : null,
          logs: JSON.parse(JSON.stringify(logs)),
        },
        include: { triggeredBy: { select: { name: true } } },
      });

      return res.json(runDTO(updated));
    } catch (err) {
      req.log.error(err, "Failed to record workflow run decision");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);
