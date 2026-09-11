import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability, denyClientAccess } from "../middleware/rbac";
import { hashPassword } from "../lib/auth";
import * as crypto from "crypto";

export const studioSettingsRouter = Router();
export const apiKeysRouter = Router();
export const webhooksRouter = Router();
export const licenseServersRouter = Router();
export const integrationsRouter = Router();

// Studio administration is internal-only; none of it has a client-access use
// case, and API keys / webhook secrets least of all.
for (const router of [
  studioSettingsRouter,
  apiKeysRouter,
  webhooksRouter,
  licenseServersRouter,
  integrationsRouter,
]) {
  router.use(tenantAuthMiddleware);
  router.use(denyClientAccess);
}

/* -------------------------------------------------------------------------- */
/* Studio settings (generic tenant-scoped key/value)                           */
/* -------------------------------------------------------------------------- */

// Doubles as the allowlist of writable keys: an unknown key is a 404, so a
// caller can't use this endpoint as arbitrary tenant-scoped storage. Each key
// is gated on the same capability that gates its Settings tab in the UI.
const SETTING_WRITE_CAPABILITY: Record<string, string> = {
  studio_profile: "manage_roles",
  security_policy: "manage_roles",
  pipeline_stages: "manage_pipeline",
  pipeline_paths: "manage_integrations",
};

// The security policy names the studio's SSO domain and IP allowlist, so it is
// admin-read as well as admin-write. The rest are read by every internal user
// (the studio name in a header, the DCC path config on the integrations page).
const SETTING_READ_CAPABILITY: Record<string, string> = {
  security_policy: "manage_roles",
};

function settingCapabilityGate(capabilities: Record<string, string>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.params.key as string;
    if (!(key in SETTING_WRITE_CAPABILITY)) {
      res.status(404).json({ error: "Unknown setting key" });
      return;
    }
    const capability = capabilities[key];
    if (!capability) {
      next();
      return;
    }
    return requireCapability(capability)(req, res, next);
  };
}

studioSettingsRouter.get("/:key", settingCapabilityGate(SETTING_READ_CAPABILITY), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const key = req.params.key as string;
    const row = await prisma.studioSetting.findFirst({
      where: { tenantId, key },
      select: { key: true, value: true, updatedAt: true, updatedById: true },
    });

    // A key nobody has saved yet returns an explicit null rather than a
    // fabricated default -- the client renders an empty form, not invented
    // studio details.
    if (!row) return res.json({ key, value: null, updatedAt: null, updatedById: null });
    return res.json({
      key: row.key,
      value: row.value,
      updatedAt: row.updatedAt.toISOString(),
      updatedById: row.updatedById,
    });
  } catch (err) {
    req.log.error(err, "Failed to fetch studio setting");
    return res.status(500).json({ error: "Internal server error" });
  }
});

studioSettingsRouter.put("/:key", settingCapabilityGate(SETTING_WRITE_CAPABILITY), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const key = req.params.key as string;
    const { value } = req.body ?? {};

    if (!value || typeof value !== "object" || Array.isArray(value))
      return res.status(400).json({ error: "value must be an object" });

    const serialised = JSON.parse(JSON.stringify(value));
    const existing = await prisma.studioSetting.findFirst({
      where: { tenantId, key },
      select: { id: true },
    });

    const row = existing
      ? await prisma.studioSetting.update({
          where: { id: existing.id },
          data: { value: serialised, updatedById: req.userId ?? null },
          select: { key: true, value: true, updatedAt: true, updatedById: true },
        })
      : await prisma.studioSetting.create({
          data: {
            id: crypto.randomUUID(),
            tenantId,
            key,
            value: serialised,
            updatedById: req.userId ?? null,
          },
          select: { key: true, value: true, updatedAt: true, updatedById: true },
        });

    return res.json({
      key: row.key,
      value: row.value,
      updatedAt: row.updatedAt.toISOString(),
      updatedById: row.updatedById,
    });
  } catch (err) {
    req.log.error(err, "Failed to save studio setting");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/* -------------------------------------------------------------------------- */
/* API keys                                                                    */
/* -------------------------------------------------------------------------- */

// tokenHash is deliberately absent from every select in this file: there is no
// code path, anywhere, that can return a stored token to a client. The raw
// token exists only inside the POST handler below.
const API_KEY_SELECT = {
  id: true,
  name: true,
  tokenPrefix: true,
  createdById: true,
  createdAt: true,
  lastUsedAt: true,
  revokedAt: true,
  createdBy: { select: { id: true, name: true } },
} as const;

type ApiKeyRow = {
  id: string;
  name: string;
  tokenPrefix: string;
  createdById: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdBy: { id: string; name: string } | null;
};

function apiKeyDTO(row: ApiKeyRow) {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    createdById: row.createdById,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
}

apiKeysRouter.get("/", requireCapability("manage_integrations"), async (req, res) => {
  try {
    const rows = await prisma.apiKey.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: "desc" },
      select: API_KEY_SELECT,
    });
    return res.json(rows.map(apiKeyDTO));
  } catch (err) {
    req.log.error(err, "Failed to fetch API keys");
    return res.status(500).json({ error: "Internal server error" });
  }
});

