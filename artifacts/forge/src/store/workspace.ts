import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WorkspaceState {
  currentStudioId: string;
  currentProjectId: string | null;
  setStudio: (studioId: string) => void;
  setProject: (projectId: string | null) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      currentStudioId: 'studio1',
      currentProjectId: null,
      setStudio: (studioId) => set({ currentStudioId: studioId }),
      setProject: (projectId) => set({ currentProjectId: projectId }),
    }),
    {
      name: 'workspace-storage',
    }
  )
);
