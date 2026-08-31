import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";

export interface AssetDTO {
  id: string;
  tenantId: string;
  projectId: string;
  episodeId: string | null;
  sequenceId: string | null;
  assigneeId: string | null;
  name: string;
  type: string;
  status: string;
  version: string;
  usdVersion: string | null;
  tags: string[];
  thumbnail: string | null;
  fileSize: string;
  polyCount: string | null;
  dependencies: string[];
  publishStatus: string;
  description: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useAssets(projectId?: string) {
  return useQuery<AssetDTO[]>({
    queryKey: ["assets", projectId ?? "all"],
    queryFn: async () =>
      apiClient.get<AssetDTO[]>(
        projectId ? `/assets?projectId=${projectId}` : "/assets",
      ),
    staleTime: 10000,
  });
}

export function useCreateAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { projectId: string; name: string; type?: string; episodeId?: string; sequenceId?: string; assigneeId?: string }) =>
      apiClient.post<AssetDTO>("/assets", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assets"] }),
  });
}

export function useUpdateAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<AssetDTO>) =>
      apiClient.put<AssetDTO>(`/assets/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assets"] }),
  });
}
