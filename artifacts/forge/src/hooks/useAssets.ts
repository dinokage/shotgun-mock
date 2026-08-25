import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
export interface AssetDTO {
  id: string;
  projectId: string;
  name: string;
  type: string;
  status: string;
}
export function useAssets(filter: { projectId?: string } = {}) {
  const params = new URLSearchParams();
  if (filter.projectId) params.set("projectId", filter.projectId);
  return useQuery<AssetDTO[]>({
    queryKey: ["assets", filter],
    queryFn: async () =>
      (await apiFetch<{ assets: AssetDTO[] }>(`/api/assets?${params}`)).assets,
  });
}
