import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Task } from '@/data/mockData';

// ============================================================================
// FORGE — No-code Entity Schema Builder + Task Templates
// Forge's flagship differentiator: entity types are defined by admins
// directly in the product, not via an external API/config layer.
// ============================================================================

export type FieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'boolean'
  | 'single_select'
  | 'multi_select'
  | 'computed';

export const FIELD_TYPE_META: Record<FieldType, { label: string; description: string }> = {
  text: { label: 'Text', description: 'Free-form single-line text.' },
  number: { label: 'Number', description: 'Integer or decimal value.' },
  date: { label: 'Date', description: 'A calendar date.' },
  boolean: { label: 'Boolean', description: 'A true/false toggle.' },
  single_select: { label: 'Single Select', description: 'One value chosen from a fixed list.' },
  multi_select: { label: 'Multi Select', description: 'Any number of values from a fixed list.' },
  computed: { label: 'Computed', description: 'Derived automatically from other fields via an expression.' },
};

export interface EntityField {
  id: string;
  key: string; // stable snake_case identifier, referenced by computed expressions
  label: string;
  type: FieldType;
  required: boolean;
  description?: string;
  options?: string[]; // single_select / multi_select
  defaultValue?: string; // text/date literal, 'true'/'false' for boolean, stringified number
  expression?: string; // computed fields only
  /**
   * True once the user has typed directly into the `key` input. Until then,
   * FieldRow keeps re-slugifying the key from the label on every rename, so
   * "Insert:" chips and expression references track the current label
   * instead of freezing at whatever the placeholder label was on creation.
   */
  keyManuallyEdited?: boolean;
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
  department: string; // Department.id
  estimatedHours: number;
  priority: Task['priority'];
  order: number;
}

export interface TaskTemplateDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  tasks: TaskTemplateItem[];
  createdAt: string;
  updatedAt: string;
}

// --- id helpers --------------------------------------------------------------

let entityCounter = 0;
let fieldCounter = 0;
let templateCounter = 0;
let templateTaskCounter = 0;

const newEntityTypeId = () => `etype-${Date.now().toString(36)}-${(entityCounter++).toString(36)}`;
const newFieldId = () => `fld-${Date.now().toString(36)}-${(fieldCounter++).toString(36)}`;
const newTemplateId = () => `tmpl-${Date.now().toString(36)}-${(templateCounter++).toString(36)}`;
const newTemplateTaskId = () => `tmpltask-${Date.now().toString(36)}-${(templateTaskCounter++).toString(36)}`;

export function slugifyKey(label: string, taken: string[] = []): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'field';
  const startsWithDigit = /^[0-9]/.test(base);
  let key = startsWithDigit ? `f_${base}` : base;
  let suffix = 2;
  while (taken.includes(key)) {
    key = `${startsWithDigit ? `f_${base}` : base}_${suffix++}`;
  }
  return key;
}

// --- seed data -----------------------------------------------------------------
// One fully-worked example entity type, showing every field type including a
// computed field that references three sibling fields.

