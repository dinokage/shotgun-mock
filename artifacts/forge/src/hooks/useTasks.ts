import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/apiClient';

export interface TaskDTO {
  id: string;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'review' | 'done';
  department: string;
  dueDate: string | null;
  shotId: string;
  assigneeId: string | null;
  projectId: string;
  createdAt: string;
  updatedAt: string;
}

export function useTasks(projectId?: string) {
  return useQuery({
    queryKey: projectId ? ['tasks', 'project', projectId] : ['tasks'],
    queryFn: () => apiFetch<TaskDTO[]>(projectId ? `/tasks?projectId=${projectId}` : '/tasks'),
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<TaskDTO> & { id: string }) => apiFetch<TaskDTO>(`/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
