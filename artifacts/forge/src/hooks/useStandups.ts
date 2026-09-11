import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";

// Server-backed standup updates (`standup_updates`), replacing the
// localStorage-only Zustand store this page used to post into -- a per-browser
// store meant a lead never saw a single one of their artists' updates. The
// GET is already RBAC-scoped server-side (own updates / department / studio),
// matching the filter daily-standup.tsx applies to the feed.
export interface StandupUpdateDTO {
  id: string;
  tenantId: string;
  userId: string;
  taskId: string | null;
  text: string;
  hours: number;
  /** "auto" for the summary posted on logout, "manual" for a person's own post. */
  source: string;
  createdAt: string;
}

export function useStandupUpdates() {
  return useQuery<StandupUpdateDTO[]>({
    queryKey: ["standup-updates"],
    queryFn: async () => apiClient.get<StandupUpdateDTO[]>("/standup-updates"),
    staleTime: 10000,
  });
}

export function usePostStandupUpdate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { text: string; taskId?: string | null; hours?: number }) =>
      apiClient.post<StandupUpdateDTO>("/standup-updates", body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["standup-updates"] }),
  });
}
