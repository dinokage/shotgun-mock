import { create } from 'zustand';
import type { Role } from '@/data/mockData';

interface WorkspaceState {
  currentRole: Role;
  currentStudioId: string;
  currentProjectId: string | null;
  setRole: (role: Role) => void;
  setStudio: (studioId: string) => void;
  setProject: (projectId: string | null) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  currentRole: 'manager',
  currentStudioId: 'studio1',
  currentProjectId: null,
  setRole: (role) => set({ currentRole: role }),
  setStudio: (studioId) => set({ currentStudioId: studioId }),
  setProject: (projectId) => set({ currentProjectId: projectId }),
}));
