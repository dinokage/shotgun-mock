import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";

export interface SequenceDTO {
  id: string;
  tenantId: string;
  projectId: string;
  episodeId: string | null;
  name: string;
  createdAt: string;
}

// GET /sequences supports optional ?projectId=&episodeId= filters
// server-side (see artifacts/api-server/src/routes/sequences.ts). Pass
// episodeId once an episode is chosen in a cascading Project -> Episode ->
// Sequence -> Shot picker to scope the list to just that episode's
// sequences; omit it to get every sequence in the project (episode-less
// projects still have sequences directly under the project).
export function useSequences(projectId?: string, episodeId?: string) {
  return useQuery<SequenceDTO[]>({
    queryKey: ["sequences", projectId ?? "all", episodeId ?? "all"],
    queryFn: () => {
      const params = new URLSearchParams();
      if (projectId) params.set("projectId", projectId);
      if (episodeId) params.set("episodeId", episodeId);
      const qs = params.toString();
      return apiFetch<SequenceDTO[]>(`/sequences${qs ? `?${qs}` : ""}`);
    },
    enabled: !!projectId,
    staleTime: 30000,
  });
}

// Tenant-wide, unfiltered -- see useAllEpisodes for why (Tracking Grid
// resolving real sequence names across every project at once).
export function useAllSequences() {
  return useQuery<SequenceDTO[]>({
    queryKey: ["sequences", "all", "all"],
    queryFn: () => apiFetch<SequenceDTO[]>("/sequences"),
    staleTime: 30000,
  });
}

export function useCreateSequence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { projectId: string; episodeId?: string; name: string }) =>
      apiFetch<SequenceDTO>("/sequences", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (_, variables) =>
      queryClient.invalidateQueries({
        queryKey: ["sequences", variables.projectId],
      }),
  });
}

export interface SequenceTeamMemberDTO {
  id: string;
  userId: string;
  joinedAt: string;
  name: string;
  avatar: string | null;
  departmentId: string | null;
}

// Self-service "who's working this sequence" roster -- an artist joins or
// leaves on their own (routes/sequences.ts's POST/DELETE .../team), no
// lead/PM assignment step. This is also what the early-completion
// auto-reassignment feature reads to find who just freed up.
export function useSequenceTeam(sequenceId: string | undefined) {
  return useQuery<SequenceTeamMemberDTO[]>({
    queryKey: ["sequence-team", sequenceId ?? "none"],
    queryFn: () => apiFetch<SequenceTeamMemberDTO[]>(`/sequences/${sequenceId}/team`),
    enabled: !!sequenceId,
    staleTime: 15000,
  });
}

export function useJoinSequenceTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sequenceId: string) =>
      apiFetch<SequenceTeamMemberDTO>(`/sequences/${sequenceId}/team`, {
        method: "POST",
      }),
    onSuccess: (_, sequenceId) =>
      queryClient.invalidateQueries({ queryKey: ["sequence-team", sequenceId] }),
  });
}

export function useLeaveSequenceTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sequenceId: string) =>
      apiFetch(`/sequences/${sequenceId}/team/me`, { method: "DELETE" }),
    onSuccess: (_, sequenceId) =>
      queryClient.invalidateQueries({ queryKey: ["sequence-team", sequenceId] }),
  });
}
