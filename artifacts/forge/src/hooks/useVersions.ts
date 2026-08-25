import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/apiClient';
export function useVersions(filter: { taskId?: string; parentType?: string; parentId?: string } = {}) {
  const params = new URLSearchParams();
  if (filter.taskId) params.set('taskId', filter.taskId);
  if (filter.parentType) params.set('parentType', filter.parentType);
  if (filter.parentId) params.set('parentId', filter.parentId);
  return useQuery({
    queryKey: ['versions', filter],
    queryFn: async () => (await apiFetch<{ versions: any[] }>(`/api/versions?${params}`)).versions,
  });
}
