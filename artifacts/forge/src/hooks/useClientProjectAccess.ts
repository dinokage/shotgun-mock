import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, apiFetch } from "@/lib/apiClient";

export interface ClientProjectAccessDTO {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  projectId: string;
  projectName: string | null;
  grantedByUserId: string;
  createdAt: string;
}

// Tenant-wide list -- callers filter to the project they care about. There's
// no per-project GET on the backend since the grant count per tenant is
// small (one row per client-project pairing) and every consumer already
// needs the full list to render a "who else has access" picture.
export function useClientProjectAccess() {
  return useQuery<ClientProjectAccessDTO[]>({
    queryKey: ["client-project-access"],
    queryFn: () => apiFetch<ClientProjectAccessDTO[]>("/client-project-access"),
    staleTime: 30000,
  });
}

export function useGrantClientProjectAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { userId: string; projectId: string }) =>
      apiClient.post<ClientProjectAccessDTO>("/client-project-access", body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["client-project-access"] }),
  });
}

export function useRevokeClientProjectAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete<void>(`/client-project-access/${id}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["client-project-access"] }),
  });
}
