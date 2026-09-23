import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import { useAuthStore } from "@/store/auth";

export interface ShotDTO {
  id: string;
  tenantId: string;
  projectId: string;
  episodeId: string | null;
  sequenceId: string | null;
  assigneeId: string | null;
  name: string;
  status: string;
  frameRange: string;
  duration: number;
  complexity: string;
  currentVersion: string;
  usdVersion: string | null;
  internalReviewStatus: string;
  clientReviewStatus: string;
  thumbnail: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export function useShots(projectId?: string) {
  return useQuery<ShotDTO[]>({
    queryKey: ["shots", projectId ?? "all"],
    queryFn: async () =>
      apiClient.get<ShotDTO[]>(
        projectId ? `/shots?projectId=${projectId}` : "/shots",
      ),
    staleTime: 10000,
  });
}

export function useCreateShot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { projectId: string; name: string; episodeId?: string; sequenceId?: string; assigneeId?: string }) =>
      apiClient.post<ShotDTO>("/shots", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shots"] });
      // DashboardTab/EpisodesTab/AssetsTab/the Tracking Grid all read shots
      // from useShotStore (Zustand), not this React Query cache -- without
      // this they wouldn't see a newly-created shot until the app's own
      // 10-second background poll caught up.
      useAuthStore.getState().fetchMe();
    },
  });
}

export function useUpdateShot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<ShotDTO>) =>
      apiClient.put<ShotDTO>(`/shots/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shots"] });
      useAuthStore.getState().fetchMe();
    },
  });
}