// keyManuallyEdited: true on every seed field — these keys are already
// referenced by the est_build_hours expression below, so renaming a seed
// field's label must NOT silently re-slugify (and break) its key.
const seedCreatureFields: EntityField[] = [
  {
    id: 'fld-seed-1',
    key: 'name',
    label: 'Creature Name',
    type: 'text',
    required: true,
    defaultValue: 'Void Drake',
    description: 'Working name used across concept, model, and rig.',
    keyManuallyEdited: true,
  },
  {
    id: 'fld-seed-2',
    key: 'locomotion',
    label: 'Locomotion',
    type: 'single_select',
    required: true,
    options: ['Biped', 'Quadruped', 'Avian', 'Aquatic', 'Serpentine'],
    defaultValue: 'Quadruped',
    keyManuallyEdited: true,
  },
  {
    id: 'fld-seed-3',
    key: 'abilities',
    label: 'Special Abilities',
    type: 'multi_select',
    required: false,
    options: ['Flight', 'Fire Breath', 'Camouflage', 'Regeneration', 'Venom', 'Armor Plating'],
    defaultValue: 'Flight,Fire Breath',
    keyManuallyEdited: true,
  },
  {
    id: 'fld-seed-4',
    key: 'hero_asset',
    label: 'Hero Asset',
    type: 'boolean',
    required: false,
    defaultValue: 'true',
    description: 'Gets senior artist assignment and extra review passes when true.',
    keyManuallyEdited: true,
  },
  {
    id: 'fld-seed-5',
    key: 'complexity_score',
    label: 'Complexity Score',
    type: 'number',
    required: true,
    defaultValue: '7',
    description: '1 (simple) – 10 (extremely complex rig/groom/sim).',
    keyManuallyEdited: true,
  },
  {
    id: 'fld-seed-6',
    key: 'screen_time_minutes',
    label: 'Screen Time (minutes)',
    type: 'number',
    required: true,
    defaultValue: '4',
    keyManuallyEdited: true,
  },
  {
    id: 'fld-seed-7',
    key: 'model_lock_date',
    label: 'Model Lock Date',
    type: 'date',
    required: false,
    defaultValue: '2026-09-15',
    keyManuallyEdited: true,
  },
  {
    id: 'fld-seed-8',
    key: 'est_build_hours',
    label: 'Estimated Build Hours',
    type: 'computed',
    required: false,
    expression: 'complexity_score * screen_time_minutes * 12 + hero_asset * 40',
    description: 'Rough budgeting heuristic: complexity × screen time × 12, plus a 40hr hero-asset premium.',
    keyManuallyEdited: true,
  },
];

const SEED_ENTITY_TYPES: EntityTypeDef[] = [
  {
    id: 'etype-seed-creature',
    name: 'Creature',
    icon: 'PawPrint',
    color: '#ff6b6b',
    description: 'A creature design that flows through concept, model, rig, groom, and CFX.',
    fields: seedCreatureFields,
    createdAt: '2026-06-01T09:00:00.000Z',
    updatedAt: '2026-06-01T09:00:00.000Z',
  },
];

// department ids follow DEPT_DEFINITIONS order in mockData.ts:
// dept5 Layout · dept6 Animation · dept7 Lighting · dept12 FX Simulations · dept18 Compositing
// dept2 Modeling · dept3 Texturing/LookDev · dept4 Rigging · dept13 Grooming

const SEED_TEMPLATES: TaskTemplateDef[] = [
  {
    id: 'tmpl-seed-shot-pipeline',
    name: 'Standard Shot Pipeline',
    description: 'The default per-shot task bundle: Layout through Comp, in pipeline order.',
    icon: 'Film',
    createdAt: '2026-06-01T09:00:00.000Z',
    updatedAt: '2026-06-01T09:00:00.000Z',
    tasks: [
      { id: 'tt-seed-1', title: 'Layout', department: 'dept5', estimatedHours: 8, priority: 'medium', order: 0 },
      { id: 'tt-seed-2', title: 'Animation', department: 'dept6', estimatedHours: 24, priority: 'high', order: 1 },
      { id: 'tt-seed-3', title: 'FX Simulation', department: 'dept12', estimatedHours: 16, priority: 'medium', order: 2 },
      { id: 'tt-seed-4', title: 'Lighting', department: 'dept7', estimatedHours: 12, priority: 'medium', order: 3 },
      { id: 'tt-seed-5', title: 'Compositing', department: 'dept18', estimatedHours: 16, priority: 'high', order: 4 },
    ],
  },
  {
    id: 'tmpl-seed-character-build',
    name: 'Character Asset Build',
    description: 'Full turnover bundle for a new hero or supporting character asset.',
    icon: 'PersonStanding',
    createdAt: '2026-06-01T09:00:00.000Z',
    updatedAt: '2026-06-01T09:00:00.000Z',
    tasks: [
      { id: 'tt-seed-6', title: 'Model', department: 'dept2', estimatedHours: 32, priority: 'high', order: 0 },
      { id: 'tt-seed-7', title: 'Surfacing / LookDev', department: 'dept3', estimatedHours: 24, priority: 'medium', order: 1 },
      { id: 'tt-seed-8', title: 'Rig', department: 'dept4', estimatedHours: 40, priority: 'high', order: 2 },
      { id: 'tt-seed-9', title: 'Groom', department: 'dept13', estimatedHours: 20, priority: 'medium', order: 3 },
    ],
  },
];

