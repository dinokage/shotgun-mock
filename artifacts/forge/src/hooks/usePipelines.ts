import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, apiFetch } from "@/lib/apiClient";

export interface PipelineStageDepartmentDTO {
  id: string;
  name: string;
  abbr: string;
  color: string | null;
}

export interface PipelineTemplateStageDTO {
  id: string;
  name: string;
  shortCode: string;
  sortOrder: number;
  departmentId: string | null;
  department: PipelineStageDepartmentDTO | null;
  isOptional: boolean;
  outputFormats: string[];
  keepsLocalCopy: boolean;
  reviewAudience: string[];
  dccPublishKind: string | null;
}

export interface PipelineTemplateDTO {
  id: string;
  name: string;
  discipline: string;
  entityKind: "shot" | "asset";
  description: string;
  isDefault: boolean;
  stages: PipelineTemplateStageDTO[];
}

// A resolved stage is the template stage with the project's stageOverrides
// already applied server-side: `sortOrder`/`enabled` are the effective
// values, `templateSortOrder` is what the template alone would say, and
// `overridden` marks the stages this project has deliberately diverged on.
export interface ResolvedPipelineStageDTO extends PipelineTemplateStageDTO {
  templateSortOrder: number;
  enabled: boolean;
  overridden: boolean;
  taskCount: number;
}

export interface ResolvedProjectPipelineDTO {
  projectPipelineId: string;
  templateId: string;
  templateName: string;
  discipline: string;
  entityKind: "shot" | "asset";
  description: string;
  stages: ResolvedPipelineStageDTO[];
}

export interface ProjectPipelineResponse {
  projectId: string;
  pipelines: ResolvedProjectPipelineDTO[];
}

export interface StageOverride {
  sortOrder?: number;
  enabled?: boolean;
}

export function usePipelineTemplates() {
  return useQuery<PipelineTemplateDTO[]>({
    queryKey: ["pipeline-templates"],
    queryFn: () => apiFetch<PipelineTemplateDTO[]>("/pipeline-templates"),
    staleTime: 60000,
  });
}

export function useProjectPipeline(projectId: string | undefined) {
  return useQuery<ProjectPipelineResponse>({
    queryKey: ["project-pipeline", projectId ?? "none"],
    queryFn: () => apiFetch<ProjectPipelineResponse>(`/projects/${projectId}/pipeline`),
    enabled: !!projectId,
    staleTime: 30000,
  });
}

// Attaching a template is idempotent server-side (the ProjectPipeline row is
// unique per project+template), so a double-click re-reads the existing
// binding rather than failing.
export function useBindProjectPipeline(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) =>
      apiClient.post<{ projectId: string; pipeline: ResolvedProjectPipelineDTO | null }>(
        `/projects/${projectId}/pipeline`,
        { templateId },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["project-pipeline", projectId ?? "none"] }),
  });
}

// Rejected with 409 while any of this project's tasks still sit on one of the
// template's stages -- the error message carries the blocking task count.
export function useUnbindProjectPipeline(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) =>
      apiClient.delete(`/projects/${projectId}/pipeline/${templateId}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["project-pipeline", projectId ?? "none"] }),
  });
}

// Writes the whole override map for one bound template at a time -- the
// server replaces ProjectPipeline.stageOverrides wholesale, so callers must
// send the full map they want to persist, not a delta.
export function useUpdateProjectPipeline(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { templateId: string; stageOverrides: Record<string, StageOverride> }) =>
      apiClient.put<{ projectId: string; pipeline: ResolvedProjectPipelineDTO | null }>(
        `/projects/${projectId}/pipeline`,
        body,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["project-pipeline", projectId ?? "none"] }),
  });
}
