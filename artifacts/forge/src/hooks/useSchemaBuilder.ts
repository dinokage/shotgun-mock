import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import type {
  EntityField,
  EntityTypeDef,
  FieldType,
  TaskTemplateDef,
  TaskTemplateItem,
  TemplateTaskPriority,
} from "@/store/schema";

const ENTITY_TYPES_KEY = ["schema", "entity-types"];
const TASK_TEMPLATES_KEY = ["schema", "task-templates"];

export interface EntityFieldInput {
  key?: string;
  label?: string;
  type?: FieldType;
  required?: boolean;
  description?: string;
  options?: string[];
  defaultValue?: string | null;
  expression?: string | null;
}

export interface TaskTemplateItemInput {
  title?: string;
  departmentId?: string | null;
  estimatedHours?: number;
  priority?: TemplateTaskPriority;
}

// Every mutation below refetches its list, but the builder is a direct-
// manipulation UI: a drag or a toggle has to land in the rendered list on the
// same frame it happens, not one round-trip later. These patch the cached
// list in onMutate; the invalidate in onSettled is what reconciles it with
// whatever the server actually stored.
function patchEntityTypes(
  queryClient: QueryClient,
  updater: (types: EntityTypeDef[]) => EntityTypeDef[],
) {
  queryClient.setQueryData<EntityTypeDef[]>(ENTITY_TYPES_KEY, (prev) =>
    prev ? updater(prev) : prev,
  );
}

function patchTemplates(
  queryClient: QueryClient,
  updater: (templates: TaskTemplateDef[]) => TaskTemplateDef[],
) {
  queryClient.setQueryData<TaskTemplateDef[]>(TASK_TEMPLATES_KEY, (prev) =>
    prev ? updater(prev) : prev,
  );
}

function reorderById<T extends { id: string }>(rows: T[], orderedIds: string[]): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return orderedIds.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

/* -------------------------------------------------------------------------- */
/* Entity types                                                                */
/* -------------------------------------------------------------------------- */

export function useEntityTypes() {
  return useQuery<EntityTypeDef[]>({
    queryKey: ENTITY_TYPES_KEY,
    queryFn: () => apiClient.get<EntityTypeDef[]>("/schema/entity-types"),
    staleTime: 30000,
  });
}

export function useCreateEntityType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; icon?: string; color?: string; description?: string }) =>
      apiClient.post<EntityTypeDef>("/schema/entity-types", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ENTITY_TYPES_KEY }),
  });
}

export function useUpdateEntityType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: { id: string } & Partial<Pick<EntityTypeDef, "name" | "icon" | "color" | "description">>) =>
      apiClient.patch<EntityTypeDef>(`/schema/entity-types/${id}`, body),
    onMutate: ({ id, ...body }) =>
      patchEntityTypes(queryClient, (types) =>
        types.map((type) => (type.id === id ? { ...type, ...body } : type)),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ENTITY_TYPES_KEY }),
  });
}

export function useDeleteEntityType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/schema/entity-types/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ENTITY_TYPES_KEY }),
  });
}

export function useDuplicateEntityType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<EntityTypeDef>(`/schema/entity-types/${id}/duplicate`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ENTITY_TYPES_KEY }),
  });
}

/* -------------------------------------------------------------------------- */
/* Entity fields                                                               */
/* -------------------------------------------------------------------------- */

export function useCreateEntityField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ entityTypeId, ...body }: { entityTypeId: string } & EntityFieldInput) =>
      apiClient.post<EntityField>(`/schema/entity-types/${entityTypeId}/fields`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ENTITY_TYPES_KEY }),
  });
}

export function useUpdateEntityField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      entityTypeId,
      fieldId,
      ...body
    }: { entityTypeId: string; fieldId: string } & EntityFieldInput) =>
      apiClient.patch<EntityField>(
        `/schema/entity-types/${entityTypeId}/fields/${fieldId}`,
        body,
      ),
    onMutate: ({ entityTypeId, fieldId, ...body }) =>
      patchEntityTypes(queryClient, (types) =>
        types.map((type) =>
          type.id === entityTypeId
            ? {
                ...type,
                fields: type.fields.map((field) =>
                  field.id === fieldId ? { ...field, ...body } : field,
                ),
              }
            : type,
        ),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ENTITY_TYPES_KEY }),
  });
}

