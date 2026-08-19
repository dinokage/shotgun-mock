import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WorkspaceState {
  currentStudioId: string;
  currentProjectId: string | null;
  /**
   * Department a global role (producer/manager) has scoped their view to via
   * the TopBar "Switch Department" switcher. `null` means Global Overview
   * (all departments) — the default. Department-scoped roles never see the
   * switcher and always see their own department regardless of this value.
   */
  activeDepartmentId: string | null;
  setStudio: (studioId: string) => void;
  setProject: (projectId: string | null) => void;
  setActiveDepartment: (departmentId: string | null) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      currentStudioId: 'studio1',
      currentProjectId: null,
      activeDepartmentId: null,
      setStudio: (studioId) => set({ currentStudioId: studioId }),
      setProject: (projectId) => set({ currentProjectId: projectId }),
      setActiveDepartment: (departmentId) => set({ activeDepartmentId: departmentId }),
    }),
    {
      name: 'workspace-storage',
    }
  )
);
