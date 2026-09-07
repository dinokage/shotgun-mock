import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import type { Annotation } from "@/components/shared/review/types";

export function useAnnotations(versionId: string | undefined) {
  return useQuery<Annotation[]>({
    queryKey: ["annotations", versionId ?? "none"],
    queryFn: async () =>
      apiClient.get<Annotation[]>(`/reviews/${versionId}/annotations`),
    enabled: !!versionId,
    staleTime: 5000,
  });
}

export function useCreateAnnotation(versionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (annotation: Omit<Annotation, "id">) =>
      apiClient.post<Annotation>(`/reviews/${versionId}/annotations`, annotation),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["annotations", versionId ?? "none"] }),
  });
}

export function useUpdateAnnotation(versionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<Annotation>) =>
      apiClient.put<Annotation>(`/reviews/annotations/${id}`, body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["annotations", versionId ?? "none"] }),
  });
}

export function useDeleteAnnotation(versionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/reviews/annotations/${id}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["annotations", versionId ?? "none"] }),
  });
}
