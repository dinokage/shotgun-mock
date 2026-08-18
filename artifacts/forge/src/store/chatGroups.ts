import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ChatGroup {
  id: string;
  name: string;
  memberIds: string[];
  createdBy: string;
  createdAt: string;
}

interface ChatGroupsState {
  groups: ChatGroup[];
  addGroup: (group: ChatGroup) => void;
}

export const useChatGroupsStore = create<ChatGroupsState>()(
  persist(
    (set) => ({
      groups: [],
      addGroup: (group) => set((state) => ({ groups: [...state.groups, group] })),
    }),
    {
      name: 'forge-chat-groups-storage',
    }
  )
);
