import { Router } from "express";
import { prisma } from "@workspace/db";
import { tenantAuthMiddleware } from "../middleware/tenant";
import { requireCapability, denyClientAccess } from "../middleware/rbac";
import * as crypto from "crypto";

export const schemaBuilderRouter = Router();

// The studio's own data model is internal configuration; a client-access
// session has no use for it, and no business reshaping it.
schemaBuilderRouter.use(tenantAuthMiddleware);
schemaBuilderRouter.use(denyClientAccess);

// Designing entity types and task templates is studio-wide system
// configuration, the same tier as API keys / webhooks / DCC paths — so it
// rides the capability those already use. It is held by exactly the three
// roles the frontend lets onto /schema-builder (admin, producer,
// production_head) and by no lead or artist.
const requireSchemaAdmin = requireCapability("manage_integrations");

const FIELD_TYPES = [
  "text",
  "number",
  "date",
  "boolean",
  "single_select",
  "multi_select",
  "computed",
] as const;

const PRIORITIES = ["low", "medium", "high", "critical"] as const;

// Mirrors RESERVED_KEYS in artifacts/forge/src/store/schema.ts: the
// computed-expression grammar resolves 'true'/'false' as literals before it
// ever consults the field scope, so a field keyed on one of them can never be
// read by an expression. Enforced here too, because a client that skips the
// builder UI must not be able to write a key that breaks evaluation.
const RESERVED_KEYS = ["true", "false"];

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function normalizeKey(raw: string): string {
  const base = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!base) return "";
  // A leading digit is not a valid identifier in the expression grammar.
  return /^[0-9]/.test(base) ? `f_${base}` : base;
}

function slugifyKey(label: string, taken: string[]): string {
  const base = normalizeKey(label) || "field";
  let key = base;
  let suffix = 2;
  while (taken.includes(key) || RESERVED_KEYS.includes(key)) key = `${base}_${suffix++}`;
  return key;
}

// EntityTypeDef is @@unique([tenantId, name]), and both "new entity type" and
// "duplicate" produce a name the caller did not choose -- suffix it rather
// than failing a click the user cannot meaningfully retry.
function uniqueName(desired: string, taken: Set<string>): string {
  if (!taken.has(desired)) return desired;
  let n = 2;
  while (taken.has(`${desired} ${n}`)) n++;
  return `${desired} ${n}`;
}

type FieldRow = {
  id: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  description: string;
  options: unknown;
  defaultValue: string | null;
  expression: string | null;
  sortOrder: number;
};

function serializeField(field: FieldRow) {
  return {
    id: field.id,
    key: field.key,
    label: field.label,
    type: field.type,
    required: field.required,
    description: field.description,
    options: asStringArray(field.options),
    defaultValue: field.defaultValue,
    expression: field.expression,
    sortOrder: field.sortOrder,
  };
}

type EntityTypeRow = {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  fields: FieldRow[];
};

function serializeEntityType(entityType: EntityTypeRow) {
  return {
    id: entityType.id,
    name: entityType.name,
    icon: entityType.icon,
    color: entityType.color,
    description: entityType.description,
    createdAt: entityType.createdAt.toISOString(),
    updatedAt: entityType.updatedAt.toISOString(),
    fields: entityType.fields.map(serializeField),
  };
}

type TemplateItemRow = {
  id: string;
  title: string;
  departmentId: string | null;
  estimatedHours: number;
  priority: string;
  sortOrder: number;
};

type TemplateRow = {
  id: string;
  name: string;
  description: string;
  icon: string;
  createdAt: Date;
  updatedAt: Date;
  items: TemplateItemRow[];
};

function serializeTemplate(template: TemplateRow) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    icon: template.icon,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
    items: template.items.map((item) => ({
      id: item.id,
      title: item.title,
      departmentId: item.departmentId,
      estimatedHours: item.estimatedHours,
      priority: item.priority,
      sortOrder: item.sortOrder,
    })),
  };
}

const ENTITY_TYPE_INCLUDE = {
  fields: { orderBy: [{ sortOrder: "asc" as const }, { key: "asc" as const }] },
};

const TEMPLATE_INCLUDE = {
  items: { orderBy: [{ sortOrder: "asc" as const }, { title: "asc" as const }] },
};

