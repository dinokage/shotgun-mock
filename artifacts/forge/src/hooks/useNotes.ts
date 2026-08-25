import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/apiClient';
export function useNotes(parentType: string, parentId: string) {
  return useQuery({
    queryKey: ['notes', parentType, parentId],
    queryFn: async () => (await apiFetch<{ notes: any[] }>(`/api/notes?parentType=${parentType}&parentId=${parentId}`)).notes,
    enabled: Boolean(parentId),
  });
}
export function useAddNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { parentType: string; parentId: string; body: string; replyToId: string | null }) =>
      apiFetch('/api/notes', { method: 'POST', body: JSON.stringify(vars) }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['notes', vars.parentType, vars.parentId] }),
  });
}