export function useDeleteEntityField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ entityTypeId, fieldId }: { entityTypeId: string; fieldId: string }) =>
      apiClient.delete(`/schema/entity-types/${entityTypeId}/fields/${fieldId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ENTITY_TYPES_KEY }),
  });
}

export function useReorderEntityFields() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ entityTypeId, fieldIds }: { entityTypeId: string; fieldIds: string[] }) =>
      apiClient.put<EntityTypeDef>(`/schema/entity-types/${entityTypeId}/fields/order`, {
        fieldIds,
      }),
    onMutate: ({ entityTypeId, fieldIds }) =>
      patchEntityTypes(queryClient, (types) =>
        types.map((type) =>
          type.id === entityTypeId
            ? { ...type, fields: reorderById(type.fields, fieldIds) }
            : type,
        ),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ENTITY_TYPES_KEY }),
  });
}

/* -------------------------------------------------------------------------- */
/* Task templates                                                              */
/* -------------------------------------------------------------------------- */

export function useTaskTemplates() {
  return useQuery<TaskTemplateDef[]>({
    queryKey: TASK_TEMPLATES_KEY,
    queryFn: () => apiClient.get<TaskTemplateDef[]>("/schema/task-templates"),
    staleTime: 30000,
  });
}

export function useCreateTaskTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; description?: string; icon?: string }) =>
      apiClient.post<TaskTemplateDef>("/schema/task-templates", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TASK_TEMPLATES_KEY }),
  });
}

export function useUpdateTaskTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: { id: string } & Partial<Pick<TaskTemplateDef, "name" | "description" | "icon">>) =>
      apiClient.patch<TaskTemplateDef>(`/schema/task-templates/${id}`, body),
    onMutate: ({ id, ...body }) =>
      patchTemplates(queryClient, (templates) =>
        templates.map((template) => (template.id === id ? { ...template, ...body } : template)),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: TASK_TEMPLATES_KEY }),
  });
}

export function useDeleteTaskTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/schema/task-templates/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TASK_TEMPLATES_KEY }),
  });
}

export function useDuplicateTaskTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<TaskTemplateDef>(`/schema/task-templates/${id}/duplicate`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TASK_TEMPLATES_KEY }),
  });
}

export function useCreateTemplateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ templateId, ...body }: { templateId: string } & TaskTemplateItemInput) =>
      apiClient.post<TaskTemplateItem>(`/schema/task-templates/${templateId}/items`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TASK_TEMPLATES_KEY }),
  });
}

export function useUpdateTemplateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      templateId,
      itemId,
      ...body
    }: { templateId: string; itemId: string } & TaskTemplateItemInput) =>
      apiClient.patch<TaskTemplateItem>(
        `/schema/task-templates/${templateId}/items/${itemId}`,
        body,
      ),
    onMutate: ({ templateId, itemId, ...body }) =>
      patchTemplates(queryClient, (templates) =>
        templates.map((template) =>
          template.id === templateId
            ? {
                ...template,
                items: template.items.map((item) =>
                  item.id === itemId ? { ...item, ...body } : item,
                ),
              }
            : template,
        ),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: TASK_TEMPLATES_KEY }),
  });
}

export function useDeleteTemplateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ templateId, itemId }: { templateId: string; itemId: string }) =>
      apiClient.delete(`/schema/task-templates/${templateId}/items/${itemId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TASK_TEMPLATES_KEY }),
  });
}

// Applying a bundle is a plain sequence of task creations: a task belongs to
// a shot or an asset (never to a project directly), and there is no bulk
// endpoint, so the caller picks one entity and the whole bundle lands on it.
// Requires the `create_tasks` capability — a role without it gets a 403 here
// rather than a silently local-only copy of the bundle.
export function useApplyTaskTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      template,
      entityId,
      entityType,
      departmentNameById,
    }: {
      template: TaskTemplateDef;
      entityId: string;
      entityType: "shot" | "asset";
      departmentNameById: Record<string, string>;
    }) => {
      for (let index = 0; index < template.items.length; index++) {
        const item = template.items[index];
        await apiClient.post("/tasks", {
          entityId,
          entityType,
          title: item.title,
          description: `Generated from the "${template.name}" task template.`,
          priority: item.priority,
          department: item.departmentId
            ? (departmentNameById[item.departmentId] ?? null)
            : null,
          pipelinePhase: "MAIN",
          dueDate: new Date(
            Date.now() + (index + 1) * 7 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          estimatedHours: item.estimatedHours,
        });
      }
      return template.items.length;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useReorderTemplateItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ templateId, itemIds }: { templateId: string; itemIds: string[] }) =>
      apiClient.put<TaskTemplateDef>(`/schema/task-templates/${templateId}/items/order`, {
        itemIds,
      }),
    onMutate: ({ templateId, itemIds }) =>
      patchTemplates(queryClient, (templates) =>
        templates.map((template) =>
          template.id === templateId
            ? { ...template, items: reorderById(template.items, itemIds) }
            : template,
        ),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: TASK_TEMPLATES_KEY }),
  });
}
