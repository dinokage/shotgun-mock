/**
 * Sends a browser error to the studio's own collector.
 *
 * The deployment is air-gapped, so a hosted error service would never receive
 * anything. POST /api/errors writes to the same Postgres the app runs on, and
 * is readable from the Diagnostics screen.
 *
 * Uses `fetch` directly rather than the app's apiClient: the client throws on
 * a non-2xx, and a reporter that throws while reporting an error produces a
 * second error, which reports, which throws. This is the one place in the app
 * that must never raise.
 */

/** Errors already sent, so a render loop that throws every frame sends once. */
const seen = new Set<string>();
const MAX_DISTINCT = 50;

export interface ReportableError {
  kind?: string;
  message: string;
  stack?: string | null;
  context?: Record<string, unknown>;
}

export function reportError(e: ReportableError): void {
  try {
    // A throwing render can fire the same error hundreds of times a second.
    // Dedupe on the signature so the collector records the fault once rather
    // than burying every other error in the studio underneath it.
    const signature = `${e.kind ?? "Error"}:${e.message}:${(e.stack ?? "").slice(0, 200)}`;
    if (seen.has(signature)) return;
    if (seen.size >= MAX_DISTINCT) return;
    seen.add(signature);

    const body = JSON.stringify({
      kind: e.kind ?? "Error",
      message: e.message,
      stack: e.stack ?? null,
      path: window.location.pathname,
      release: import.meta.env.VITE_RELEASE ?? null,
      context: e.context ?? {},
    });

    // keepalive so a report raised during navigation or unload still leaves
    // the tab -- the errors that kill a page are exactly the ones that would
    // otherwise be cancelled on the way out.
    void fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      keepalive: true,
      body,
    }).catch(() => {
      // The collector being unreachable is not worth a second error.
    });
  } catch {
    // Never let reporting break the page it is reporting on.
  }
}

/**
 * Catches what React's error boundary cannot: errors thrown outside the
 * render tree, and rejected promises nobody handled. Without these, an async
 * failure in an event handler leaves nothing behind but a console line on a
 * machine nobody is looking at.
 */
export function installGlobalErrorReporting(): void {
  window.addEventListener("error", (event) => {
    reportError({
      kind: event.error?.name ?? "WindowError",
      message: event.message || String(event.error),
      stack: event.error?.stack ?? null,
      context: {
        source: event.filename,
        line: event.lineno,
        column: event.colno,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    reportError({
      kind:
        reason instanceof Error
          ? `UnhandledRejection: ${reason.name}`
          : "UnhandledRejection",
      message:
        reason instanceof Error ? reason.message : String(reason ?? "unknown"),
      stack: reason instanceof Error ? reason.stack : null,
    });
  });
}
