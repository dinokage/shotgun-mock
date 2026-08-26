import { create } from "zustand";
import { apiFetch } from "@/lib/apiClient";

import {
  User as UserDTO,
  PROJECTS,
  USERS,
  TASKS,
  ASSETS,
  SHOTS,
  DEPARTMENTS,
} from "@/data/mockData";

interface AuthState {
  currentUser: UserDTO | null;
  isAuthenticated: boolean;
  loginError: string | null;
  isInitializing: boolean;
  fetchMe: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  currentUser: null,
  isAuthenticated: false,
  loginError: null,
  isInitializing: true,

  fetchMe: async () => {
    try {
      const response = await apiFetch<any>("/auth/me");
      const user = response.user;

      // HYDRATE ALL MOCK ARRAYS FROM BACKEND SO THE APP JUST WORKS
      const [projects, users, tasks, assets, shots, deps] = await Promise.all([
        apiFetch("/projects").catch(() => []),
        apiFetch("/users").catch(() => []),
        apiFetch("/tasks").catch(() => []),
        apiFetch("/assets").catch(() => []),
        apiFetch("/shots").catch(() => []),
        apiFetch("/departments").catch(() => []),
      ]);

      if (projects.length > 0) {
        PROJECTS.length = 0;
        PROJECTS.push(...projects);
      }
      if (users.length > 0) {
        USERS.length = 0;
        USERS.push(...(users as any));
      }
      if (tasks.length > 0) {
        TASKS.length = 0;
        TASKS.push(...tasks);
      }
      if (assets.length > 0) {
        ASSETS.length = 0;
        ASSETS.push(...assets);
      }
      if (shots.length > 0) {
        SHOTS.length = 0;
        SHOTS.push(...shots);
      }
      if (deps.length > 0) {
        // The API's department rows (id/tenantId/name/abbr/pipeline/
        // pipelineOrder/color/icon/createdAt) don't match the mock
        // Department shape's field names (abbreviation/description/
        // studioId/supervisorId/leadId) -- pushing them through untranslated
        // left every consumer of those mock-only fields silently reading
        // undefined. Normalize here, once, the same way mockData.ts's own
        // generator derives supervisorId/leadId from each department's real
        // members (this runs after USERS is hydrated above, so `.role` is
        // already populated).
        const normalizedDeps = (deps as any[]).map((d) => {
          const producer = USERS.find(
            (u: any) => u.departmentId === d.id && u.role === "producer",
          );
          const lead = USERS.find(
            (u: any) => u.departmentId === d.id && u.role === "lead",
          );
          return {
            id: d.id,
            name: d.name,
            abbreviation: d.abbr,
            color: d.color,
            supervisorId: producer?.id || "",
            leadId: lead?.id || producer?.id || "",
            studioId: d.tenantId,
            description: `${d.pipeline} pipeline`,
            icon: d.icon,
            pipeline: d.pipeline,
            pipelineOrder: d.pipelineOrder,
          };
        });
        DEPARTMENTS.length = 0;
        DEPARTMENTS.push(...normalizedDeps);
      }

      // Hydrate stores (ignoring those that don't have direct setters if any,
      // but tasks/assets/shots do have them, we can import them dynamically to avoid circular deps)
      import("./projects").then((m) =>
        m.useProjectStore.getState().setProjects?.(projects),
      );
      import("./tasks").then((m) =>
        m.useTasksStore.getState().setTasks?.(tasks),
      );
      import("./assets").then((m) =>
        m.useAssetStore.getState().setAssets?.(assets),
      );
      import("./shots").then((m) =>
        m.useShotStore.getState().setShots?.(shots),
      );

      set({ currentUser: user, isAuthenticated: true, isInitializing: false });
    } catch {
      set({ currentUser: null, isAuthenticated: false, isInitializing: false });
    }
  },

  login: async (email, password) => {
    try {
      set({ loginError: null });
      await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const response = await apiFetch<any>("/auth/me");
      set({
        currentUser: response.user,
        isAuthenticated: true,
        loginError: null,
      });
      return true;
    } catch (error: any) {
      set({ loginError: error.message || "Invalid email or password." });
      return false;
    }
  },

  logout: async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } finally {
      set({ currentUser: null, isAuthenticated: false, loginError: null });
      // In a real app we'd clear query caches too, but a page reload is often cleaner.
      window.location.href = "/login";
    }
  },

  clearError: () => set({ loginError: null }),
}));
