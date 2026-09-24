import { prisma } from "@workspace/db";
import * as crypto from "crypto";

/**
 * On-box error collection.
 *
 * Everything here is best-effort and swallows its own failures. An error
 * reporter that can itself throw turns one broken request into two, and a
 * reporter that blocks the response turns a logged error into a slow page.
 * Nothing in this file is ever allowed to affect the request it describes.
 */

/** Longest stack we keep. Enough to find the fault, short of storing novels. */
const MAX_STACK = 8000;
const MAX_MESSAGE = 2000;

/** How long a captured error is kept before the sweep removes it. */
export const ERROR_RETENTION_DAYS = 30;

/**
 * Secrets and personal data must not end up in an error record that a wide
 * audience can read, and stack traces and request contexts are exactly where
 * they leak from. Keys matching these are replaced rather than stored.
 */
const REDACT_KEYS =
  /pass(word)?|secret|token|authorization|cookie|session|api[-_]?key|hashed/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value))
    return value.slice(0, 20).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1);
  }
  return out;
}

function clamp(s: string | undefined | null, max: number): string | null {
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max)}\n… truncated` : s;
}

/**
 * The tenant an unattributed report belongs to, when that is unambiguous.
 *
 * A crash before sign-in has no session, so nothing identifies whose studio
 * it came from -- and those are the reports most worth keeping, since they
 * are the ones that break the app for someone who cannot then tell you.
 * Storing them with a null tenant and showing null-tenant rows to every
 * tenant's administrators would leak one studio's stack traces to another's,
 * and hand anyone who can reach the endpoint a way to inject text into every
 * diagnostics screen at once.
 *
 * A self-hosted deployment has exactly one tenant, which is the same
 * assumption `/auth/register` already makes for unauthenticated sign-ups.
 * Where that holds the report is attributed and visible; where it does not,
 * it stays unattributed and appears in nobody's list. That is the safe
 * direction: a multi-tenant deployment loses a little visibility rather than
 * leaking between studios.
 */
let soleTenantCache: { id: string | null; at: number } | null = null;
const SOLE_TENANT_TTL_MS = 60_000;

export async function resolveSoleTenantId(): Promise<string | null> {
  if (soleTenantCache && Date.now() - soleTenantCache.at < SOLE_TENANT_TTL_MS) {
    return soleTenantCache.id;
  }
  try {
    const slug = process.env.REGISTRATION_TENANT_SLUG;
    const tenants = slug
      ? await prisma.tenant.findMany({
          where: { slug, deletedAt: null },
          select: { id: true },
          take: 2,
        })
      : await prisma.tenant.findMany({
          where: { deletedAt: null },
          select: { id: true },
          take: 2,
        });
    const id = tenants.length === 1 ? tenants[0].id : null;
    soleTenantCache = { id, at: Date.now() };
    return id;
  } catch {
    return null;
  }
}

export interface CapturedError {
  source: "api" | "web";
  kind: string;
  message: string;
  stack?: string | null;
  path?: string | null;
  method?: string | null;
  statusCode?: number | null;
  tenantId?: string | null;
  userId?: string | null;
  userAgent?: string | null;
  release?: string | null;
  context?: Record<string, unknown>;
}

export async function captureError(e: CapturedError): Promise<void> {
  try {
    await prisma.errorEvent.create({
      data: {
        id: crypto.randomUUID(),
        source: e.source,
        kind: (e.kind || "Error").slice(0, 200),
        message: clamp(e.message, MAX_MESSAGE) ?? "(no message)",
        stack: clamp(e.stack, MAX_STACK),
        path: e.path?.slice(0, 500) ?? null,
        method: e.method?.slice(0, 10) ?? null,
        statusCode: e.statusCode ?? null,
        tenantId: e.tenantId ?? null,
        userId: e.userId ?? null,
        userAgent: e.userAgent?.slice(0, 500) ?? null,
        release: e.release ?? process.env.RELEASE ?? null,
        context: (redact(e.context ?? {}) ?? {}) as object,
      },
    });
  } catch {
    // If the sink itself is down -- the database being the likeliest reason
    // an error is being reported in the first place -- there is nowhere left
    // to record that fact. Staying quiet is the only safe option; the pino
    // log line for the original error has already been written.
  }
}

/**
 * Deletes captured errors past the retention window.
 *
 * Called opportunistically from the read path rather than on a schedule, for
 * the same reason the attendance sweep is: it needs no cron to own and no
 * leader election across the three API replicas, and the only consumer that
 * cares about the size of this table is the one about to read it.
 */
export async function sweepOldErrors(): Promise<void> {
  try {
    await prisma.errorEvent.deleteMany({
      where: {
        createdAt: {
          lt: new Date(Date.now() - ERROR_RETENTION_DAYS * 86_400_000),
        },
      },
    });
  } catch {
    // Retention is housekeeping; failing it must not fail the read.
  }
}
