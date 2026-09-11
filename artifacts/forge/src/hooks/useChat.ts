import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiClient, apiFetch } from "@/lib/apiClient";

// Server-backed team chat (`chat_channels` / `chat_channel_members` /
// `chat_messages`), replacing the localStorage-only Zustand store the page
// used to read: every participant kept their own private copy of the
// conversation, so no message ever reached anyone else.

export type ChatChannelKind = "channel" | "group" | "dm";

export interface ChatChannelDTO {
  id: string;
  kind: ChatChannelKind;
  name: string;
  description: string;
  departmentId: string | null;
  createdById: string | null;
  createdAt: string;
  memberIds: string[];
  /** False for a public channel the caller may join but hasn't yet. */
  isMember: boolean;
  unreadCount: number;
}

export interface ChatMessageDTO {
  id: string;
  channelId: string;
  authorId: string | null;
  body: string;
  attachmentUrl: string | null;
  attachmentName: string | null;
  createdAt: string;
  editedAt: string | null;
}

interface ChatMessagePage {
  messages: ChatMessageDTO[];
  hasMore: boolean;
}

const PAGE_SIZE = 50;

export function useChatChannels() {
  return useQuery<ChatChannelDTO[]>({
    queryKey: ["chat-channels"],
    queryFn: () => apiClient.get<ChatChannelDTO[]>("/chat/channels"),
    staleTime: 10000,
  });
}

/**
 * Walks backwards through a channel's history a page at a time — a busy
 * channel never ships its whole transcript on open. Pages arrive
 * newest-page-first with each page's own messages oldest-first, so they're
 * reversed here into one flat, chronological transcript.
 */
export function useChatMessages(channelId: string | null) {
  const query = useInfiniteQuery<ChatMessagePage>({
    queryKey: ["chat-messages", channelId],
    enabled: !!channelId,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (pageParam) params.set("before", String(pageParam));
      return apiClient.get<ChatMessagePage>(
        `/chat/channels/${channelId}/messages?${params.toString()}`,
      );
    },
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.messages.length > 0
        ? lastPage.messages[0].createdAt
        : undefined,
    staleTime: 5000,
  });

  const messages = (query.data?.pages ?? [])
    .slice()
    .reverse()
    .flatMap((page) => page.messages);

  return { ...query, messages };
}

export function usePostChatMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      channelId,
      ...body
    }: {
      channelId: string;
      body?: string;
      attachmentUrl?: string;
      attachmentName?: string;
    }) =>
      apiClient.post<ChatMessageDTO>(
        `/chat/channels/${channelId}/messages`,
        body,
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["chat-messages", variables.channelId],
      });
      queryClient.invalidateQueries({ queryKey: ["chat-channels"] });
    },
  });
}

export function useCreateChatChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      kind: "channel" | "group";
      name: string;
      description?: string;
      departmentId?: string;
      memberIds?: string[];
    }) => apiClient.post<ChatChannelDTO>("/chat/channels", body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["chat-channels"] }),
  });
}

/** Get-or-create the 1:1 channel with another user. */
export function useOpenDirectMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiClient.post<ChatChannelDTO>("/chat/channels/dm", { userId }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["chat-channels"] }),
  });
}

export function useJoinChatChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) =>
      apiClient.post(`/chat/channels/${channelId}/join`, {}),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["chat-channels"] }),
  });
}

export function useMarkChannelRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) =>
      apiClient.post(`/chat/channels/${channelId}/read`, {}),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["chat-channels"] }),
  });
}

/** Uploads the picked file and returns the URL to attach to a message. */
export function useUploadChatAttachment() {
  return useMutation({
    mutationFn: ({ channelId, file }: { channelId: string; file: File }) => {
      const form = new FormData();
      form.append("file", file);
      return apiFetch<{ url: string; name: string; size: number }>(
        `/chat/channels/${channelId}/attachments`,
        { method: "POST", body: form },
      );
    },
  });
}

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov"];

/** Mirrors the server's read-time allowlist (routes/chat.ts): only these
 * extensions come back with a real media Content-Type, so only these are
 * safe to render inline rather than as a download link. */
export function attachmentKind(
  url: string | null,
): "image" | "video" | "file" | null {
  if (!url) return null;
  const ext = url.slice(url.lastIndexOf(".")).toLowerCase();
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (VIDEO_EXTENSIONS.includes(ext)) return "video";
  return "file";
}
