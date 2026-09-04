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
  VERSIONS,
  REVIEWS,
} from "@/data/mockData";
import { hashString } from "@/lib/seededMock";

interface AuthState {
  currentUser: UserDTO | null;
  tenantName: string | null;
  isAuthenticated: boolean;
  loginError: string | null;
  isInitializing: boolean;
  fetchMe: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
  updateCurrentUser: (updates: Partial<UserDTO>) => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  currentUser: null,
  tenantName: null,
  isAuthenticated: false,
  loginError: null,
  isInitializing: true,

  fetchMe: async () => {
    try {
      const response = await apiFetch<any>("/auth/me");
      const user = response.user;

      // HYDRATE ALL MOCK ARRAYS FROM BACKEND SO THE APP JUST WORKS
      const [projects, users, tasks, assets, shots, deps, versions, reviews] =
        await Promise.all([
          apiFetch("/projects").catch(() => []),
          apiFetch("/users").catch(() => []),
          apiFetch("/tasks").catch(() => []),
          apiFetch("/assets").catch(() => []),
          apiFetch("/shots").catch(() => []),
          apiFetch("/departments").catch(() => []),
          apiFetch("/versions").catch(() => []),
          apiFetch("/reviews").catch(() => []),
        ]);

      // Always sync these mock arrays to match the real API response,
      // including when it's empty (e.g. right after an admin data reset) --
      // an `if (arr.length > 0)` guard here would mean the API's true empty
      // state could never overwrite whatever this array held from an
      // earlier session, leaving stale data on screen indefinitely.
      PROJECTS.length = 0;
      PROJECTS.push(...projects);
      USERS.length = 0;
      USERS.push(...(users as any));
      TASKS.length = 0;
      TASKS.push(...tasks);
      ASSETS.length = 0;
      ASSETS.push(...assets);
      SHOTS.length = 0;
      SHOTS.push(...shots);
      {
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

      // REVIEWS's real/mock field shapes already line up exactly
      // (lib/db/src/schema/reviews.ts mirrors mockData.ts's Review
      // interface field-for-field) -- no translation needed, unlike
      // departments above.
      REVIEWS.length = 0;
      REVIEWS.push(...(reviews as any));

      // VERSIONS needs light normalization: the real API has `thumbnail`
      // (a URL or null) where the mock shape has `thumbnailSeed` (a number
      // used to generate a placeholder image) -- derive a stable numeric
      // seed from the real id so placeholder rendering still works. The
      // real schema's `status` column defaults to "pending_review", which
      // isn't one of the mock enum's four values ("pending" is) -- map it
      // so status-based UI (badges/filters) doesn't silently fail to match.
      const normalizedVersions = (versions as any[]).map((v) => ({
        ...v,
        thumbnailSeed: hashString(v.id),
        status: v.status === "pending_review" ? "pending" : v.status,
      }));
      VERSIONS.length = 0;
      VERSIONS.push(...normalizedVersions);

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
      import("./users").then((m) =>
        m.useUserStore.getState().setUsers(users as any),
      );
      import("./departments").then((m) =>
        m.useDepartmentStore.getState().setDepartments(DEPARTMENTS.slice()),
      );
      import("./reviews").then((m) => {
        m.useReviewStore.getState().setReviews(REVIEWS.slice());
        m.useReviewStore.getState().setVersions(normalizedVersions);
      });

      set({
        currentUser: user,
        tenantName: response.tenant?.name ?? null,
        isAuthenticated: true,
        isInitializing: false,
      });
    } catch {
      set({
        currentUser: null,
        tenantName: null,
        isAuthenticated: false,
        isInitializing: false,
      });
    }
  },

  login: async (email, password) => {
    try {
      set({ loginError: null });
      await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      // Route through fetchMe() rather than duplicating its GET /auth/me +
      // set({...}) so login also runs the mock-array/store hydration block --
      // otherwise every page renders stale/seeded data until a hard refresh.
      await get().fetchMe();
      if (!get().isAuthenticated) {
        set({ loginError: "Invalid email or password." });
        return false;
      }
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
      set({
        currentUser: null,
        tenantName: null,
        isAuthenticated: false,
        loginError: null,
      });
      // In a real app we'd clear query caches too, but a page reload is often cleaner.
      window.location.href = "/login";
    }
  },

  clearError: () => set({ loginError: null }),

  // After a self-service profile edit (PATCH /users/me), merge the returned
  // fields straight into currentUser AND the mutable mock USERS array --
  // most pages (TopBar, profile.tsx) read name/title/avatar from one of
  // those two places rather than from a react-query cache, so a plain
  // ["users"] invalidation alone wouldn't be reflected until the next
  // full fetchMe().
  updateCurrentUser: (updates) =>
    set((state) => {
      if (!state.currentUser) return state;
      const updatedUser = { ...state.currentUser, ...updates };
      const idx = USERS.findIndex((u) => u.id === updatedUser.id);
      if (idx !== -1) {
        USERS[idx] = { ...USERS[idx], ...updates };
      }
      return { currentUser: updatedUser };
    }),
}));
