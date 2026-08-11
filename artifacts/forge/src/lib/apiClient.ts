import { TASKS, USERS, PROJECTS, DEPARTMENTS } from '@/data/mockData';

export const apiClient = {
  get: async (endpoint: string) => {
    if (endpoint.includes('/tasks')) return TASKS;
    if (endpoint.includes('/users')) return USERS;
    if (endpoint.includes('/projects')) return PROJECTS;
    if (endpoint.includes('/departments')) return DEPARTMENTS;
    if (endpoint.includes('/standups')) return [];
    return [];
  },
  post: async (endpoint: string, data?: any) => {
    return { success: true, data };
  },
  put: async (endpoint: string, data?: any) => {
    return { success: true, data };
  },
};
