import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability, denyClientAccess } from "../middleware/rbac";
import * as crypto from "crypto";

export const pluginsRouter = Router();

pluginsRouter.use(tenantAuthMiddleware);
// What the studio has bolted onto its own pipeline is internal configuration;
// a client-access session has no legitimate use for it.
pluginsRouter.use(denyClientAccess);

// The marketplace catalogue itself is static product data shipped with the
// client; only a studio's install/enable state lives here. Ids are therefore
// opaque slugs -- constrained so this endpoint can't be used as arbitrary
// tenant-scoped storage, the same guard studio-settings.ts puts on providers.
const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

type TenantPluginRow = {
  pluginId: string;
  installed: boolean;
  enabled: boolean;
  installedById: string | null;
  installedAt: Date;
  updatedAt: Date;
};

function tenantPluginDTO(row: TenantPluginRow) {
  return {
    pluginId: row.pluginId,
    installed: row.installed,
    enabled: row.enabled,
    installedById: row.installedById,
    installedAt: row.installedAt,
    updatedAt: row.updatedAt,
  };
}

// Only plugins the studio has actually installed have a row. A catalogue entry
// with no row is genuinely uninstalled -- callers must not invent a state for it.
pluginsRouter.get("/", async (req, res) => {
  try {
    const rows = await prisma.tenantPlugin.findMany({
      where: { tenantId: req.tenantId!, installed: true },
      orderBy: { pluginId: "asc" },
    });
    return res.json(rows.map(tenantPluginDTO));
  } catch (err) {
    req.log.error(err, "Failed to fetch installed plugins");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Re-installing something already installed is a no-op rather than a 409: two
// producers clicking Install concurrently should both end up looking at the
// same installed plugin.
pluginsRouter.post("/:pluginId", requireCapability("manage_integrations"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    // Cast needed: combining requireCapability() (typed against the generic,
    // path-agnostic Express Request) with this route's path typing makes TS
    // widen req.params.pluginId to `string | string[]`.
    const pluginId = req.params.pluginId as string;
    if (!PLUGIN_ID_PATTERN.test(pluginId))
      return res.status(400).json({ error: "pluginId must be a lowercase slug" });

    const row = await prisma.tenantPlugin.upsert({
      where: { tenantId_pluginId: { tenantId, pluginId } },
      create: {
        id: crypto.randomUUID(),
        tenantId,
        pluginId,
        installed: true,
        enabled: true,
        installedById: req.userId!,
      },
      update: { installed: true, enabled: true, installedById: req.userId! },
    });

    return res.status(201).json(tenantPluginDTO(row));
  } catch (err) {
    req.log.error(err, "Failed to install plugin");
    return res.status(500).json({ error: "Internal server error" });
  }
});

pluginsRouter.patch("/:pluginId", requireCapability("manage_integrations"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const pluginId = req.params.pluginId as string;
    const { enabled } = req.body ?? {};

    if (typeof enabled !== "boolean")
      return res.status(400).json({ error: "enabled must be a boolean" });

    const existing = await prisma.tenantPlugin.findFirst({
      where: { tenantId, pluginId, installed: true },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "Plugin is not installed" });

    const row = await prisma.tenantPlugin.update({ where: { id: existing.id }, data: { enabled } });
    return res.json(tenantPluginDTO(row));
  } catch (err) {
    req.log.error(err, "Failed to update plugin");
    return res.status(500).json({ error: "Internal server error" });
  }
});

pluginsRouter.delete("/:pluginId", requireCapability("manage_integrations"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const pluginId = req.params.pluginId as string;

    const existing = await prisma.tenantPlugin.findFirst({
      where: { tenantId, pluginId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "Plugin is not installed" });

    // Removing the row is what "uninstalled" means here -- an absent row and a
    // never-installed plugin have to read identically, or a reinstall would
    // silently inherit the old enabled flag.
    await prisma.tenantPlugin.delete({ where: { id: existing.id } });
    return res.status(204).send();
  } catch (err) {
    req.log.error(err, "Failed to uninstall plugin");
    return res.status(500).json({ error: "Internal server error" });
  }
});
