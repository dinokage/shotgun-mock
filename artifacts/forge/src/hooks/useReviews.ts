import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/apiClient";
import type { Annotation } from "@/components/shared/review/types";

/**
 * Annotations are server-backed, keyed to the version being reviewed.
 *
 * Every mutation below is optimistic. That is not a performance nicety here,
 * it is the difference between the tool working and not: the canvas renders
 * straight from this query's cache, so before optimism a freshly drawn mark
 * was pushed up as a POST and then *vanished* from the screen until the
 * server answered and the refetch landed. Drawing a line and watching it
 * disappear reads as "annotation is broken", and it did so even when the
 * write succeeded perfectly.
 *
 * Each one also rolls back and reports on failure. Silent rollback would
 * reproduce the same symptom for a different reason -- a mark that appears
 * and then quietly evaporates because the server said 403 -- which is the
 * single most confusing thing this surface can do.
 */

const keyFor = (versionId: string | undefined) => [
  "annotations",
  versionId ?? "none",
];

/** Ids we minted locally, which the server has never seen. */
export const isTempAnnotationId = (id: string) => id.startsWith("temp-");

export function useAnnotations(versionId: string | undefined) {
  return useQuery<Annotation[]>({
    queryKey: keyFor(versionId),
    queryFn: async () =>
      apiClient.get<Annotation[]>(`/reviews/${versionId}/annotations`),
    enabled: !!versionId,
    staleTime: 5000,
  });
}

export function useCreateAnnotation(
  versionId: string | undefined,
  onFailure?: (message: string) => void,
) {
  const queryClient = useQueryClient();
  const key = keyFor(versionId);
  return useMutation({
    mutationFn: (annotation: Omit<Annotation, "id">) =>
      apiClient.post<Annotation>(`/reviews/${versionId}/annotations`, annotation),
    onMutate: async (annotation) => {
      // Stop any in-flight refetch from overwriting the optimistic list.
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Annotation[]>(key) ?? [];
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      queryClient.setQueryData<Annotation[]>(key, [
        ...previous,
        { ...(annotation as Annotation), id: tempId },
      ]);
      return { previous, tempId };
    },
    onError: (err, _vars, context) => {
      if (context) queryClient.setQueryData(key, context.previous);
      onFailure?.(err instanceof Error ? err.message : "Unknown error");
    },
    onSuccess: (created, _vars, context) => {
      // Swap the placeholder for the real row so the id is the server's, and
      // any immediate follow-up edit addresses a row that actually exists.
      queryClient.setQueryData<Annotation[]>(key, (current = []) =>
        current.map((a) => (a.id === context?.tempId ? created : a)),
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useUpdateAnnotation(
  versionId: string | undefined,
  onFailure?: (message: string) => void,
) {
  const queryClient = useQueryClient();
  const key = keyFor(versionId);
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<Annotation>) =>
      apiClient.put<Annotation>(`/reviews/annotations/${id}`, body),
    onMutate: async ({ id, ...patch }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Annotation[]>(key) ?? [];
      queryClient.setQueryData<Annotation[]>(key, (current = []) =>
        current.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      );
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context) queryClient.setQueryData(key, context.previous);
      onFailure?.(err instanceof Error ? err.message : "Unknown error");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useDeleteAnnotation(
  versionId: string | undefined,
  onFailure?: (message: string) => void,
) {
  const queryClient = useQueryClient();
  const key = keyFor(versionId);
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/reviews/annotations/${id}`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Annotation[]>(key) ?? [];
      queryClient.setQueryData<Annotation[]>(key, (current = []) =>
        current.filter((a) => a.id !== id),
      );
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context) queryClient.setQueryData(key, context.previous);
      onFailure?.(err instanceof Error ? err.message : "Unknown error");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
