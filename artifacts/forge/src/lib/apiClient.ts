import { TASKS, USERS, PROJECTS, DEPARTMENTS } from '@/data/mockData';

// NOT a real HTTP client — get() switches over in-memory mock arrays and
// post()/put() always resolve { success: true } regardless of payload. Used
// by only a couple of call sites today; almost every zustand store in
// src/store instead holds its own mock array directly and mutates it
// locally (see product review §4/§6/§9 — "no single swap point").
//
// The real seam already exists at @workspace/api-client-react (Orval-
// generated from lib/api-spec/openapi.yaml). As of this pass that spec only
// defines a health check — there's no real endpoint contract to build
// against yet. Once the backend defines routes there, each store's action
// creators should be individually rewritten to call the generated hooks
// instead of mutating their local mock array; this file should be deleted
// at that point rather than "upgraded" into a real client.
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