async function loadEntityType(tenantId: string, id: string) {
  return prisma.entityTypeDef.findFirst({
    where: { id, tenantId },
    include: ENTITY_TYPE_INCLUDE,
  });
}

async function loadTemplate(tenantId: string, id: string) {
  return prisma.taskTemplate.findFirst({
    where: { id, tenantId },
    include: TEMPLATE_INCLUDE,
  });
}

// A field edit is an edit of the entity type as a whole, but Prisma's
// @updatedAt only fires on the row actually written -- bump the parent
// explicitly so "last updated" reflects schema changes, not just renames.
async function touchEntityType(id: string) {
  await prisma.entityTypeDef.update({ where: { id }, data: { updatedAt: new Date() } });
}

async function touchTemplate(id: string) {
  await prisma.taskTemplate.update({ where: { id }, data: { updatedAt: new Date() } });
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/* -------------------------------------------------------------------------- */
/* Entity types                                                                */
/* -------------------------------------------------------------------------- */

schemaBuilderRouter.get("/entity-types", async (req, res) => {
  try {
    const rows = await prisma.entityTypeDef.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: "desc" },
      include: ENTITY_TYPE_INCLUDE,
    });
    return res.json(rows.map(serializeEntityType));
  } catch (err) {
    req.log.error(err, "Failed to list entity types");
    return res.status(500).json({ error: "Internal server error" });
  }
});

schemaBuilderRouter.post("/entity-types", requireSchemaAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { name, icon, color, description } = req.body ?? {};

    const existing = await prisma.entityTypeDef.findMany({
      where: { tenantId },
      select: { name: true },
    });
    const desired = (optionalString(name) ?? "").trim() || "Untitled Entity Type";

    const created = await prisma.entityTypeDef.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        createdById: req.userId ?? null,
        name: uniqueName(desired, new Set(existing.map((e) => e.name))),
        icon: optionalString(icon) ?? "Boxes",
        color: optionalString(color) ?? "#4facfe",
        description: optionalString(description) ?? "",
      },
      include: ENTITY_TYPE_INCLUDE,
    });
    return res.status(201).json(serializeEntityType(created));
  } catch (err) {
    req.log.error(err, "Failed to create entity type");
    return res.status(500).json({ error: "Internal server error" });
  }
});

schemaBuilderRouter.patch("/entity-types/:id", requireSchemaAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const id = req.params.id as string;
    const current = await loadEntityType(tenantId, id);
    if (!current) return res.status(404).json({ error: "Entity type not found" });

    const { name, icon, color, description } = req.body ?? {};
    const data: Record<string, string> = {};

    if (name !== undefined) {
      const trimmed = optionalString(name)?.trim();
      if (!trimmed) return res.status(400).json({ error: "name cannot be empty" });
      if (trimmed !== current.name) {
        const clash = await prisma.entityTypeDef.findFirst({
          where: { tenantId, name: trimmed, id: { not: id } },
          select: { id: true },
        });
        if (clash)
          return res.status(409).json({ error: `An entity type named "${trimmed}" already exists` });
      }
      data.name = trimmed;
    }
    if (icon !== undefined) data.icon = optionalString(icon) ?? current.icon;
    if (color !== undefined) data.color = optionalString(color) ?? current.color;
    if (description !== undefined) data.description = optionalString(description) ?? "";

    const updated = await prisma.entityTypeDef.update({
      where: { id },
      data,
      include: ENTITY_TYPE_INCLUDE,
    });
    return res.json(serializeEntityType(updated));
  } catch (err) {
    req.log.error(err, "Failed to update entity type");
    return res.status(500).json({ error: "Internal server error" });
  }
});

schemaBuilderRouter.delete("/entity-types/:id", requireSchemaAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const id = req.params.id as string;
    const existing = await prisma.entityTypeDef.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "Entity type not found" });

    await prisma.entityTypeDef.delete({ where: { id } });
    return res.status(204).send();
  } catch (err) {
    req.log.error(err, "Failed to delete entity type");
    return res.status(500).json({ error: "Internal server error" });
  }
});

