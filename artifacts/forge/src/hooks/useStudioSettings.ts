import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";

export type StudioSettingKey =
  | "studio_profile"
  | "security_policy"
  | "pipeline_stages"
  | "pipeline_paths";

export interface StudioSettingResponse<T> {
  key: StudioSettingKey;
  // null when nobody has saved this key yet -- the caller renders an empty
  // form rather than inventing studio details.
  value: T | null;
  updatedAt: string | null;
  updatedById: string | null;
}

export function useStudioSetting<T>(key: StudioSettingKey, enabled = true) {
  return useQuery<StudioSettingResponse<T>>({
    queryKey: ["studio-setting", key],
    queryFn: () => apiClient.get<StudioSettingResponse<T>>(`/studio-settings/${key}`),
    enabled,
    staleTime: 30000,
  });
}

export function useSaveStudioSetting<T>(key: StudioSettingKey) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: T) =>
      apiClient.put<StudioSettingResponse<T>>(`/studio-settings/${key}`, { value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["studio-setting", key] }),
  });
}

/* -------------------------------------------------------------------------- */
/* API keys                                                                    */
/* -------------------------------------------------------------------------- */

export interface ApiKeyDTO {
  id: string;
  name: string;
  tokenPrefix: string;
  createdById: string | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

// `token` is present only on the create response. There is no endpoint that
// can return it again, so the caller must show it to the user immediately.
export interface CreatedApiKeyDTO extends ApiKeyDTO {
  token: string;
}

export function useApiKeys(enabled = true) {
  return useQuery<ApiKeyDTO[]>({
    queryKey: ["api-keys"],
    queryFn: () => apiClient.get<ApiKeyDTO[]>("/api-keys"),
    enabled,
    staleTime: 30000,
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string }) => apiClient.post<CreatedApiKeyDTO>("/api-keys", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api-keys/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  });
}

/* -------------------------------------------------------------------------- */
/* Webhooks                                                                    */
/* -------------------------------------------------------------------------- */

export interface WebhookDTO {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdById: string | null;
  createdAt: string;
  lastFiredAt: string | null;
}

// Same one-shot rule as the API token: the signing secret comes back from
// create and is never retrievable afterwards.
export interface CreatedWebhookDTO extends WebhookDTO {
  secret: string;
}

export function useWebhooks(enabled = true) {
  return useQuery<WebhookDTO[]>({
    queryKey: ["webhooks"],
    queryFn: () => apiClient.get<WebhookDTO[]>("/webhooks"),
    enabled,
    staleTime: 30000,
  });
}

export function useCreateWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { url: string; events: string[] }) =>
      apiClient.post<CreatedWebhookDTO>("/webhooks", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhooks"] }),
  });
}

export function useDeleteWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/webhooks/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhooks"] }),
  });
}

/* -------------------------------------------------------------------------- */
/* License servers                                                             */
/* -------------------------------------------------------------------------- */

export interface LicenseServerDTO {
  id: string;
  name: string;
  vendor: string;
  host: string;
  port: number | null;
  seatsTotal: number;
  seatsInUse: number;
  status: string;
  updatedAt: string;
}

export function useLicenseServers(enabled = true) {
  return useQuery<LicenseServerDTO[]>({
    queryKey: ["license-servers"],
    queryFn: () => apiClient.get<LicenseServerDTO[]>("/license-servers"),
    enabled,
    staleTime: 30000,
  });
}

export function useCreateLicenseServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; vendor?: string; host?: string; seatsTotal?: number }) =>
      apiClient.post<LicenseServerDTO>("/license-servers", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["license-servers"] }),
  });
}

export function useDeleteLicenseServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/license-servers/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["license-servers"] }),
  });
}
