import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";

export type IntegrationStatus = "connected" | "warning" | "disconnected";

export interface IntegrationDTO {
  id: string;
  provider: string;
  displayName: string;
  status: IntegrationStatus;
  config: Record<string, unknown>;
  autoSync: boolean;
  lastSyncAt: string | null;
  connectedById: string | null;
  createdAt: string;
}

// Only providers the studio has actually connected have a row. A DCC with no
// row is genuinely disconnected -- callers must not invent a state for it.
export function useIntegrations() {
  return useQuery<IntegrationDTO[]>({
    queryKey: ["integrations"],
    queryFn: () => apiClient.get<IntegrationDTO[]>("/integrations"),
    staleTime: 15000,
  });
}

export function useSaveIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      provider,
      ...body
    }: {
      provider: string;
      displayName: string;
      status?: IntegrationStatus;
      autoSync?: boolean;
      config?: Record<string, unknown>;
    }) => apiClient.put<IntegrationDTO>(`/integrations/${provider}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["integrations"] }),
  });
}

export function useSyncIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ provider, displayName }: { provider: string; displayName: string }) =>
      apiClient.post<IntegrationDTO>(`/integrations/${provider}/sync`, { displayName }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["integrations"] }),
  });
}
