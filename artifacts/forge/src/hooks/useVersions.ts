import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";

export interface VersionDTO {
  id: string;
  tenantId: string;
  entityId: string;
  entityType: "shot" | "asset";
  versionNumber: string;
  taskId: string | null;
  mediaUrl: string;
  status: string;
  notes: string;
  thumbnail: string | null;
  derivedFromId: string | null;
  fileSize: string;
  createdById: string | null;
  createdAt: string;
}

export function useVersions(entityId?: string, entityType?: "shot" | "asset") {
  return useQuery<VersionDTO[]>({
    queryKey: ["versions", entityId ?? "all", entityType ?? "all"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (entityId) params.set("entityId", entityId);
      if (entityType) params.set("entityType", entityType);
      const qs = params.toString();
      return apiClient.get<VersionDTO[]>(`/versions${qs ? `?${qs}` : ""}`);
    },
    staleTime: 10000,
  });
}

export function useUpdateVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<VersionDTO>) =>
      apiClient.put<VersionDTO>(`/versions/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["versions"] }),
  });
}
