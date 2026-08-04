import { create } from 'zustand';

interface UIState {
  aiAssistantOpen: boolean;
  toggleAiAssistant: () => void;
  setAiAssistantOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  aiAssistantOpen: false,
  toggleAiAssistant: () => set((state) => ({ aiAssistantOpen: !state.aiAssistantOpen })),
  setAiAssistantOpen: (open) => set({ aiAssistantOpen: open }),
}));
