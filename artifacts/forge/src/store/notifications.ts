import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Notification, NOTIFICATIONS } from '@/data/mockData';

export type NotificationCategory = Notification['category'];

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
}

/** Drives the Notifications tab in Settings — one row per category. */
export const NOTIFICATION_PREFERENCE_META: NotificationPreferenceMeta[] = [
  { category: 'assignment', label: 'Task Assignments', description: 'When you are assigned a new task.' },
  { category: 'workflow', label: 'Status & Workflow Changes', description: 'When a task or workflow you follow changes status.' },
  { category: 'mention', label: 'Mentions (@)', description: 'When someone tags you in a comment or review.' },
  { category: 'review', label: 'Review Requests', description: 'When someone requests your review on a submission.' },
  { category: 'approval', label: 'Review Approvals', description: 'When your submission is approved by a Lead or Manager.' },
  { category: 'publishing', label: 'Publishing', description: 'When an asset or shot you follow is published to production.' },
  { category: 'handoff', label: 'Department Handoffs', description: 'When work is handed off to you from another department.' },
  { category: 'system', label: 'System & Daily Digest', description: 'Studio system alerts and your morning summary.' },
];

export type NotificationPreferences = Record<NotificationCategory, NotificationChannelPrefs>;

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  assignment: { push: true, email: true },
  workflow: { push: true, email: true },
  mention: { push: true, email: true },
  review: { push: true, email: true },
  approval: { push: true, email: true },
  publishing: { push: true, email: true },
  handoff: { push: true, email: true },
  system: { push: true, email: false },
};

interface NotificationState {
  notifications: Notification[];
  preferences: NotificationPreferences;
  /**
   * Adds a notification, gated on the category's `push` preference — this is the
   * "generation-time" enforcement of preferences for dynamic notification sources
   * (e.g. the review approval chain in review.tsx). `notifications.tsx` and the
   * TopBar bell also filter by preference at render time, which covers the static
   * mock seed data and acts as a second guard for anything added dynamically.
   */
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  setPreferenceChannel: (category: NotificationCategory, channel: keyof NotificationChannelPrefs, value: boolean) => void;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      notifications: NOTIFICATIONS,
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      addNotification: (notification) =>
        set((state) => {
          if (!state.preferences[notification.category]?.push) {
            // Category muted in Settings > Notifications — drop it instead of generating it.
            return state;
          }
          return {
            notifications: [
              {
                ...notification,
                id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                // `timestamp` is a display string, not a parseable date — every
                // renderer (this page, TopBar's bell dropdown) prints it as-is
                // with no date formatting, and the seed data uses relative-time
                // strings like "2 mins ago". An ISO instant here would render
                // as a raw timestamp instead of matching that convention.
                timestamp: 'Just now',
                read: false,
              },
              ...state.notifications,
            ],
          };
        }),
      markAsRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        })),
      markAllAsRead: () =>
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
        })),
      setPreferenceChannel: (category, channel, value) =>
        set((state) => ({
          preferences: {
            ...state.preferences,
            [category]: {
              ...state.preferences[category],
              [channel]: value,
            },
          },
        })),
    }),
    {
      name: 'forge-notification-storage',
    }
  )
);
