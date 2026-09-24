import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Exactly one hop: nginx (artifacts/forge/nginx.conf) sets X-Forwarded-For.
// Without this every request looks like it came from the nginx container, so
// per-IP rate limiting would share one bucket across the whole studio and a
// single attacker would lock everyone out. `1` rather than `true` so a
// client can't prepend its own X-Forwarded-For entries and be believed.
app.set("trust proxy", 1);
// Framework fingerprinting aid; nothing depends on it.
app.disable("x-powered-by");

// Names which replica served a request. With the API scaled behind nginx
// there is otherwise no way to tell whether requests are actually spreading
// across instances or all landing on one, and no way to attribute a fault to
// a particular container. The value is the container's own hostname, which
// Docker sets to the short container id -- no configuration to keep in sync.
const INSTANCE_ID = process.env.HOSTNAME || "unknown";
app.use((_req, res, next) => {
  res.setHeader("X-Forge-Instance", INSTANCE_ID);
  next();
});

app.use(cookieParser());
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : ["http://localhost:5173", "https://shotgun-mock-forge.vercel.app"];

// The `cors` package treats an origin array containing "*" as a literal
// string to match, not a wildcard -- so CORS_ORIGIN="*" (the docker-compose
// default) was silently rejecting every cross-origin request. Reflecting
// any origin back is NOT a safe fix for that on its own: paired with
// credentials:true it would let any site make authenticated requests using
// a visitor's cookies, same as `Access-Control-Allow-Origin: *` +
// credentials is (rightly) rejected by browsers. So an explicit
// CORS_ORIGIN allowlist gets real wildcard-with-credentials behavior, but
// the "*" default gets a real wildcard WITHOUT credentials -- safe for
// unauthenticated cross-origin use, and irrelevant to this deployment's
// same-origin nginx proxy either way, which never relies on this default.
const allowAllOrigins = allowedOrigins.includes("*");

app.use(
  cors({
    origin: allowAllOrigins ? "*" : allowedOrigins,
    credentials: !allowAllOrigins,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

import * as Sentry from "@sentry/node";
import { captureError, resolveSoleTenantId } from "./lib/errorSink";

app.use("/api", router);

Sentry.setupExpressErrorHandler(app);

// Records anything that reaches Express's error handler. Sentry stays wired
// above for the day a DSN exists, but this deployment is air-gapped: without
// an outbound route to sentry.io that handler collects nothing, which is how
// a server ends up looking instrumented while reporting into the void. This
// writes to the studio's own database instead, so the errors are visible on
// the box where they happened.
//
// Four parameters, including the unused `next`: Express identifies an error
// handler by arity, and dropping it silently demotes this to ordinary
// middleware that never runs on failure.
app.use(
  (
    err: Error & { status?: number; statusCode?: number },
    req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    next: express.NextFunction,
  ) => {
    const status = err.status ?? err.statusCode ?? 500;
    // An unauthenticated request has no tenant on it -- malformed JSON sent
    // at the login route is the ordinary case -- and reads are scoped
    // strictly per tenant, so recording it unattributed would file it where
    // nobody can see it.
    const resolveTenant = req.tenantId
      ? Promise.resolve(req.tenantId)
      : resolveSoleTenantId();
    void resolveTenant
      .then((tenantId) =>
        captureError({
          source: "api",
          kind: err.name || "Error",
          message: err.message || String(err),
          stack: err.stack,
          path: req.originalUrl?.split("?")[0],
          method: req.method,
          statusCode: status,
          tenantId,
          userId: req.userId ?? null,
          context: { requestId: (req as { id?: unknown }).id },
        }),
      )
      .catch((resolveErr) => {
        req.log?.error({ resolveErr }, "Failed to capture unhandled error");
      });
    req.log?.error({ err }, "unhandled error");
    if (res.headersSent) return;
    res.status(status).json({ error: "Internal server error" });
  },
);

// A crash in a promise nobody awaited never reaches Express, so it would
// otherwise leave no trace beyond the process log -- and on a server nobody
// watches, that is no trace at all.
process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  // No request, so no session to attribute from. Resolved to the
  // deployment's tenant where that is unambiguous; reads are scoped strictly
  // per tenant, so without this a background crash would be recorded and then
  // visible to nobody.
  void resolveSoleTenantId()
    .then((tenantId) =>
      captureError({
        source: "api",
        kind: `UnhandledRejection: ${err.name}`,
        message: err.message,
        stack: err.stack,
        tenantId,
      }),
    )
    .catch((resolveErr) => {
      console.error("Failed to capture unhandled rejection:", resolveErr);
      console.error("Original rejection:", err);
    });
});

export default app;
