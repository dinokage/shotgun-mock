import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, apiFetch } from "@/lib/apiClient";
import type { Annotation } from "@/components/shared/review/types";

// Server-backed Presentation Mode, review timeline comments and client notes
// (`review_presentations` / `review_comments` / `client_notes`), replacing the
// localStorage slices of store/reviews.ts: those were bridged between browser
// tabs by a `storage` event, so a "synced" playhead or a transferred client
// note never left the one machine that produced it.

export interface PresentationDTO {
  isActive: boolean;
  versionId: string | null;
  presenterId: string | null;
  presenterName: string | null;
  frame: number;
  startedAt: string | null;
}

export interface ReviewCommentDTO {
  id: string;
  versionId: string;
  /** null for a comment transferred in from a client note. */
  authorId: string | null;
  frame: number;
  text: string;
  /** A served path under /api/review-session/audio, not a `blob:` URL. */
  audioUrl: string | null;
  waveform: number[];
  annotations: Annotation[];
  /** Set only on a note an internal reviewer explicitly transferred in. */
  fromClient: {
    authorName: string;
    shotName: string;
    transferredByUserName: string;
    transferredAt: string;
  } | null;
  createdAt: string;
}

export interface ClientNoteDTO {
  id: string;
  shotId: string;
  shotName: string;
  versionId: string | null;
  frame: number;
  text: string;
  authorName: string;
  annotations: Annotation[];
  transferred: boolean;
  transferredAt: string | null;
  transferredByUserName: string | null;
  createdAt: string;
}

const INACTIVE_PRESENTATION: PresentationDTO = {
  isActive: false,
  versionId: null,
  presenterId: null,
  presenterName: null,
  frame: 1,
  startedAt: null,
};

/** A shared playhead needs to land within a beat or two of the presenter's. */
const PRESENTING_POLL_MS = 1500;
/** Idle cadence, matching the app's existing fetchMe poll — just often enough
 * to notice that someone started presenting. Only runs while a review player
 * is actually mounted on a version; there is no global poll. */
const IDLE_POLL_MS = 10000;

export function usePresentation(versionId: string | undefined) {
  return useQuery<PresentationDTO>({
    queryKey: ["review-presentation", versionId ?? "none"],
    queryFn: () =>
      apiClient.get<PresentationDTO>(`/review-session/presentation/${versionId}`),
    enabled: !!versionId,
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.data?.isActive ? PRESENTING_POLL_MS : IDLE_POLL_MS,
    refetchIntervalInBackground: false,
  });
}

export function usePresentationValue(
  versionId: string | undefined,
): PresentationDTO {
  const { data } = usePresentation(versionId);
  return data ?? INACTIVE_PRESENTATION;
}

export function useStartPresentation(versionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (frame: number) =>
      apiClient.post<PresentationDTO>(
        `/review-session/presentation/${versionId}/start`,
        { frame },
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(
        ["review-presentation", versionId ?? "none"],
        data,
      );
    },
  });
}

export function useStopPresentation(versionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.post(`/review-session/presentation/${versionId}/stop`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["review-presentation", versionId ?? "none"],
      });
    },
  });
}

/**
 * Pushes the presenter's playhead out. Deliberately fire-and-forget with no
 * cache invalidation: it fires on every frame change while presenting, and the
 * presenter's own playhead is already local state — re-reading the row we just
 * wrote would only fight it.
 */
export function usePushPresenterFrame(versionId: string | undefined) {
  return useMutation({
    mutationFn: (frame: number) =>
      apiClient.post(`/review-session/presentation/${versionId}/frame`, {
        frame,
      }),
  });
}

export function useReviewComments(versionId: string | undefined) {
  return useQuery<ReviewCommentDTO[]>({
    queryKey: ["review-comments", versionId ?? "none"],
    queryFn: () =>
      apiClient.get<ReviewCommentDTO[]>(
        `/review-session/comments?versionId=${encodeURIComponent(versionId!)}`,
      ),
    enabled: !!versionId,
    staleTime: 5000,
  });
}

export function usePostReviewComment(versionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      frame: number;
      text?: string;
      audioUrl?: string;
      waveform?: number[];
    }) =>
      apiClient.post<ReviewCommentDTO>("/review-session/comments", {
        versionId,
        ...body,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["review-comments", versionId ?? "none"],
      }),
  });
}

/** Uploads a recorded voice note and returns the durable URL to attach to a
 * comment — a MediaRecorder `blob:` URL dies with the tab that made it. */
export function useUploadReviewAudio() {
  return useMutation({
    mutationFn: (file: Blob) => {
      const form = new FormData();
      form.append("file", file, "voice-note");
      return apiFetch<{ url: string; size: number }>("/review-session/audio", {
        method: "POST",
        body: form,
      });
    },
  });
}

export function useClientNotes(shotId: string | undefined) {
  return useQuery<ClientNoteDTO[]>({
    queryKey: ["client-notes", shotId ?? "none"],
    queryFn: () =>
      apiClient.get<ClientNoteDTO[]>(
        `/review-session/client-notes?shotId=${encodeURIComponent(shotId!)}`,
      ),
    enabled: !!shotId,
    staleTime: 5000,
  });
}

export function useCreateClientNote(shotId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      versionId?: string | null;
      frame: number;
      text: string;
      annotations?: Annotation[];
    }) =>
      apiClient.post<ClientNoteDTO>("/review-session/client-notes", {
        shotId,
        ...body,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["client-notes", shotId ?? "none"],
      }),
  });
}

/**
 * Publishes one client note into the internal comment stream. This is the only
 * way client feedback ever reaches that stream — GET /review-session/comments
 * never returns an untransferred note.
 */
export function useTransferClientNote(
  shotId: string | undefined,
  versionId: string | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) =>
      apiClient.post<ReviewCommentDTO>(
        `/review-session/client-notes/${noteId}/transfer`,
        { versionId },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["client-notes", shotId ?? "none"],
      });
      queryClient.invalidateQueries({
        queryKey: ["review-comments", versionId ?? "none"],
      });
    },
  });
}