schemaBuilderRouter.post("/entity-types/:id/duplicate", requireSchemaAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const source = await loadEntityType(tenantId, req.params.id as string);
    if (!source) return res.status(404).json({ error: "Entity type not found" });

    const existing = await prisma.entityTypeDef.findMany({
      where: { tenantId },
      select: { name: true },
    });
    const cloneId = crypto.randomUUID();

    await prisma.$transaction([
      prisma.entityTypeDef.create({
        data: {
          id: cloneId,
          tenantId,
          createdById: req.userId ?? null,
          name: uniqueName(`${source.name} Copy`, new Set(existing.map((e) => e.name))),
          icon: source.icon,
          color: source.color,
          description: source.description,
        },
      }),
      prisma.entityFieldDef.createMany({
        data: source.fields.map((field) => ({
          id: crypto.randomUUID(),
          tenantId,
          entityTypeId: cloneId,
          key: field.key,
          label: field.label,
          type: field.type,
          required: field.required,
          description: field.description,
          options: asStringArray(field.options),
          defaultValue: field.defaultValue,
          expression: field.expression,
          sortOrder: field.sortOrder,
        })),
      }),
    ]);

    const clone = await loadEntityType(tenantId, cloneId);
    return res.status(201).json(serializeEntityType(clone!));
  } catch (err) {
    req.log.error(err, "Failed to duplicate entity type");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/* -------------------------------------------------------------------------- */
/* Entity fields                                                               */
/* -------------------------------------------------------------------------- */

function validateFieldType(value: unknown): value is (typeof FIELD_TYPES)[number] {
  return typeof value === "string" && (FIELD_TYPES as readonly string[]).includes(value);
}

schemaBuilderRouter.post("/entity-types/:id/fields", requireSchemaAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const entityTypeId = req.params.id as string;
    const entityType = await loadEntityType(tenantId, entityTypeId);
    if (!entityType) return res.status(404).json({ error: "Entity type not found" });

    const { key, label, type, required, description, options, defaultValue, expression } =
      req.body ?? {};

    if (type !== undefined && !validateFieldType(type))
      return res.status(400).json({ error: `type must be one of: ${FIELD_TYPES.join(", ")}` });

    const taken = entityType.fields.map((f) => f.key);
    const resolvedLabel = (optionalString(label) ?? "").trim() || "New Field";
    let resolvedKey: string;
    if (key !== undefined) {
      resolvedKey = normalizeKey(optionalString(key) ?? "");
      if (!resolvedKey) return res.status(400).json({ error: "key cannot be empty" });
      if (RESERVED_KEYS.includes(resolvedKey))
        return res
          .status(400)
          .json({ error: `"${resolvedKey}" is a reserved word in computed expressions` });
      if (taken.includes(resolvedKey))
        return res.status(409).json({ error: `key "${resolvedKey}" is already used by another field` });
    } else {
      resolvedKey = slugifyKey(resolvedLabel, taken);
    }

    const created = await prisma.entityFieldDef.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        entityTypeId,
        key: resolvedKey,
        label: resolvedLabel,
        type: validateFieldType(type) ? type : "text",
        required: typeof required === "boolean" ? required : false,
        description: optionalString(description) ?? "",
        options: asStringArray(options),
        defaultValue: optionalString(defaultValue) ?? null,
        expression: optionalString(expression) ?? null,
        sortOrder: entityType.fields.reduce((max, f) => Math.max(max, f.sortOrder + 1), 0),
      },
    });
    await touchEntityType(entityTypeId);
    return res.status(201).json(serializeField(created));
  } catch (err) {
    req.log.error(err, "Failed to create entity field");
    return res.status(500).json({ error: "Internal server error" });
  }
});

