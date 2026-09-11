import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability, denyClientAccess } from "../middleware/rbac";
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

      if (decision === "approve") {
        logs.push(
          {
            timestamp,
            node: gateNode,
            message: `Manual approval received from ${actorName}.`,
            status: "success",
          },
          { timestamp, node: gateNode, message: `${gateNode} completed successfully.`, status: "success" },
          { timestamp, node: "Workflow", message: "WORKFLOW FINISHED.", status: "success" },
        );
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
      }

      const updated = await prisma.workflowRun.update({
        where: { id: runId },
        data: {
          status: decision === "approve" ? "completed" : "failed",
          // A rejected run stops where it stands: the gate it halted at is the
          // useful thing to keep pointing at.
          currentNode: decision === "approve" ? "Done" : gateNode,
          completedAt: now,
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
