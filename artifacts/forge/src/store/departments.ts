import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEPARTMENTS, Department } from "@/data/mockData";

// Mirrors useUserStore (see store/users.ts) -- DEPARTMENTS is mutated in
// place by fetchMe() but that alone never triggers a re-render, so this
// reactive store is what real department data actually needs to be read
// through. Kept separate from useDepartmentPipelineStore below (that one
// is UI ordering state, this one is the department roster itself).
interface DepartmentState {
  departments: Department[];
  setDepartments: (departments: Department[]) => void;
}

export const useDepartmentStore = create<DepartmentState>()((set) => ({
  departments: DEPARTMENTS,
  setDepartments: (departments) => set({ departments }),
}));

const DEFAULT_PIPELINE_ORDER = DEPARTMENTS.filter((d) => d.pipelineOrder > 0)
  .sort((a, b) => a.pipelineOrder - b.pipelineOrder)
  .map((d) => d.id);

interface DepartmentPipelineState {
  /**
   * Ordered department ids for the "Pipeline Flow" strip on the Departments
   * page. Previously the reorder done via "Customize Here" lived only in
   * local component state and reset back to the mockData default on every
   * navigation/reload. Persisting it here is what makes the reorder real.
   */
  pipelineOrder: string[];
  setPipelineOrder: (order: string[]) => void;
  moveInPipeline: (deptId: string, direction: "left" | "right") => void;
  resetPipelineOrder: () => void;
}

export const useDepartmentPipelineStore = create<DepartmentPipelineState>()(
  persist(
    (set) => ({
      pipelineOrder: DEFAULT_PIPELINE_ORDER,
      setPipelineOrder: (order) => set({ pipelineOrder: order }),
      moveInPipeline: (deptId, direction) =>
        set((state) => {
          const idx = state.pipelineOrder.indexOf(deptId);
          if (idx === -1) return state;
          const swapWith = direction === "left" ? idx - 1 : idx + 1;
          if (swapWith < 0 || swapWith >= state.pipelineOrder.length)
            return state;
          const next = [...state.pipelineOrder];
          [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
          return { pipelineOrder: next };
        }),
      resetPipelineOrder: () => set({ pipelineOrder: DEFAULT_PIPELINE_ORDER }),
    }),
    {
      name: "forge-department-pipeline-storage",
    },
  ),
);
