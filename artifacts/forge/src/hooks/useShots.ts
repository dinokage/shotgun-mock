import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/apiClient';

export interface ShotDTO {
  id: string;
  name: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'review' | 'approved' | 'omitted';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  projectId: string;
  sequenceId: string | null;
  duration: number | null;
  thumbnailUrl: string | null;
  assignedToId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useShots(projectId?: string) {
  return useQuery({
    queryKey: projectId ? ['shots', 'project', projectId] : ['shots'],
    queryFn: () => apiFetch<ShotDTO[]>(projectId ? `/projects/${projectId}/shots` : '/shots'),
  });
}
