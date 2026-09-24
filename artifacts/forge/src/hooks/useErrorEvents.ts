import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";

export interface ErrorEventDTO {
  id: string;
  source: "api" | "web";
  kind: string;
  message: string;
  stack: string | null;
  path: string | null;
  method: string | null;
  statusCode: number | null;
  userId: string | null;
  userAgent: string | null;
  release: string | null;
  context: Record<string, unknown>;
  resolvedAt: string | null;
  createdAt: string;
}

export interface ErrorSummary {
  since: string;
  unresolved: number;
  groups: {
    kind: string;
    source: string;
    count: number;
    lastSeen: string | null;
  }[];
}

export function useErrorEvents(filters: {
  source?: string;
  resolved?: string;
}) {
  const params = new URLSearchParams();
  if (filters.source) params.set("source", filters.source);
  if (filters.resolved) params.set("resolved", filters.resolved);
  const qs = params.toString();
  return useQuery<ErrorEventDTO[]>({
    queryKey: ["error-events", filters.source ?? "", filters.resolved ?? ""],
    queryFn: () =>
      apiClient.get<ErrorEventDTO[]>(`/errors${qs ? `?${qs}` : ""}`),
    // Short, because the reason to have this screen open is that something is
    // going wrong right now and you want to watch it.
    refetchInterval: 15000,
  });
}

export function useErrorSummary() {
  return useQuery<ErrorSummary>({
    queryKey: ["error-summary"],
    queryFn: () => apiClient.get<ErrorSummary>("/errors/summary"),
    refetchInterval: 15000,
  });
}

export function useResolveError() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/errors/${id}/resolve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["error-events"] });
      queryClient.invalidateQueries({ queryKey: ["error-summary"] });
    },
  });
}
