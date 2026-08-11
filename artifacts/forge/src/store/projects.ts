import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PROJECTS, Project } from '@/data/mockData';

interface ProjectState {
  projects: Project[];
  setProjects: (projects: Project[]) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  getProjectById: (id: string) => Project | undefined;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: PROJECTS,
      setProjects: (projects) => set({ projects }),
      updateProject: (id, updates) =>
        set((state) => ({
          projects: state.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        })),
      getProjectById: (id) => get().projects.find((p) => p.id === id),
    }),
    {
      name: 'forge-project-storage',
    }
  )
);
