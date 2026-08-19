import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MESSAGES as SEED_MESSAGES, ChatMessage } from '@/data/mockData';

export interface ChatGroup {
  id: string;
  name: string;
  memberIds: string[];
  createdBy: string;
  createdAt: string;
  /** True for a 1:1 direct message channel (id is derived, see dmChannelId). */
  isDM?: boolean;
}

interface ChatGroupsState {
  groups: ChatGroup[];
  addGroup: (group: ChatGroup) => void;
  /**
   * Returns the id of the 1:1 DM channel between two users, creating it in
   * the store first if it doesn't exist yet. The channel id is derived from
   * the sorted pair of user ids so it's stable regardless of who initiates.
   */
  getOrCreateDM: (userIdA: string, userIdB: string) => string;
}

export function dmChannelId(userIdA: string, userIdB: string): string {
  return `dm_${[userIdA, userIdB].sort().join('_')}`;
}

export const useChatGroupsStore = create<ChatGroupsState>()(
  persist(
    (set, get) => ({
      groups: [],
      addGroup: (group) => set((state) => ({ groups: [...state.groups, group] })),
      getOrCreateDM: (userIdA, userIdB) => {
        const id = dmChannelId(userIdA, userIdB);
        const exists = get().groups.some((g) => g.id === id);
        if (!exists) {
          set((state) => ({
            groups: [
              ...state.groups,
              {
                id,
                name: 'Direct Message',
                memberIds: [userIdA, userIdB],
                createdBy: userIdA,
                createdAt: new Date().toISOString(),
                isDM: true,
              },
            ],
          }));
        }
        return id;
      },
    }),
    {
      name: 'forge-chat-groups-storage',
    }
  )
);

// --- Chat Messages -----------------------------------------------------
// Persisted alongside groups so a conversation survives navigation the same
// way created groups already do, instead of living in page-local useState.

interface ChatMessagesState {
  messages: ChatMessage[];
  addMessage: (message: ChatMessage) => void;
}

export const useChatMessagesStore = create<ChatMessagesState>()(
  persist(
    (set) => ({
      messages: SEED_MESSAGES,
      addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
    }),
    {
      name: 'forge-chat-messages-storage',
    }
  )
);