// --- store -----------------------------------------------------------------

interface SchemaState {
  entityTypes: EntityTypeDef[];
  templates: TaskTemplateDef[];

  // Entity types
  addEntityType: (partial?: Partial<Pick<EntityTypeDef, 'name' | 'icon' | 'color' | 'description'>>) => string;
  updateEntityType: (id: string, updates: Partial<Omit<EntityTypeDef, 'id' | 'fields'>>) => void;
  deleteEntityType: (id: string) => void;
  duplicateEntityType: (id: string) => string | null;

  // Fields
  addField: (entityTypeId: string, partial?: Partial<EntityField>) => string;
  updateField: (entityTypeId: string, fieldId: string, updates: Partial<EntityField>) => void;
  removeField: (entityTypeId: string, fieldId: string) => void;
  reorderFields: (entityTypeId: string, orderedFieldIds: string[]) => void;

  // Task templates
  addTemplate: (partial?: Partial<Pick<TaskTemplateDef, 'name' | 'description' | 'icon'>>) => string;
  updateTemplate: (id: string, updates: Partial<Omit<TaskTemplateDef, 'id' | 'tasks'>>) => void;
  deleteTemplate: (id: string) => void;
  duplicateTemplate: (id: string) => string | null;

  addTemplateTask: (templateId: string, partial?: Partial<TaskTemplateItem>) => string;
  updateTemplateTask: (templateId: string, taskId: string, updates: Partial<TaskTemplateItem>) => void;
  removeTemplateTask: (templateId: string, taskId: string) => void;
  reorderTemplateTasks: (templateId: string, orderedTaskIds: string[]) => void;
}

