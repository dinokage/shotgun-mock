import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, apiFetch } from "@/lib/apiClient";

export interface TenantPluginDTO {
  pluginId: string;
  installed: boolean;
  enabled: boolean;
  installedById: string | null;
  installedAt: string;
  updatedAt: string;
}

// Only plugins this studio has actually installed come back. A catalogue entry
// with no row is genuinely uninstalled -- callers must not invent a state for it.
export function useInstalledPlugins() {
  return useQuery<TenantPluginDTO[]>({
    queryKey: ["plugins"],
    queryFn: () => apiFetch<TenantPluginDTO[]>("/plugins"),
    staleTime: 30000,
  });
}

export function useInstallPlugin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pluginId: string) => apiClient.post<TenantPluginDTO>(`/plugins/${pluginId}`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["plugins"] }),
  });
}

export function useUninstallPlugin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pluginId: string) => apiClient.delete(`/plugins/${pluginId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["plugins"] }),
  });
}

export function useSetPluginEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ pluginId, enabled }: { pluginId: string; enabled: boolean }) =>
      apiClient.patch<TenantPluginDTO>(`/plugins/${pluginId}`, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["plugins"] }),
  });
}