schemaBuilderRouter.patch(
  "/entity-types/:id/fields/:fieldId",
  requireSchemaAdmin,
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const entityTypeId = req.params.id as string;
      const fieldId = req.params.fieldId as string;

      const field = await prisma.entityFieldDef.findFirst({
        where: { id: fieldId, tenantId, entityTypeId },
      });
      if (!field) return res.status(404).json({ error: "Field not found" });

      const { key, label, type, required, description, options, defaultValue, expression } =
        req.body ?? {};
      const data: Record<string, unknown> = {};

      if (key !== undefined) {
        const normalized = normalizeKey(optionalString(key) ?? "");
        if (!normalized) return res.status(400).json({ error: "key cannot be empty" });
        if (RESERVED_KEYS.includes(normalized))
          return res
            .status(400)
            .json({ error: `"${normalized}" is a reserved word in computed expressions` });
        if (normalized !== field.key) {
          const clash = await prisma.entityFieldDef.findFirst({
            where: { tenantId, entityTypeId, key: normalized, id: { not: fieldId } },
            select: { id: true },
          });
          if (clash)
            return res
              .status(409)
              .json({ error: `key "${normalized}" is already used by another field` });
        }
        data.key = normalized;
      }
      if (label !== undefined) data.label = optionalString(label) ?? "";
      if (type !== undefined) {
        if (!validateFieldType(type))
          return res.status(400).json({ error: `type must be one of: ${FIELD_TYPES.join(", ")}` });
        data.type = type;
      }
      if (required !== undefined) {
        if (typeof required !== "boolean")
          return res.status(400).json({ error: "required must be a boolean" });
        data.required = required;
      }
      if (description !== undefined) data.description = optionalString(description) ?? "";
      if (options !== undefined) data.options = asStringArray(options);
      // null clears a default/expression that no longer applies to the type.
      if (defaultValue !== undefined) data.defaultValue = optionalString(defaultValue) ?? null;
      if (expression !== undefined) data.expression = optionalString(expression) ?? null;

      const updated = await prisma.entityFieldDef.update({ where: { id: fieldId }, data });
      await touchEntityType(entityTypeId);
      return res.json(serializeField(updated));
    } catch (err) {
      req.log.error(err, "Failed to update entity field");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

schemaBuilderRouter.delete(
  "/entity-types/:id/fields/:fieldId",
  requireSchemaAdmin,
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const entityTypeId = req.params.id as string;
      const fieldId = req.params.fieldId as string;

      const field = await prisma.entityFieldDef.findFirst({
        where: { id: fieldId, tenantId, entityTypeId },
        select: { id: true },
      });
      if (!field) return res.status(404).json({ error: "Field not found" });

      await prisma.entityFieldDef.delete({ where: { id: fieldId } });
      await touchEntityType(entityTypeId);
      return res.status(204).send();
    } catch (err) {
      req.log.error(err, "Failed to delete entity field");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

schemaBuilderRouter.put("/entity-types/:id/fields/order", requireSchemaAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const entityTypeId = req.params.id as string;
    const entityType = await loadEntityType(tenantId, entityTypeId);
    if (!entityType) return res.status(404).json({ error: "Entity type not found" });

    const fieldIds = req.body?.fieldIds;
    if (!Array.isArray(fieldIds) || fieldIds.some((id) => typeof id !== "string"))
      return res.status(400).json({ error: "fieldIds must be an array of field ids" });

    const owned = new Set(entityType.fields.map((f) => f.id));
    if (fieldIds.length !== owned.size || fieldIds.some((id: string) => !owned.has(id)))
      return res
        .status(400)
        .json({ error: "fieldIds must list every field of this entity type exactly once" });

    await prisma.$transaction(
      fieldIds.map((id: string, index: number) =>
        prisma.entityFieldDef.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
    await touchEntityType(entityTypeId);

    const reordered = await loadEntityType(tenantId, entityTypeId);
    return res.json(serializeEntityType(reordered!));
  } catch (err) {
    req.log.error(err, "Failed to reorder entity fields");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/* -------------------------------------------------------------------------- */
/* Task templates                                                              */
/* -------------------------------------------------------------------------- */

async function departmentInTenant(id: string, tenantId: string) {
  const row = await prisma.department.findFirst({ where: { id, tenantId }, select: { id: true } });
  return !!row;
}

schemaBuilderRouter.get("/task-templates", async (req, res) => {
  try {
    const rows = await prisma.taskTemplate.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: "desc" },
      include: TEMPLATE_INCLUDE,
    });
    return res.json(rows.map(serializeTemplate));
  } catch (err) {
    req.log.error(err, "Failed to list task templates");
    return res.status(500).json({ error: "Internal server error" });
  }
});

schemaBuilderRouter.post("/task-templates", requireSchemaAdmin, async (req, res) => {
  try {
    const { name, description, icon } = req.body ?? {};
    const created = await prisma.taskTemplate.create({
      data: {
        id: crypto.randomUUID(),
        tenantId: req.tenantId!,
        createdById: req.userId ?? null,
        name: (optionalString(name) ?? "").trim() || "Untitled Template",
        description: optionalString(description) ?? "",
        icon: optionalString(icon) ?? "ClipboardList",
      },
      include: TEMPLATE_INCLUDE,
    });
    return res.status(201).json(serializeTemplate(created));
  } catch (err) {
    req.log.error(err, "Failed to create task template");
    return res.status(500).json({ error: "Internal server error" });
  }
});

schemaBuilderRouter.patch("/task-templates/:id", requireSchemaAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const id = req.params.id as string;
    const current = await loadTemplate(tenantId, id);
    if (!current) return res.status(404).json({ error: "Task template not found" });

    const { name, description, icon } = req.body ?? {};
    const data: Record<string, string> = {};
    if (name !== undefined) {
      const trimmed = optionalString(name)?.trim();
      if (!trimmed) return res.status(400).json({ error: "name cannot be empty" });
      data.name = trimmed;
    }
    if (description !== undefined) data.description = optionalString(description) ?? "";
    if (icon !== undefined) data.icon = optionalString(icon) ?? current.icon;

    const updated = await prisma.taskTemplate.update({
      where: { id },
      data,
      include: TEMPLATE_INCLUDE,
    });
    return res.json(serializeTemplate(updated));
  } catch (err) {
    req.log.error(err, "Failed to update task template");
    return res.status(500).json({ error: "Internal server error" });
  }
});

