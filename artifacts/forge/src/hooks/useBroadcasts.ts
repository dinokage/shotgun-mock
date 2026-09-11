import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import type { Role } from "@/data/mockData";
import type { Broadcast } from "@/store/broadcasts";

export interface BroadcastDTO {
  id: string;
  authorId: string | null;
  authorName: string | null;
  authorRole: string | null;
  text: string;
  audience: Broadcast["audience"];
  projectId: string | null;
  severity: Broadcast["severity"];
  createdAt: string;
}

const ROLES: Role[] = [
  "admin",
  "production_head",
  "producer",
  "lead",
  "artist",
  "client",
];

export function toBroadcast(dto: BroadcastDTO): Broadcast {
  return {
    id: dto.id,
    authorId: dto.authorId,
    authorName: dto.authorName ?? "Studio",
    authorRole: ROLES.includes(dto.authorRole as Role)
      ? (dto.authorRole as Role)
      : null,
    text: dto.text,
    timestamp: dto.createdAt,
    audience: dto.audience,
    projectId: dto.projectId,
    severity: dto.severity,
  };
}

/**
 * Rows are already scoped server-side: an internal session gets the studio
 * feed, a client-access session gets only 'internal_and_client' broadcasts
 * for the project its link is scoped to. `projectId` narrows the internal
 * feed, and is what a 'client'-role account (which holds a normal session,
 * not an access link) must send to get anything back at all.
 */
export function useBroadcasts(projectId?: string | null) {
  return useQuery<BroadcastDTO[]>({
    queryKey: ["broadcasts", projectId ?? null],
    queryFn: async () =>
      apiClient.get<BroadcastDTO[]>(
        projectId
          ? `/broadcasts?projectId=${encodeURIComponent(projectId)}`
          : "/broadcasts",
      ),
    staleTime: 10000,
  });
}

// The author is taken from the session server-side, so it is deliberately
// absent from the request body.
export function useCreateBroadcast() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      text: string;
      audience: Broadcast["audience"];
      projectId: string | null;
      severity: Broadcast["severity"];
    }) => apiClient.post<BroadcastDTO>("/broadcasts", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["broadcasts"] }),
  });
}
