import { create } from "zustand";
import { Department } from "@/data/mockData";

// Mirrors useUserStore (see store/users.ts) -- DEPARTMENTS is mutated in
// place by fetchMe() but that alone never triggers a re-render, so this
// reactive store is what real department data actually needs to be read
// through. Starts empty rather than seeded from mockData.ts's generated
// DEPARTMENTS array, so nothing synthetic renders before that hydration
// lands.
interface DepartmentState {
  departments: Department[];
  setDepartments: (departments: Department[]) => void;
}

export const useDepartmentStore = create<DepartmentState>()((set) => ({
  departments: [],
  setDepartments: (departments) => set({ departments }),
}));
