import { create } from "zustand";
import { persist } from "zustand/middleware";
import { PROJECTS, Project } from "@/data/mockData";

// Gradients cycle through the same palette mockData.ts uses for seeded
// projects, so a freshly-created project's card doesn't stand out as
// obviously synthetic next to the rest of the grid.
const THUMBNAIL_GRADIENTS = [
  "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(135deg, #f6d365 0%, #fda085 100%)",
  "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
  "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)",
  "linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)",
  "linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)",
  "linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)",
  "linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)",
  "linear-gradient(135deg, #cfd9df 0%, #e2ebf0 100%)",
];

export type NewProjectInput = Pick<Project, "name" | "type" | "client"> &
  Partial<Omit<Project, "name" | "type" | "client">>;

interface ProjectState {
  projects: Project[];
  setProjects: (projects: Project[]) => void;
  addProject: (project: NewProjectInput) => Promise<Project>;
  updateProject: (id: string, updates: Partial<Project>) => void;
  getProjectById: (id: string) => Project | undefined;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: PROJECTS,
      setProjects: (projects) => set({ projects }),
      addProject: async (input) => {
        const today = new Date().toISOString().split("T")[0];
        const projectData: Partial<Project> = {
          id: `p${Date.now()}`,
          progress: 0,
          status: "ON_TRACK",
          shotsCount: 0,
          assetsCount: 0,
          dueDate: input.dueDate || today,
          startDate: today,
          thumbnail:
            THUMBNAIL_GRADIENTS[
              get().projects.length % THUMBNAIL_GRADIENTS.length
            ],
          lastActivity: "just now",
          studioId: "studio1",
          description: "",
          budget: 0,
          riskScore: 10,
          ...input,
        };

        // No fallback on failure -- a fabricated local-only "success" here
        // would tell the caller (and the user) the project was created when
        // it wasn't, then silently vanish next time fetchMe() re-syncs real
        // data from the backend on login. Let the caller's own error UI
        // handle the rejection instead.
        const { apiFetch } = await import("@/lib/apiClient");
        const savedProject = await apiFetch<Project>("/projects", {
          method: "POST",
          body: JSON.stringify(projectData),
        });
        set((state) => ({ projects: [savedProject, ...state.projects] }));
        return savedProject;
      },
      updateProject: async (id, updates) => {
        // Same reasoning as addProject: no local-only fallback on failure.
        const { apiFetch } = await import("@/lib/apiClient");
        const updatedProject = await apiFetch<Project>(`/projects/${id}`, {
          method: "PUT",
          body: JSON.stringify(updates),
        });
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updatedProject } : p,
          ),
        }));
      },
      getProjectById: (id) => get().projects.find((p) => p.id === id),
    }),
    {
      name: "forge-project-storage",
    },
  ),
);
