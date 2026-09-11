import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";

// Server-backed deliveries (`deliveries` / `delivery_items` /
// `delivery_downloads`), replacing the localStorage-only Zustand store. A
// delivery that only existed in the producer's browser could never be
// redeemed from the recipient's machine, so every emailed link failed.

export interface DeliveryItemDTO {
  id: string;
  entityType: string | null;
  entityId: string | null;
  versionId: string | null;
  fileName: string;
  fileSize: string;
  mediaUrl: string;
}

export interface DeliveryDTO {
  id: string;
  projectId: string | null;
  name: string;
  notes: string;
  accessCode: string;
  status: string;
  createdById: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  projectName: string | null;
  clientName: string | null;
  createdByName: string | null;
  items: DeliveryItemDTO[];
  downloadCount: number;
}

/** What POST /deliveries/redeem hands an external recipient — this one
 * delivery and nothing else in the tenant: no accessCode echo, no tenant or
 * project ids, no other deliveries. */
export interface RedeemedDeliveryDTO {
  id: string;
  name: string;
  notes: string;
  status: string;
  createdAt: string;
  expiresAt: string | null;
  projectName: string | null;
  clientName: string | null;
  createdByName: string | null;
  items: DeliveryItemDTO[];
}

/** Expiry is computed from the clock, never from a stored flag that could
 * drift out of sync with it — the server applies the same rule on redeem. */
export function isDeliveryExpired(delivery: {
  expiresAt: string | null;
}): boolean {
  return (
    delivery.expiresAt !== null &&
    new Date(delivery.expiresAt).getTime() < Date.now()
  );
}

export function isDeliveryActive(delivery: {
  status: string;
  expiresAt: string | null;
}): boolean {
  return delivery.status === "active" && !isDeliveryExpired(delivery);
}

/**
 * Shot statuses finished enough to hand over. `approved`/`published` are the
 * ideal case; `complete` is the closest available proxy for "internally
 * finished" and is what most finished shots actually carry.
 */
export const DELIVERY_ELIGIBLE_STATUSES = [
  "complete",
  "approved",
  "published",
] as const;

export function useDeliveries(projectId?: string) {
  return useQuery<DeliveryDTO[]>({
    queryKey: ["deliveries", projectId ?? "all"],
    queryFn: () =>
      apiClient.get<DeliveryDTO[]>(
        projectId ? `/deliveries?projectId=${projectId}` : "/deliveries",
      ),
    staleTime: 10000,
  });
}

export function useDelivery(id: string | null) {
  return useQuery<DeliveryDTO>({
    queryKey: ["delivery", id],
    queryFn: () => apiClient.get<DeliveryDTO>(`/deliveries/${id}`),
    enabled: !!id,
  });
}

export function useCreateDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      projectId: string;
      name: string;
      notes?: string;
      expiresAt?: string | null;
      shotIds: string[];
    }) => apiClient.post<DeliveryDTO>("/deliveries", body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["deliveries"] }),
  });
}

export function useUpdateDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      notes?: string;
      expiresAt?: string | null;
    }) => apiClient.patch<DeliveryDTO>(`/deliveries/${id}`, body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["deliveries"] }),
  });
}

export function useRevokeDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<DeliveryDTO>(`/deliveries/${id}/revoke`, {}),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["deliveries"] }),
  });
}

export function useReactivateDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<DeliveryDTO>(`/deliveries/${id}/reactivate`, {}),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["deliveries"] }),
  });
}

export function useAddDeliveryItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, shotIds }: { id: string; shotIds: string[] }) =>
      apiClient.post<DeliveryDTO>(`/deliveries/${id}/items`, { shotIds }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["deliveries"] }),
  });
}

export function useRemoveDeliveryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, itemId }: { id: string; itemId: string }) =>
      apiClient.delete(`/deliveries/${id}/items/${itemId}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["deliveries"] }),
  });
}

/** Public, unauthenticated — the access code is the only credential, and the
 * delivery id from the URL is checked against it server-side so a code can
 * only ever open the package it was minted for. */
export function useRedeemDelivery() {
  return useMutation({
    mutationFn: ({ id, code }: { id: string; code: string }) =>
      apiClient.post<RedeemedDeliveryDTO>("/deliveries/redeem", { id, code }),
  });
}

/** Records a real DeliveryDownload row so the studio's download count
 * reflects what the recipient actually took. */
export function useRecordDeliveryDownload() {
  return useMutation({
    mutationFn: ({ code, itemId }: { code: string; itemId?: string }) =>
      apiClient.post<{ downloadCount: number }>("/deliveries/redeem/download", {
        code,
        itemId,
      }),
  });
}
