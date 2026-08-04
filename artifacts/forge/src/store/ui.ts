import { create } from 'zustand';

interface UIState {
  aiAssistantOpen: boolean;
  toggleAiAssistant: () => void;
  setAiAssistantOpen: (open: boolean) => void;

  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;

  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  notificationPanelOpen: boolean;
  setNotificationPanelOpen: (open: boolean) => void;

  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;

  activeTaskDrawer: string | null;
  setActiveTaskDrawer: (taskId: string | null) => void;

  inspectorOpen: boolean;
  setInspectorOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  aiAssistantOpen: false,
  toggleAiAssistant: () => set((state) => ({ aiAssistantOpen: !state.aiAssistantOpen })),
  setAiAssistantOpen: (open) => set({ aiAssistantOpen: open }),

  searchOpen: false,
  setSearchOpen: (open) => set({ searchOpen: open }),

  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  notificationPanelOpen: false,
  setNotificationPanelOpen: (open) => set({ notificationPanelOpen: open }),

  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  activeTaskDrawer: null,
  setActiveTaskDrawer: (taskId) => set({ activeTaskDrawer: taskId }),

  inspectorOpen: false,
  setInspectorOpen: (open) => set({ inspectorOpen: open }),
}));
