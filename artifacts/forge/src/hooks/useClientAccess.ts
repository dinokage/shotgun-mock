import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";

export interface ClientAccessLinkDTO {
  id: string;
  tenantId: string;
  code: string;
  projectId: string | null;
  episodeId: string | null;
  versionId: string | null;
  createdByUserId: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** Exactly one of these three should be set -- the narrowest scope wins. */
export interface ClientAccessScope {
  projectId?: string;
  episodeId?: string;
  versionId?: string;
}

export function useClientAccessLinks(scope: ClientAccessScope) {
  const { projectId, episodeId, versionId } = scope;
  return useQuery<ClientAccessLinkDTO[]>({
    queryKey: ["client-access-links", projectId, episodeId, versionId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (projectId) params.set("projectId", projectId);
      if (episodeId) params.set("episodeId", episodeId);
      if (versionId) params.set("versionId", versionId);
      return apiClient.get<ClientAccessLinkDTO[]>(`/client-access?${params.toString()}`);
    },
    enabled: !!(projectId || episodeId || versionId),
    staleTime: 5000,
  });
}

/** Creates a link, or returns the existing still-valid one for the same scope. */
export function useCreateClientAccessLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scope: ClientAccessScope & { expiresAt?: string }) =>
      apiClient.post<ClientAccessLinkDTO>("/client-access", scope),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["client-access-links"] }),
  });
}

export function useRevokeClientAccessLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/client-access/${id}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["client-access-links"] }),
  });
}
