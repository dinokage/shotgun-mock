import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";

// Personal access tokens for DCC plugins (Maya/Blender/Nuke) and scripts --
// distinct from Settings > API & Developer's tenant-wide "API Keys", which
// is admin-managed and still not wired into request authentication at all
// (see its "Not active yet" badge). These are self-service, per-person, and
// fully live: routes/api-tokens.ts + middleware/tenant.ts's bearer-token
// path.
export interface ApiTokenDTO {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface CreatedApiTokenDTO extends ApiTokenDTO {
  token: string;
}

export function useApiTokens() {
  return useQuery<ApiTokenDTO[]>({
    queryKey: ["api-tokens"],
    queryFn: () => apiClient.get<ApiTokenDTO[]>("/api-tokens"),
    staleTime: 30000,
  });
}

export function useCreateApiToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { label: string }) =>
      apiClient.post<CreatedApiTokenDTO>("/api-tokens", body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["api-tokens"] }),
  });
}

export function useRevokeApiToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api-tokens/${id}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["api-tokens"] }),
  });
}
