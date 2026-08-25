import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PluginsState {
  installedPlugins: Record<string, boolean>;
  enabledPlugins: Record<string, boolean>;
  installPlugin: (id: string) => void;
  uninstallPlugin: (id: string) => void;
  togglePlugin: (id: string) => void;
}

export const usePluginsStore = create<PluginsState>()(
  persist(
    (set) => ({
      installedPlugins: { pl1: true, pl3: true },
      enabledPlugins: { pl1: true, pl3: false },
      installPlugin: (id) =>
        set((state) => ({
          installedPlugins: { ...state.installedPlugins, [id]: true },
          enabledPlugins: { ...state.enabledPlugins, [id]: true },
        })),
      uninstallPlugin: (id) =>
        set((state) => {
          const { [id]: _, ...restInstalled } = state.installedPlugins;
          const { [id]: __, ...restEnabled } = state.enabledPlugins;
          return {
            installedPlugins: restInstalled,
            enabledPlugins: restEnabled,
          };
        }),
      togglePlugin: (id) =>
        set((state) => ({
          enabledPlugins: {
            ...state.enabledPlugins,
            [id]: !state.enabledPlugins[id],
          },
        })),
    }),
    {
      name: "forge-plugins-storage",
    },
  ),
);
