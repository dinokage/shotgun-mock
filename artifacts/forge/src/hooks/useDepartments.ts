import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";

export interface DepartmentDTO {
  id: string;
  name: string;
  abbreviation: string;
  description: string;
  color: string;
  pipeline: string;
  pipelineOrder: number;
  studioId: string;
  supervisorId: string | null;
  leadId: string | null;
}

export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: () => apiFetch<DepartmentDTO[]>("/departments"),
  });
}
