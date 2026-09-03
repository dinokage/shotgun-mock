import { create } from "zustand";
import { USERS, User } from "@/data/mockData";

// Mirrors useProjectStore/useTasksStore/useAssetStore/useShotStore: a real
// reactive store fetchMe() hydrates via setUsers(), so components that read
// live user data actually re-render when it arrives. USERS itself is still
// mutated in place by fetchMe() for legacy code that imports it directly,
// but that mutation alone never triggers a re-render -- this store is what
// makes "who's a real employee right now" reactive.
interface UserState {
  users: User[];
  setUsers: (users: User[]) => void;
}

export const useUserStore = create<UserState>()((set) => ({
  users: USERS,
  setUsers: (users) => set({ users }),
}));