apiKeysRouter.post("/", requireCapability("manage_integrations"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { name } = req.body ?? {};
    if (typeof name !== "string" || !name.trim())
      return res.status(400).json({ error: "name is required" });

    // 256 bits of CSPRNG entropy, argon2-hashed with the same helper that
    // hashes passwords. Only the hash and a non-secret prefix are stored, so
    // this response is the one and only time the token is knowable -- a stolen
    // database does not yield working keys, and neither does any later read.
    const rawToken = `forge_${crypto.randomBytes(32).toString("base64url")}`;
    const created = await prisma.apiKey.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        name: name.trim(),
        tokenHash: await hashPassword(rawToken),
        tokenPrefix: rawToken.slice(0, 14),
        createdById: req.userId ?? null,
      },
      select: API_KEY_SELECT,
    });

    return res.status(201).json({ ...apiKeyDTO(created), token: rawToken });
  } catch (err) {
    req.log.error(err, "Failed to create API key");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Soft revoke: the row survives so the studio keeps a record of what existed
// and who created it, but revokedAt makes the token unusable from now on.
apiKeysRouter.delete("/:id", requireCapability("manage_integrations"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const keyId = req.params.id as string;
    const existing = await prisma.apiKey.findFirst({
      where: { tenantId, id: keyId },
      select: { id: true, revokedAt: true },
    });
    if (!existing) return res.status(404).json({ error: "API key not found" });
    if (!existing.revokedAt)
      await prisma.apiKey.updateMany({
        where: { tenantId, id: keyId },
        data: { revokedAt: new Date() },
      });
    return res.status(204).send();
  } catch (err) {
    req.log.error(err, "Failed to revoke API key");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/* -------------------------------------------------------------------------- */
/* Webhooks                                                                    */
/* -------------------------------------------------------------------------- */

const WEBHOOK_EVENTS = [
  "task.status.changed",
  "version.published",
  "review.requested",
  "review.approved",
] as const;

// `secret` is absent here for the same reason tokenHash is absent above: the
// signing secret is returned by the create handler and never again.
const WEBHOOK_SELECT = {
  id: true,
  url: true,
  events: true,
  isActive: true,
  createdById: true,
  createdAt: true,
  lastFiredAt: true,
} as const;

type WebhookRow = {
  id: string;
  url: string;
  events: unknown;
  isActive: boolean;
  createdById: string | null;
  createdAt: Date;
  lastFiredAt: Date | null;
};

function webhookDTO(row: WebhookRow) {
  return {
    id: row.id,
    url: row.url,
    events: Array.isArray(row.events) ? row.events.filter((e): e is string => typeof e === "string") : [],
    isActive: row.isActive,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    lastFiredAt: row.lastFiredAt ? row.lastFiredAt.toISOString() : null,
  };
}

function validateWebhookUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url.trim()) return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  return parsed.toString();
}

webhooksRouter.get("/", requireCapability("manage_integrations"), async (req, res) => {
  try {
    const rows = await prisma.webhook.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: "desc" },
      select: WEBHOOK_SELECT,
    });
    return res.json(rows.map(webhookDTO));
  } catch (err) {
    req.log.error(err, "Failed to fetch webhooks");
    return res.status(500).json({ error: "Internal server error" });
  }
});

webhooksRouter.post("/", requireCapability("manage_integrations"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { url, events } = req.body ?? {};

    const normalisedUrl = validateWebhookUrl(url);
    if (!normalisedUrl) return res.status(400).json({ error: "url must be a valid http(s) URL" });

    if (!Array.isArray(events) || events.length === 0)
      return res.status(400).json({ error: "events must be a non-empty array" });
    const unknown = events.filter((e) => !WEBHOOK_EVENTS.includes(e));
    if (unknown.length > 0)
      return res.status(400).json({ error: `Unsupported events: ${unknown.join(", ")}` });

    // The receiver needs this to verify HMAC signatures on delivery, so it is
    // returned exactly once here and never selected again.
    const secret = crypto.randomBytes(32).toString("hex");
    const created = await prisma.webhook.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        url: normalisedUrl,
        events: JSON.parse(JSON.stringify(events)),
        secret,
        createdById: req.userId ?? null,
      },
      select: WEBHOOK_SELECT,
    });

    return res.status(201).json({ ...webhookDTO(created), secret });
  } catch (err) {
    req.log.error(err, "Failed to create webhook");
    return res.status(500).json({ error: "Internal server error" });
  }
});

