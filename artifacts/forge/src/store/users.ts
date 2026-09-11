import { create } from "zustand";
import { User } from "@/data/mockData";

// Mirrors useProjectStore/useTasksStore/useAssetStore/useShotStore: a real
// reactive store fetchMe() hydrates via setUsers(), so components that read
// live user data actually re-render when it arrives. Starts empty rather
// than seeded from mockData.ts's generated USERS array, so a page rendered
// before that hydration lands (or if it never does) shows nothing instead of
// synthetic employees that look real. The shared USERS array is still
// mutated in place by fetchMe() for legacy code that imports it directly,
// but that mutation alone never triggers a re-render -- this store is what
// makes "who's a real employee right now" reactive.
interface UserState {
  users: User[];
  setUsers: (users: User[]) => void;
}

export const useUserStore = create<UserState>()((set) => ({
  users: [],
  setUsers: (users) => set({ users }),
}));
