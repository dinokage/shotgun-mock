import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Persisted state for the DCC Integrations hub (/integrations).
 *
 * - `runtime` tracks per-integration status/last-sync overrides so "Sync
 *   Data" / "Sync All" / "Connect" leave a real, visible, reload-surviving
 *   trace instead of just a toast that vanishes.
 * - `autoSync` backs the per-integration settings panel opened from the gear
 *   icon.
 * - `pathConfig` backs the "Global Pipeline Configuration" card so "Save
 *   Configuration" actually persists the path/env var fields.
 */

export interface IntegrationRuntime {
  status: "connected" | "warning" | "disconnected";
  lastSync: string;
}

export interface PathConfig {
  winPath: string;
  macPath: string;
  pythonInterpreter: string;
  apiUrl: string;
}

const DEFAULT_PATH_CONFIG: PathConfig = {
  winPath: "Z:\\Projects\\Forge",
  macPath: "/Volumes/Projects/Forge",
  pythonInterpreter: "/usr/local/bin/python3",
  apiUrl: "https://api.forge-vfx.local/v1",
};

interface IntegrationsState {
  runtime: Record<string, IntegrationRuntime>;
  autoSync: Record<string, boolean>;
  pathConfig: PathConfig;

  syncIntegration: (id: string, status?: IntegrationRuntime["status"]) => void;
  toggleAutoSync: (id: string, enabled: boolean) => void;
  savePathConfig: (config: PathConfig) => void;
}

export const useIntegrationsStore = create<IntegrationsState>()(
  persist(
    (set) => ({
      runtime: {},
      autoSync: {},
      pathConfig: DEFAULT_PATH_CONFIG,

      syncIntegration: (id, status = "connected") =>
        set((state) => ({
          runtime: {
            ...state.runtime,
            [id]: { status, lastSync: "Just now" },
          },
        })),

      toggleAutoSync: (id, enabled) =>
        set((state) => ({
          autoSync: { ...state.autoSync, [id]: enabled },
        })),

      savePathConfig: (config) => set({ pathConfig: config }),
    }),
    {
      name: "forge-integrations-storage",
    },
  ),
);