webhooksRouter.delete("/:id", requireCapability("manage_integrations"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const webhookId = req.params.id as string;
    const existing = await prisma.webhook.findFirst({
      where: { tenantId, id: webhookId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "Webhook not found" });
    await prisma.webhook.deleteMany({ where: { tenantId, id: webhookId } });
    return res.status(204).send();
  } catch (err) {
    req.log.error(err, "Failed to delete webhook");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/* -------------------------------------------------------------------------- */
/* License servers                                                             */
/* -------------------------------------------------------------------------- */

type LicenseServerRow = {
  id: string;
  name: string;
  vendor: string;
  host: string;
  port: number | null;
  seatsTotal: number;
  seatsInUse: number;
  status: string;
  updatedAt: Date;
};

function licenseServerDTO(row: LicenseServerRow) {
  return {
    id: row.id,
    name: row.name,
    vendor: row.vendor,
    host: row.host,
    port: row.port,
    seatsTotal: row.seatsTotal,
    seatsInUse: row.seatsInUse,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
  };
}

licenseServersRouter.get("/", requireCapability("manage_licenses"), async (req, res) => {
  try {
    const rows = await prisma.licenseServer.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { name: "asc" },
    });
    return res.json(rows.map(licenseServerDTO));
  } catch (err) {
    req.log.error(err, "Failed to fetch license servers");
    return res.status(500).json({ error: "Internal server error" });
  }
});

licenseServersRouter.post("/", requireCapability("manage_licenses"), async (req, res) => {
  try {
    const { name, vendor, host, port, seatsTotal } = req.body ?? {};
    if (typeof name !== "string" || !name.trim())
      return res.status(400).json({ error: "name is required" });
    if (seatsTotal !== undefined && (!Number.isInteger(seatsTotal) || seatsTotal < 0))
      return res.status(400).json({ error: "seatsTotal must be a non-negative integer" });
    if (port !== undefined && port !== null && (!Number.isInteger(port) || port < 1 || port > 65535))
      return res.status(400).json({ error: "port must be between 1 and 65535" });

    const created = await prisma.licenseServer.create({
      data: {
        id: crypto.randomUUID(),
        tenantId: req.tenantId!,
        name: name.trim(),
        vendor: typeof vendor === "string" ? vendor.trim() : "",
        host: typeof host === "string" ? host.trim() : "",
        port: typeof port === "number" ? port : null,
        seatsTotal: typeof seatsTotal === "number" ? seatsTotal : 0,
      },
    });
    return res.status(201).json(licenseServerDTO(created));
  } catch (err) {
    req.log.error(err, "Failed to create license server");
    return res.status(500).json({ error: "Internal server error" });
  }
});

licenseServersRouter.put("/:id", requireCapability("manage_licenses"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const serverId = req.params.id as string;
    const { name, vendor, host, port, seatsTotal, seatsInUse, status } = req.body ?? {};

    const updates: Record<string, unknown> = {};
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim())
        return res.status(400).json({ error: "name must be a non-empty string" });
      updates.name = name.trim();
    }
    if (vendor !== undefined) {
      if (typeof vendor !== "string") return res.status(400).json({ error: "vendor must be a string" });
      updates.vendor = vendor.trim();
    }
    if (host !== undefined) {
      if (typeof host !== "string") return res.status(400).json({ error: "host must be a string" });
      updates.host = host.trim();
    }
    if (port !== undefined) {
      if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535))
        return res.status(400).json({ error: "port must be between 1 and 65535" });
      updates.port = port;
    }
    for (const [field, value] of [
      ["seatsTotal", seatsTotal],
      ["seatsInUse", seatsInUse],
    ] as const) {
      if (value === undefined) continue;
      if (!Number.isInteger(value) || (value as number) < 0)
        return res.status(400).json({ error: `${field} must be a non-negative integer` });
      updates[field] = value;
    }
    if (status !== undefined) {
      if (typeof status !== "string") return res.status(400).json({ error: "status must be a string" });
      updates.status = status;
    }

    const existing = await prisma.licenseServer.findFirst({
      where: { tenantId, id: serverId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "License server not found" });

    await prisma.licenseServer.updateMany({ where: { tenantId, id: serverId }, data: updates });
    const updated = await prisma.licenseServer.findFirstOrThrow({ where: { tenantId, id: serverId } });
    return res.json(licenseServerDTO(updated));
  } catch (err) {
    req.log.error(err, "Failed to update license server");
    return res.status(500).json({ error: "Internal server error" });
  }
});