schemaBuilderRouter.delete("/task-templates/:id", requireSchemaAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const id = req.params.id as string;
    const existing = await prisma.taskTemplate.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "Task template not found" });

    await prisma.taskTemplate.delete({ where: { id } });
    return res.status(204).send();
  } catch (err) {
    req.log.error(err, "Failed to delete task template");
    return res.status(500).json({ error: "Internal server error" });
  }
});

schemaBuilderRouter.post("/task-templates/:id/duplicate", requireSchemaAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const source = await loadTemplate(tenantId, req.params.id as string);
    if (!source) return res.status(404).json({ error: "Task template not found" });

    const cloneId = crypto.randomUUID();
    await prisma.$transaction([
      prisma.taskTemplate.create({
        data: {
          id: cloneId,
          tenantId,
          createdById: req.userId ?? null,
          name: `${source.name} Copy`,
          description: source.description,
          icon: source.icon,
        },
      }),
      prisma.taskTemplateItem.createMany({
        data: source.items.map((item) => ({
          id: crypto.randomUUID(),
          tenantId,
          templateId: cloneId,
          title: item.title,
          departmentId: item.departmentId,
          estimatedHours: item.estimatedHours,
          priority: item.priority,
          sortOrder: item.sortOrder,
        })),
      }),
    ]);

    const clone = await loadTemplate(tenantId, cloneId);
    return res.status(201).json(serializeTemplate(clone!));
  } catch (err) {
    req.log.error(err, "Failed to duplicate task template");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/* -------------------------------------------------------------------------- */
/* Task template items                                                         */
/* -------------------------------------------------------------------------- */

schemaBuilderRouter.post("/task-templates/:id/items", requireSchemaAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const templateId = req.params.id as string;
    const template = await loadTemplate(tenantId, templateId);
    if (!template) return res.status(404).json({ error: "Task template not found" });

    const { title, departmentId, estimatedHours, priority } = req.body ?? {};

    if (priority !== undefined && !(PRIORITIES as readonly string[]).includes(priority))
      return res.status(400).json({ error: `priority must be one of: ${PRIORITIES.join(", ")}` });
    if (departmentId != null && !(await departmentInTenant(String(departmentId), tenantId)))
      return res.status(400).json({ error: "Invalid departmentId" });

    const created = await prisma.taskTemplateItem.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        templateId,
        title: (optionalString(title) ?? "").trim() || "New Task",
        departmentId: optionalString(departmentId) ?? null,
        estimatedHours: Number.isInteger(estimatedHours) ? Math.max(0, estimatedHours) : 0,
        priority: optionalString(priority) ?? "medium",
        sortOrder: template.items.reduce((max, item) => Math.max(max, item.sortOrder + 1), 0),
      },
    });
    await touchTemplate(templateId);
    return res.status(201).json({
      id: created.id,
      title: created.title,
      departmentId: created.departmentId,
      estimatedHours: created.estimatedHours,
      priority: created.priority,
      sortOrder: created.sortOrder,
    });
  } catch (err) {
    req.log.error(err, "Failed to create task template item");
    return res.status(500).json({ error: "Internal server error" });
  }
});

