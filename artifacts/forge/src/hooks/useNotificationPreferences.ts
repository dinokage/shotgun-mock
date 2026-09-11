import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, apiFetch } from "@/lib/apiClient";
import { Notification } from "@/data/mockData";

export type NotificationCategory = Notification["category"];

export interface NotificationChannelPrefs {
  /** Whether notifications in this category are generated/shown in-app at all. */
  push: boolean;
  /** Whether this category is also emailed (cosmetic in this mock — no email delivery exists). */
  email: boolean;
}

export interface NotificationPreferenceMeta {
  category: NotificationCategory;
  label: string;
  description: string;
  /** Applied when the user has never changed this category (no stored row). */
  defaults: NotificationChannelPrefs;
}

/** Drives the Notifications tab in Settings — one row per category. */
export const NOTIFICATION_PREFERENCE_META: NotificationPreferenceMeta[] = [
  {
    category: "assignment",
    label: "Task Assignments",
    description: "When you are assigned a new task.",
    defaults: { push: true, email: true },
  },
  {
    category: "workflow",
    label: "Status & Workflow Changes",
    description: "When a task or workflow you follow changes status.",
    defaults: { push: true, email: true },
  },
  {
    category: "mention",
    label: "Mentions (@)",
    description: "When someone tags you in a comment or review.",
    defaults: { push: true, email: true },
  },
  {
    category: "review",
    label: "Review Requests",
    description: "When someone requests your review on a submission.",
    defaults: { push: true, email: true },
  },
  {
    category: "approval",
    label: "Review Approvals",
    description: "When your submission is approved by a Lead or Manager.",
    defaults: { push: true, email: true },
  },
  {
    category: "publishing",
    label: "Publishing",
    description: "When an asset or shot you follow is published to production.",
    defaults: { push: true, email: true },
  },
  {
    category: "handoff",
    label: "Department Handoffs",
    description: "When work is handed off to you from another department.",
    defaults: { push: true, email: true },
  },
  {
    category: "system",
    label: "System & Daily Digest",
    description: "Studio system alerts and your morning summary.",
    defaults: { push: true, email: false },
  },
];

export type NotificationPreferences = Record<
  NotificationCategory,
  NotificationChannelPrefs
>;

export const DEFAULT_NOTIFICATION_PREFERENCES = Object.fromEntries(
  NOTIFICATION_PREFERENCE_META.map((m) => [m.category, m.defaults]),
) as NotificationPreferences;

interface NotificationPreferenceRow {
  category: string;
  push: boolean;
  email: boolean;
}

const QUERY_KEY = ["notification-preferences"];

/**
 * The signed-in user's own preferences, resolved against the product
 * defaults. The server only stores categories the user has actually changed,
 * so anything missing here falls back to NOTIFICATION_PREFERENCE_META.
 */
export function useNotificationPreferences() {
  const query = useQuery<NotificationPreferenceRow[]>({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<NotificationPreferenceRow[]>("/notification-preferences"),
    staleTime: 60000,
  });

  const preferences = useMemo(() => {
    const resolved = { ...DEFAULT_NOTIFICATION_PREFERENCES };
    for (const row of query.data ?? []) {
      if (row.category in resolved) {
        resolved[row.category as NotificationCategory] = {
          push: row.push,
          email: row.email,
        };
      }
    }
    return resolved;
  }, [query.data]);

  return { preferences, isLoading: query.isLoading };
}

/**
 * Writes one category. Both channels are sent every time because the stored
 * row may not exist yet — a single-channel write would otherwise create it
 * with a column default instead of the default the user was looking at.
 */
export function useSetNotificationPreference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      category,
      ...channels
    }: { category: NotificationCategory } & NotificationChannelPrefs) =>
      apiClient.put<NotificationPreferenceRow>(
        `/notification-preferences/${category}`,
        channels,
      ),
    // Optimistic so the toggle flips under the finger rather than a round
    // trip later.
    onMutate: async ({ category, push, email }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous =
        queryClient.getQueryData<NotificationPreferenceRow[]>(QUERY_KEY);
      queryClient.setQueryData<NotificationPreferenceRow[]>(QUERY_KEY, [
        ...(previous ?? []).filter((r) => r.category !== category),
        { category, push, email },
      ]);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous)
        queryClient.setQueryData(QUERY_KEY, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