licenseServersRouter.delete("/:id", requireCapability("manage_licenses"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const serverId = req.params.id as string;
    const existing = await prisma.licenseServer.findFirst({
      where: { tenantId, id: serverId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "License server not found" });
    await prisma.licenseServer.deleteMany({ where: { tenantId, id: serverId } });
    return res.status(204).send();
  } catch (err) {
    req.log.error(err, "Failed to delete license server");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/* -------------------------------------------------------------------------- */
/* DCC integrations                                                            */
/* -------------------------------------------------------------------------- */

const INTEGRATION_STATUSES = ["connected", "warning", "disconnected"] as const;
const PROVIDER_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

type IntegrationRow = {
  id: string;
  provider: string;
  displayName: string;
  status: string;
  config: unknown;
  autoSync: boolean;
  lastSyncAt: Date | null;
  connectedById: string | null;
  createdAt: Date;
};

function integrationDTO(row: IntegrationRow) {
  return {
    id: row.id,
    provider: row.provider,
    displayName: row.displayName,
    status: row.status,
    config: row.config && typeof row.config === "object" && !Array.isArray(row.config) ? row.config : {},
    autoSync: row.autoSync,
    lastSyncAt: row.lastSyncAt ? row.lastSyncAt.toISOString() : null,
    connectedById: row.connectedById,
    createdAt: row.createdAt.toISOString(),
  };
}

// Readable by any internal user: the integrations page shows every DCC card to
// everyone and only gates the connect/sync controls on manage_integrations.
integrationsRouter.get("/", async (req, res) => {
  try {
    const rows = await prisma.integration.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { provider: "asc" },
    });
    return res.json(rows.map(integrationDTO));
  } catch (err) {
    req.log.error(err, "Failed to fetch integrations");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Upsert keyed on (tenantId, provider): a DCC the studio has never touched has
// no row at all and reads as disconnected, and the first connect creates it.
integrationsRouter.put("/:provider", requireCapability("manage_integrations"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const provider = req.params.provider as string;
    if (!PROVIDER_PATTERN.test(provider))
      return res.status(400).json({ error: "provider must be a lowercase slug" });

    const { displayName, status, autoSync, config } = req.body ?? {};
    if (typeof displayName !== "string" || !displayName.trim())
      return res.status(400).json({ error: "displayName is required" });
    if (status !== undefined && !INTEGRATION_STATUSES.includes(status))
      return res
        .status(400)
        .json({ error: `status must be one of: ${INTEGRATION_STATUSES.join(", ")}` });
    if (autoSync !== undefined && typeof autoSync !== "boolean")
      return res.status(400).json({ error: "autoSync must be a boolean" });
    if (config !== undefined && (!config || typeof config !== "object" || Array.isArray(config)))
      return res.status(400).json({ error: "config must be an object" });

    const updates = {
      displayName: displayName.trim(),
      ...(status !== undefined ? { status: status as string } : {}),
      ...(autoSync !== undefined ? { autoSync: autoSync as boolean } : {}),
      ...(config !== undefined ? { config: JSON.parse(JSON.stringify(config)) } : {}),
    };

    const existing = await prisma.integration.findFirst({
      where: { tenantId, provider },
      select: { id: true },
    });

    const row = existing
      ? await prisma.integration.update({ where: { id: existing.id }, data: updates })
      : await prisma.integration.create({
          data: {
            id: crypto.randomUUID(),
            tenantId,
            provider,
            connectedById: status === "connected" ? (req.userId ?? null) : null,
            ...updates,
          },
        });

    return res.json(integrationDTO(row));
  } catch (err) {
    req.log.error(err, "Failed to save integration");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Records a real sync attempt. It only ever moves a disconnected/absent
// integration to "connected" -- a "warning" (plugin update required) survives a
// data sync, because pulling data does not update the installed plugin.
integrationsRouter.post(
  "/:provider/sync",
  requireCapability("manage_integrations"),
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const provider = req.params.provider as string;
      if (!PROVIDER_PATTERN.test(provider))
        return res.status(400).json({ error: "provider must be a lowercase slug" });

      const { displayName } = req.body ?? {};
      if (typeof displayName !== "string" || !displayName.trim())
        return res.status(400).json({ error: "displayName is required" });

      const existing = await prisma.integration.findFirst({
        where: { tenantId, provider },
        select: { id: true, status: true, connectedById: true },
      });

      const now = new Date();
      const row = existing
        ? await prisma.integration.update({
            where: { id: existing.id },
            data: {
              displayName: displayName.trim(),
              status: existing.status === "disconnected" ? "connected" : existing.status,
              lastSyncAt: now,
              connectedById: existing.connectedById ?? req.userId ?? null,
            },
          })
        : await prisma.integration.create({
            data: {
              id: crypto.randomUUID(),
              tenantId,
              provider,
              displayName: displayName.trim(),
              status: "connected",
              lastSyncAt: now,
              connectedById: req.userId ?? null,
            },
          });

      return res.json(integrationDTO(row));
    } catch (err) {
      req.log.error(err, "Failed to sync integration");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);
