import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

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

app.use("/api", router);

Sentry.setupExpressErrorHandler(app);

export default app;
