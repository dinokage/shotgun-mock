import { create } from 'zustand';

interface UIState {
  aiAssistantOpen: boolean;
  toggleAiAssistant: () => void;
  setAiAssistantOpen: (open: boolean) => void;

  // Single source of truth for the Cmd/Ctrl+K command palette. `searchOpen`
  // used to be a separate flag backing a near-duplicate search overlay;
  // consolidated here since both opened the same conceptual surface.
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  shortcutsDialogOpen: boolean;
  setShortcutsDialogOpen: (open: boolean) => void;

  notificationPanelOpen: boolean;
  setNotificationPanelOpen: (open: boolean) => void;

  createTaskModalOpen: boolean;
  setCreateTaskModalOpen: (open: boolean) => void;

  createProjectModalOpen: boolean;
  setCreateProjectModalOpen: (open: boolean) => void;

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

  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  shortcutsDialogOpen: false,
  setShortcutsDialogOpen: (open) => set({ shortcutsDialogOpen: open }),

  createTaskModalOpen: false,
  setCreateTaskModalOpen: (open) => set({ createTaskModalOpen: open }),

  createProjectModalOpen: false,
  setCreateProjectModalOpen: (open) => set({ createProjectModalOpen: open }),

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
