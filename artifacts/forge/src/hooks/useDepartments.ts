import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, apiFetch } from "@/lib/apiClient";

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

export function useCreateDepartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      abbr: string;
      pipeline: "PROD" | "3D" | "VFX" | "2D";
    }) => apiClient.post<DepartmentDTO>("/departments", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
  });
}
