import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Backs the Settings page tabs that previously either had no real state at
 * all (dead buttons that only toasted) or used uncontrolled inputs whose
 * values silently reverted on reload. Mirrors the persist pattern used by
 * src/store/tasks.ts, src/store/notifications.ts, and src/store/permissions.ts.
 */

export interface StudioProfile {
  studioName: string;
  industry: string;
  timezone: string;
}

export interface SecuritySettings {
  oktaConfigured: boolean;
  oktaDomain: string;
  enforce2FA: boolean;
  ipAllowlist: string;
}

export type PipelineDept = "VFX" | "3D" | "2D";

export interface ApiKey {
  id: string;
  name: string;
  lastUsed: string;
  expires: string;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  event: string;
}

export interface LicenseServer {
  id: string;
  name: string;
  type: string;
  used: number;
  owned: number;
}

export interface PendingInvite {
  id: string;
  email: string;
  invitedAt: string;
}

const DEFAULT_PIPELINE_STAGES: Record<PipelineDept, string[]> = {
  VFX: ["Tracking", "Roto", "Paint", "Compositing", "Client Review", "Final"],
  "3D": [
    "Modeling",
    "Rigging",
    "Layout",
    "Animation",
    "Lighting",
    "Rendering",
    "Client Review",
  ],
  "2D": [
    "Storyboarding",
    "Layout",
    "Rough Anim",
    "Clean Up",
    "Color",
    "Comp",
    "Client Review",
  ],
};

const DEFAULT_API_KEYS: ApiKey[] = [
  {
    id: "key-python-pipeline",
    name: "Python Pipeline Script",
    lastUsed: "2 mins ago",
    expires: "Never",
  },
  {
    id: "key-maya-integration",
    name: "Maya Integration",
    lastUsed: "14 days ago",
    expires: "Dec 31, 2025",
  },
];

const DEFAULT_LICENSE_SERVERS: LicenseServer[] = [
  {
    id: "lic-maya",
    name: "Autodesk Maya",
    type: "Floating",
    used: 22,
    owned: 30,
  },
  {
    id: "lic-nuke",
    name: "The Foundry Nuke",
    type: "Node-locked",
    used: 15,
    owned: 15,
  },
  {
    id: "lic-houdini",
    name: "SideFX Houdini",
    type: "Floating",
    used: 28,
    owned: 40,
  },
  {
    id: "lic-arnold",
    name: "Arnold Render",
    type: "Render Node",
    used: 28,
    owned: 50,
  },
  {
    id: "lic-unreal",
    name: "Unreal Engine",
    type: "Enterprise",
    used: 27,
    owned: 30,
  },
  {
    id: "lic-substance",
    name: "Substance Painter",
    type: "Floating",
    used: 30,
    owned: 30,
  },
];

// Maya Chen (u2) is the studio's VFX Producer - the actual studio admin.
// Previously this defaulted to whichever row happened to sit at index 0,
// which was the seeded "External Client" account.
const DEFAULT_ADMIN_IDS: Record<string, boolean> = { u2: true };

interface StudioSettingsState {
  profile: StudioProfile;
  setProfile: (updates: Partial<StudioProfile>) => void;

  security: SecuritySettings;
  setSecurity: (updates: Partial<SecuritySettings>) => void;

  pipelineStages: Record<PipelineDept, string[]>;
  addPipelineStage: (dept: PipelineDept, stage: string) => void;

  admins: Record<string, boolean>;
  toggleAdmin: (userId: string) => void;

  apiKeys: ApiKey[];
  generateApiKey: (name: string) => void;
  revokeApiKey: (id: string) => void;

  webhookEndpoints: WebhookEndpoint[];
  addWebhookEndpoint: (url: string, event: string) => void;

  licenseServers: LicenseServer[];
  addLicenseServer: (server: Omit<LicenseServer, "id" | "used">) => void;

  pendingInvites: PendingInvite[];
  inviteMember: (email: string) => void;
}

export const useStudioSettingsStore = create<StudioSettingsState>()(
  persist(
    (set) => ({
      profile: {
        studioName: "Nebula Animation Co.",
        industry: "animation",
        timezone: "pst",
      },
      setProfile: (updates) =>
        set((state) => ({ profile: { ...state.profile, ...updates } })),

      security: {
        oktaConfigured: false,
        oktaDomain: "",
        enforce2FA: false,
        ipAllowlist: "",
      },
      setSecurity: (updates) =>
        set((state) => ({ security: { ...state.security, ...updates } })),

      pipelineStages: DEFAULT_PIPELINE_STAGES,
      addPipelineStage: (dept, stage) =>
        set((state) => ({
          pipelineStages: {
            ...state.pipelineStages,
            [dept]: [...state.pipelineStages[dept], stage],
          },
        })),

      admins: DEFAULT_ADMIN_IDS,
      toggleAdmin: (userId) =>
        set((state) => ({
          admins: { ...state.admins, [userId]: !state.admins[userId] },
        })),

      apiKeys: DEFAULT_API_KEYS,
      generateApiKey: (name) =>
        set((state) => ({
          apiKeys: [
            {
              id: `key-${Date.now()}`,
              name,
              lastUsed: "Just now",
              expires: "Never",
            },
            ...state.apiKeys,
          ],
        })),
      revokeApiKey: (id) =>
        set((state) => ({ apiKeys: state.apiKeys.filter((k) => k.id !== id) })),

      webhookEndpoints: [],
      addWebhookEndpoint: (url, event) =>
        set((state) => ({
          webhookEndpoints: [
            ...state.webhookEndpoints,
            { id: `wh-${Date.now()}`, url, event },
          ],
        })),

      licenseServers: DEFAULT_LICENSE_SERVERS,
      addLicenseServer: (server) =>
        set((state) => ({
          licenseServers: [
            ...state.licenseServers,
            { ...server, id: `lic-${Date.now()}`, used: 0 },
          ],
        })),

      pendingInvites: [],
      inviteMember: (email) =>
        set((state) => ({
          pendingInvites: [
            ...state.pendingInvites,
            {
              id: `invite-${Date.now()}`,
              email,
              invitedAt: new Date().toISOString(),
            },
          ],
        })),
    }),
    {
      name: "forge-studio-settings-storage",
    },
  ),
);
