import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";

export interface EpisodeDTO {
  id: string;
  tenantId: string;
  projectId: string;
  name: string;
  createdAt: string;
}

// GET /episodes supports an optional ?projectId= filter server-side (see
// artifacts/api-server/src/routes/episodes.ts) -- pass it to scope the
// picker to the project already selected upstream in the same form.
export function useEpisodes(projectId?: string) {
  return useQuery<EpisodeDTO[]>({
    queryKey: ["episodes", projectId ?? "all"],
    queryFn: () =>
      apiFetch<EpisodeDTO[]>(
        projectId ? `/episodes?projectId=${projectId}` : "/episodes",
      ),
    enabled: !!projectId,
    staleTime: 30000,
  });
}

export function useCreateEpisode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { projectId: string; name: string }) =>
      apiFetch<EpisodeDTO>("/episodes", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (_, variables) =>
      queryClient.invalidateQueries({
        queryKey: ["episodes", variables.projectId],
      }),
  });
}