schemaBuilderRouter.patch(
  "/task-templates/:id/items/:itemId",
  requireSchemaAdmin,
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const templateId = req.params.id as string;
      const itemId = req.params.itemId as string;

      const item = await prisma.taskTemplateItem.findFirst({
        where: { id: itemId, tenantId, templateId },
        select: { id: true },
      });
      if (!item) return res.status(404).json({ error: "Task template item not found" });

      const { title, departmentId, estimatedHours, priority } = req.body ?? {};
      const data: Record<string, unknown> = {};

      if (title !== undefined) data.title = optionalString(title) ?? "";
      if (departmentId !== undefined) {
        if (departmentId === null) {
          data.departmentId = null;
        } else {
          const id = optionalString(departmentId);
          if (!id || !(await departmentInTenant(id, tenantId)))
            return res.status(400).json({ error: "Invalid departmentId" });
          data.departmentId = id;
        }
      }
      if (estimatedHours !== undefined) {
        if (!Number.isInteger(estimatedHours) || estimatedHours < 0)
          return res.status(400).json({ error: "estimatedHours must be a non-negative integer" });
        data.estimatedHours = estimatedHours;
      }
      if (priority !== undefined) {
        if (!(PRIORITIES as readonly string[]).includes(priority))
          return res.status(400).json({ error: `priority must be one of: ${PRIORITIES.join(", ")}` });
        data.priority = priority;
      }

      const updated = await prisma.taskTemplateItem.update({ where: { id: itemId }, data });
      await touchTemplate(templateId);
      return res.json({
        id: updated.id,
        title: updated.title,
        departmentId: updated.departmentId,
        estimatedHours: updated.estimatedHours,
        priority: updated.priority,
        sortOrder: updated.sortOrder,
      });
    } catch (err) {
      req.log.error(err, "Failed to update task template item");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

schemaBuilderRouter.delete(
  "/task-templates/:id/items/:itemId",
  requireSchemaAdmin,
  async (req, res) => {
    try {
      const tenantId = req.tenantId!;
      const templateId = req.params.id as string;
      const itemId = req.params.itemId as string;

      const item = await prisma.taskTemplateItem.findFirst({
        where: { id: itemId, tenantId, templateId },
        select: { id: true },
      });
      if (!item) return res.status(404).json({ error: "Task template item not found" });

      await prisma.taskTemplateItem.delete({ where: { id: itemId } });
      await touchTemplate(templateId);
      return res.status(204).send();
    } catch (err) {
      req.log.error(err, "Failed to delete task template item");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

schemaBuilderRouter.put("/task-templates/:id/items/order", requireSchemaAdmin, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const templateId = req.params.id as string;
    const template = await loadTemplate(tenantId, templateId);
    if (!template) return res.status(404).json({ error: "Task template not found" });

    const itemIds = req.body?.itemIds;
    if (!Array.isArray(itemIds) || itemIds.some((id) => typeof id !== "string"))
      return res.status(400).json({ error: "itemIds must be an array of item ids" });

    const owned = new Set(template.items.map((i) => i.id));
    if (itemIds.length !== owned.size || itemIds.some((id: string) => !owned.has(id)))
      return res
        .status(400)
        .json({ error: "itemIds must list every item of this template exactly once" });

    await prisma.$transaction(
      itemIds.map((id: string, index: number) =>
        prisma.taskTemplateItem.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
    await touchTemplate(templateId);

    const reordered = await loadTemplate(tenantId, templateId);
    return res.json(serializeTemplate(reordered!));
  } catch (err) {
    req.log.error(err, "Failed to reorder task template items");
    return res.status(500).json({ error: "Internal server error" });
  }
});