export const useSchemaStore = create<SchemaState>()(
  persist(
    (set, get) => ({
      entityTypes: SEED_ENTITY_TYPES,
      templates: SEED_TEMPLATES,

      addEntityType: (partial) => {
        const id = newEntityTypeId();
        const now = new Date().toISOString();
        const entityType: EntityTypeDef = {
          id,
          name: partial?.name ?? 'Untitled Entity Type',
          icon: partial?.icon ?? 'Boxes',
          color: partial?.color ?? '#4facfe',
          description: partial?.description ?? '',
          fields: [],
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({ entityTypes: [entityType, ...state.entityTypes] }));
        return id;
      },

      updateEntityType: (id, updates) =>
        set((state) => ({
          entityTypes: state.entityTypes.map((e) =>
            e.id === id ? { ...e, ...updates, updatedAt: new Date().toISOString() } : e
          ),
        })),

      deleteEntityType: (id) =>
        set((state) => ({ entityTypes: state.entityTypes.filter((e) => e.id !== id) })),

      duplicateEntityType: (id) => {
        const source = get().entityTypes.find((e) => e.id === id);
        if (!source) return null;
        const newId = newEntityTypeId();
        const now = new Date().toISOString();
        const clone: EntityTypeDef = {
          ...source,
          id: newId,
          name: `${source.name} Copy`,
          fields: source.fields.map((f) => ({ ...f, id: newFieldId() })),
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({ entityTypes: [clone, ...state.entityTypes] }));
        return newId;
      },

      addField: (entityTypeId, partial) => {
        const id = newFieldId();
        set((state) => ({
          entityTypes: state.entityTypes.map((e) => {
            if (e.id !== entityTypeId) return e;
            const taken = e.fields.map((f) => f.key);
            const label = partial?.label ?? 'New Field';
            const field: EntityField = {
              id,
              key: partial?.key ?? slugifyKey(label, taken),
              label,
              type: partial?.type ?? 'text',
              required: partial?.required ?? false,
              options: partial?.options,
              defaultValue: partial?.defaultValue,
              expression: partial?.expression,
              description: partial?.description,
            };
            return { ...e, fields: [...e.fields, field], updatedAt: new Date().toISOString() };
          }),
        }));
        return id;
      },

      updateField: (entityTypeId, fieldId, updates) =>
        set((state) => ({
          entityTypes: state.entityTypes.map((e) => {
            if (e.id !== entityTypeId) return e;
            return {
              ...e,
              fields: e.fields.map((f) => (f.id === fieldId ? { ...f, ...updates } : f)),
              updatedAt: new Date().toISOString(),
            };
          }),
        })),

      removeField: (entityTypeId, fieldId) =>
        set((state) => ({
          entityTypes: state.entityTypes.map((e) =>
            e.id === entityTypeId
              ? { ...e, fields: e.fields.filter((f) => f.id !== fieldId), updatedAt: new Date().toISOString() }
              : e
          ),
        })),

      reorderFields: (entityTypeId, orderedFieldIds) =>
        set((state) => ({
          entityTypes: state.entityTypes.map((e) => {
            if (e.id !== entityTypeId) return e;
            const byId = new Map(e.fields.map((f) => [f.id, f]));
            const reordered = orderedFieldIds.map((id) => byId.get(id)).filter(Boolean) as EntityField[];
            return { ...e, fields: reordered, updatedAt: new Date().toISOString() };
          }),
        })),

      addTemplate: (partial) => {
        const id = newTemplateId();
        const now = new Date().toISOString();
        const template: TaskTemplateDef = {
          id,
          name: partial?.name ?? 'Untitled Template',
          description: partial?.description ?? '',
          icon: partial?.icon ?? 'ClipboardList',
          tasks: [],
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({ templates: [template, ...state.templates] }));
        return id;
      },

      updateTemplate: (id, updates) =>
        set((state) => ({
          templates: state.templates.map((t) =>
            t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
          ),
        })),

      deleteTemplate: (id) =>
        set((state) => ({ templates: state.templates.filter((t) => t.id !== id) })),

      duplicateTemplate: (id) => {
        const source = get().templates.find((t) => t.id === id);
        if (!source) return null;
        const newId = newTemplateId();
        const now = new Date().toISOString();
        const clone: TaskTemplateDef = {
          ...source,
          id: newId,
          name: `${source.name} Copy`,
          tasks: source.tasks.map((t) => ({ ...t, id: newTemplateTaskId() })),
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({ templates: [clone, ...state.templates] }));
        return newId;
      },

      addTemplateTask: (templateId, partial) => {
        const id = newTemplateTaskId();
        set((state) => ({
          templates: state.templates.map((t) => {
            if (t.id !== templateId) return t;
            const task: TaskTemplateItem = {
              id,
              title: partial?.title ?? 'New Task',
              department: partial?.department ?? 'dept2',
              estimatedHours: partial?.estimatedHours ?? 8,
              priority: partial?.priority ?? 'medium',
              order: t.tasks.length,
            };
            return { ...t, tasks: [...t.tasks, task], updatedAt: new Date().toISOString() };
          }),
        }));
        return id;
      },

      updateTemplateTask: (templateId, taskId, updates) =>
        set((state) => ({
          templates: state.templates.map((t) => {
            if (t.id !== templateId) return t;
            return {
              ...t,
              tasks: t.tasks.map((task) => (task.id === taskId ? { ...task, ...updates } : task)),
              updatedAt: new Date().toISOString(),
            };
          }),
        })),

      removeTemplateTask: (templateId, taskId) =>
        set((state) => ({
          templates: state.templates.map((t) =>
            t.id === templateId
              ? { ...t, tasks: t.tasks.filter((task) => task.id !== taskId), updatedAt: new Date().toISOString() }
              : t
          ),
        })),

      reorderTemplateTasks: (templateId, orderedTaskIds) =>
        set((state) => ({
          templates: state.templates.map((t) => {
            if (t.id !== templateId) return t;
            const byId = new Map(t.tasks.map((task) => [task.id, task]));
            const reordered = orderedTaskIds
              .map((id) => byId.get(id))
              .filter(Boolean)
              .map((task, i) => ({ ...(task as TaskTemplateItem), order: i }));
            return { ...t, tasks: reordered, updatedAt: new Date().toISOString() };
          }),
        })),
    }),
    {
      name: 'forge-schema-storage',
    }
  )
);
