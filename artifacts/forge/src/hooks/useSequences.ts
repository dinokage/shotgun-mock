import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";

export interface SequenceDTO {
  id: string;
  tenantId: string;
  projectId: string;
  episodeId: string | null;
  name: string;
  createdAt: string;
}

// GET /sequences supports optional ?projectId=&episodeId= filters
// server-side (see artifacts/api-server/src/routes/sequences.ts). Pass
// episodeId once an episode is chosen in a cascading Project -> Episode ->
// Sequence -> Shot picker to scope the list to just that episode's
// sequences; omit it to get every sequence in the project (episode-less
// projects still have sequences directly under the project).
export function useSequences(projectId?: string, episodeId?: string) {
  return useQuery<SequenceDTO[]>({
    queryKey: ["sequences", projectId ?? "all", episodeId ?? "all"],
    queryFn: () => {
      const params = new URLSearchParams();
      if (projectId) params.set("projectId", projectId);
      if (episodeId) params.set("episodeId", episodeId);
      const qs = params.toString();
      return apiFetch<SequenceDTO[]>(`/sequences${qs ? `?${qs}` : ""}`);
    },
    enabled: !!projectId,
    staleTime: 30000,
  });
}
