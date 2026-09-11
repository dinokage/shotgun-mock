// ============================================================================
// FORGE — No-code Entity Schema Builder + Task Templates
// Forge's flagship differentiator: entity types are defined by admins
// directly in the product, not via an external API/config layer.
//
// The definitions themselves live in the database and are read/written
// through hooks/useSchemaBuilder.ts — this module is only the shared shapes
// and the key-slugging rules, which the server enforces a second time.
// ============================================================================

export type FieldType =
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "single_select"
  | "multi_select"
  | "computed";

export type TemplateTaskPriority = "low" | "medium" | "high" | "critical";

export const FIELD_TYPE_META: Record<
  FieldType,
  { label: string; description: string }
> = {
  text: { label: "Text", description: "Free-form single-line text." },
  number: { label: "Number", description: "Integer or decimal value." },
  date: { label: "Date", description: "A calendar date." },
  boolean: { label: "Boolean", description: "A true/false toggle." },
  single_select: {
    label: "Single Select",
    description: "One value chosen from a fixed list.",
  },
  multi_select: {
    label: "Multi Select",
    description: "Any number of values from a fixed list.",
  },
  computed: {
    label: "Computed",
    description: "Derived automatically from other fields via an expression.",
  },
};

export interface EntityField {
  id: string;
  key: string; // stable snake_case identifier, referenced by computed expressions
  label: string;
  type: FieldType;
  required: boolean;
  description: string;
  options: string[]; // single_select / multi_select
  defaultValue: string | null; // text/date literal, 'true'/'false' for boolean, stringified number
  expression: string | null; // computed fields only
  sortOrder: number;
}

export interface EntityTypeDef {
  id: string;
  name: string;
  icon: string; // lucide-react icon name
  color: string;
  description: string;
  fields: EntityField[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskTemplateItem {
  id: string;
  title: string;
  departmentId: string | null;
  estimatedHours: number;
  priority: TemplateTaskPriority;
  sortOrder: number;
}

export interface TaskTemplateDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  items: TaskTemplateItem[];
  createdAt: string;
  updatedAt: string;
}

// 'true' and 'false' are literals in the computed-expression grammar
// (lib/expressionEvaluator.ts resolves them before ever consulting the
// scope), so a field whose key is exactly one of these can never be
// referenced by value in an expression — it always evaluates to the
// literal instead of the field's actual data. Treat them as taken so
// auto-generated keys never collide with the expression language.
export const RESERVED_KEYS = ["true", "false"];

export function slugifyKey(label: string, taken: string[] = []): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "field";
  const startsWithDigit = /^[0-9]/.test(base);
  let key = startsWithDigit ? `f_${base}` : base;
  let suffix = 2;
  while (taken.includes(key) || RESERVED_KEYS.includes(key)) {
    key = `${startsWithDigit ? `f_${base}` : base}_${suffix++}`;
  }
  return key;
}
