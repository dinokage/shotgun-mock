import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, apiFetch } from "@/lib/apiClient";

export interface NotificationDTO {
  id: string;
  tenantId: string;
  recipientUserId: string;
  category: string;
  title: string;
  description: string;
  entityType: string | null;
  entityId: string | null;
  actionUrl: string | null;
  read: boolean;
  createdAt: string;
}

// Polled every 10s (not pushed) -- the simplest real cross-user delivery
// mechanism without standing up websockets. This is the actual backend
// (routes/notifications.ts, populated by auth.ts's login ping,
// tasks.ts's review-stage handoffs, and sequenceReassignment.ts) --
// store/notifications.ts is a *different*, per-browser-only localStorage
// store that never talks to the server at all; it looked like the real
// notification system but couldn't ever show another user's activity.
export function useNotifications() {
  return useQuery<NotificationDTO[]>({
    queryKey: ["notifications"],
    queryFn: () => apiFetch<NotificationDTO[]>("/notifications"),
    refetchInterval: 10000,
    staleTime: 5000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.patch<NotificationDTO>(`/notifications/${id}/read`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<{ ok: true }>("/notifications/read-all", {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
