import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";

export type PublishKind = "shot" | "asset";
export type PublishStatus = "queued" | "validating" | "success" | "failed";

export interface PublishValidationEntry {
  name: string;
  passed: boolean;
  detail: string;
}

export interface PublishLogDTO {
  id: string;
  publishKind: PublishKind;
  entityType: PublishKind;
  entityId: string;
  entityName: string | null;
  taskId: string | null;
  versionId: string | null;
  publishedById: string | null;
  publishedBy: { id: string; name: string } | null;
  publishedAt: string;
  status: PublishStatus;
  fileName: string;
  fileSize: string;
  notes: string;
  validationLog: PublishValidationEntry[];
}

export interface PublishLogFilters {
  entityId?: string;
  entityType?: PublishKind;
  status?: PublishStatus;
  publishKind?: PublishKind;
}

export function usePublishLogs(filters: PublishLogFilters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();

  return useQuery<PublishLogDTO[]>({
    queryKey: ["publish-logs", query],
    queryFn: () => apiClient.get<PublishLogDTO[]>(`/publish-logs${query ? `?${query}` : ""}`),
    staleTime: 10000,
  });
}

export interface CreatePublishLogBody {
  publishKind: PublishKind;
  entityType: PublishKind;
  entityId: string;
  taskId?: string;
  versionId?: string;
  status?: PublishStatus;
  fileName?: string;
  fileSize?: string;
  notes?: string;
  validationLog?: PublishValidationEntry[];
}

export function useCreatePublishLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePublishLogBody) => apiClient.post<PublishLogDTO>("/publish-logs", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["publish-logs"] }),
  });
}

export function useUpdatePublishLogStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      status: PublishStatus;
      notes?: string;
      fileSize?: string;
      validationLog?: PublishValidationEntry[];
    }) => apiClient.put<PublishLogDTO>(`/publish-logs/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["publish-logs"] }),
  });
}
