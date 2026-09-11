import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, apiFetch } from "@/lib/apiClient";

// Grouping / sorting vocabulary shared with the Tracking Grid page.
export type TrackingGroupKey =
  | "none"
  | "project"
  | "episode"
  | "department"
  | "assignee"
  | "status"
  | "internalReview"
  | "clientReview";

export type TrackingSortKey =
  "hierarchy" | "shot" | "assignee" | "status" | "updated";

export interface TrackingViewFilters {
  search: string;
  projectFilter: string;
  episodeFilter?: string;
  sequenceFilter?: string;
  assigneeFilter?: string;
  positionFilter?: string;
  departmentFilter?: string;
  groupBy1: TrackingGroupKey;
  groupBy2: TrackingGroupKey;
  sortBy: TrackingSortKey;
  view: "list" | "card";
}

export interface TrackingViewDTO {
  id: string;
  name: string;
  filters: TrackingViewFilters;
  isShared: boolean;
  createdAt: string;
  ownerName: string | null;
  /** False for someone else's shared view -- rename/delete are owner-only. */
  isOwner: boolean;
}

const QUERY_KEY = ["tracking-views"];

export function useTrackingViews() {
  return useQuery<TrackingViewDTO[]>({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<TrackingViewDTO[]>("/tracking-views"),
    staleTime: 30000,
  });
}

export function useCreateTrackingView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      filters: TrackingViewFilters;
      isShared?: boolean;
    }) => apiClient.post<TrackingViewDTO>("/tracking-views", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useUpdateTrackingView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      isShared?: boolean;
    }) => apiClient.patch<TrackingViewDTO>(`/tracking-views/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useDeleteTrackingView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/tracking-views/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
