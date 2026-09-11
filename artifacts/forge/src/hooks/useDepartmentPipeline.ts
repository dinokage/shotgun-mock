import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import type { DepartmentDTO } from "@/hooks/useDepartments";

/**
 * The studio-wide "Pipeline Flow" order, i.e. the departments that sit on the
 * pipeline at all (pipelineOrder 0 is studio overhead like Production
 * Management and is deliberately left out of the strip).
 */
export function pipelineDepartmentOrder(departments: DepartmentDTO[]): DepartmentDTO[] {
  return departments
    .filter((d) => d.pipelineOrder > 0)
    .sort((a, b) => a.pipelineOrder - b.pipelineOrder);
}

/**
 * Writes Department.pipelineOrder for the whole strip. Optimistic because the
 * reorder arrows read back out of the very cache this rewrites — without it
 * each click would visibly lag a round trip.
 */
export function useReorderDepartments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (departmentIds: string[]) =>
      apiClient.put<DepartmentDTO[]>("/departments/order", { departmentIds }),
    onMutate: async (departmentIds) => {
      await queryClient.cancelQueries({ queryKey: ["departments"] });
      const previous = queryClient.getQueryData<DepartmentDTO[]>(["departments"]);
      if (previous) {
        queryClient.setQueryData<DepartmentDTO[]>(
          ["departments"],
          previous.map((d) => {
            const index = departmentIds.indexOf(d.id);
            return index === -1 ? d : { ...d, pipelineOrder: index + 1 };
          }),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous)
        queryClient.setQueryData(["departments"], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
  });
}
