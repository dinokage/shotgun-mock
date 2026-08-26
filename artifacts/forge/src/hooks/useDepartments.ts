import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";

export interface DepartmentDTO {
  id: string;
  tenantId: string;
  name: string;
  abbr: string;
  pipeline: string;
  pipelineOrder: number;
  color: string | null;
  icon: string | null;
  createdAt: string;
}

export function useDepartments() {
  return useQuery<DepartmentDTO[]>({
    queryKey: ["departments"],
    queryFn: () => apiFetch<DepartmentDTO[]>("/departments"),
    staleTime: 60000,
  });
}
