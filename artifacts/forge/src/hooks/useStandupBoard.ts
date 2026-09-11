import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";

// Server-backed dailies playlist + feed approvals (`standup_playlist_items`,
// `standup_approvals`), replacing the localStorage-only Zustand store these
// lived in — a per-browser playlist meant every person in a dailies session
// saw a different list in a different order.
export interface StandupPlaylistItemDTO {
  id: string;
  tenantId: string;
  taskId: string;
  sortOrder: number;
  addedById: string | null;
  createdAt: string;
}

export interface StandupApprovalDTO {
  feedItemId: string;
  userId: string;
}

const PLAYLIST_KEY = ["standup-playlist"];
const APPROVALS_KEY = ["standup-approvals"];

export function useStandupPlaylist() {
  return useQuery<StandupPlaylistItemDTO[]>({
    queryKey: PLAYLIST_KEY,
    queryFn: async () =>
      apiClient.get<StandupPlaylistItemDTO[]>("/standup-playlist"),
    staleTime: 10000,
  });
}

export function useAddToStandupPlaylist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) =>
      apiClient.post<StandupPlaylistItemDTO>("/standup-playlist", { taskId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PLAYLIST_KEY }),
  });
}

export function useRemoveFromStandupPlaylist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) =>
      apiClient.delete(`/standup-playlist/${taskId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PLAYLIST_KEY }),
  });
}

export function useReorderStandupPlaylist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskIds: string[]) =>
      apiClient.put<StandupPlaylistItemDTO[]>("/standup-playlist/order", {
        taskIds,
      }),
    onSuccess: (rows) => queryClient.setQueryData(PLAYLIST_KEY, rows),
  });
}

export function useClearStandupPlaylist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete("/standup-playlist"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PLAYLIST_KEY }),
  });
}

export function useStandupApprovals() {
  return useQuery<StandupApprovalDTO[]>({
    queryKey: APPROVALS_KEY,
    queryFn: async () =>
      apiClient.get<StandupApprovalDTO[]>("/standup-approvals"),
    staleTime: 10000,
  });
}

// The approving user is taken from the session server-side, so there is
// nothing but the feed item to send.
export function useToggleStandupApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (feedItemId: string) =>
      apiClient.post<{ feedItemId: string; approved: boolean }>(
        "/standup-approvals/toggle",
        { feedItemId },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: APPROVALS_KEY }),
  });
}
