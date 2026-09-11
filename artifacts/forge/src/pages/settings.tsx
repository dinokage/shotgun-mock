import { Fragment, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ROLE_LABELS } from "@/data/mockData";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { copyToClipboard } from "@/lib/utils";
import {
  Building2,
  Cloud,
  UploadCloud,
  Key,
  Plus,
  Bell,
  Shield,
  Terminal,
  Copy,
  Check,
  X,
  ShieldCheck,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/store/auth";
import { apiFetch } from "@/lib/apiClient";
import { useUserStore } from "@/store/users";
import { useRoles } from "@/hooks/useRoles";
import { useCapability } from "@/hooks/use-capability";
import {
  CAPABILITIES,
  CAPABILITY_CATEGORIES,
  ROLES_ORDER,
} from "@/store/permissions";
import {
  useNotificationPreferences,
  useSetNotificationPreference,
  NOTIFICATION_PREFERENCE_META,
  type NotificationCategory,
  type NotificationChannelPrefs,
} from "@/hooks/useNotificationPreferences";
import {
  useStudioSetting,
  useSaveStudioSetting,
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
  useWebhooks,
  useCreateWebhook,
  useDeleteWebhook,
  useLicenseServers,
  useCreateLicenseServer,
} from "@/hooks/useStudioSettings";

type PipelineDept = "VFX" | "3D" | "2D";

interface StudioProfileValue {
  studioName: string;
  industry: string;
  timezone: string;
}

interface SecurityPolicyValue {
  oktaConfigured: boolean;
  oktaDomain: string;
  enforce2FA: boolean;
  ipAllowlist: string;
}

type PipelineStagesValue = Record<PipelineDept, string[]>;

// Blank starting points for a tenant that has never saved these documents --
// the form renders empty rather than showing invented studio details.
const EMPTY_PROFILE: StudioProfileValue = {
  studioName: "",
  industry: "",
  timezone: "",
};
const EMPTY_SECURITY: SecurityPolicyValue = {
  oktaConfigured: false,
  oktaDomain: "",
  enforce2FA: false,
  ipAllowlist: "",
};
// Product defaults for the stage editor (the standard stage order for each
// discipline), not studio-specific data.
const DEFAULT_PIPELINE_STAGES: PipelineStagesValue = {
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

function formatTimestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : null;
}

export default function Settings() {
  const { toast } = useToast();

  const currentUser = useAuthStore((s) => s.currentUser);
  const updateCurrentUser = useAuthStore((s) => s.updateCurrentUser);
  const users = useUserStore((s) => s.users);
  // The Roles matrix renders the tenant's real grants rather than a
  // hardcoded scheme, so what it shows is what requireCapability enforces.
  const { data: tenantRoles = [] } = useRoles();
  const grantsByRoleName = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    tenantRoles.forEach((role) => {
      map[role.name] = new Set(role.capabilities);
    });
    return map;
  }, [tenantRoles]);
  const { preferences: notificationPreferences } = useNotificationPreferences();
  const setNotificationPreferenceMutation = useSetNotificationPreference();
  // Both channels go up together: the stored row may not exist yet, so
  // sending only the toggled one would reset the other to a column default.
  const setNotificationPreference = (
    category: NotificationCategory,
    channel: keyof NotificationChannelPrefs,
    value: boolean,
  ) => {
    const next = { ...notificationPreferences[category], [channel]: value };
    setNotificationPreferenceMutation.mutate(
      { category, push: next.push, email: next.email },
      {
        onError: (err: unknown) =>
          toast({
            title: "Could not save preference",
            description:
              err instanceof Error ? err.message : "Please try again.",
            variant: "destructive",
          }),
      },
    );
  };

  // Role-scoped tab visibility: derived from the current user's real capabilities
  // as returned by /api/auth/me, not a hardcoded role list.
  // Notifications is a personal preference, so it's always visible to anyone who reaches this page
  // (see App.tsx's route-level LeadershipGuard, which must not wrap /settings or
  // non-leadership members can never reach this tab at all).
  const canManageRoles = useCapability("manage_roles");
  const canManageMembers = useCapability("manage_members");
  const canManagePipeline = useCapability("manage_pipeline");
  const canManageLicenses = useCapability("manage_licenses");
  const canManageIntegrations = useCapability("manage_integrations");

  const profileSetting = useStudioSetting<StudioProfileValue>(
    "studio_profile",
    canManageRoles,
  );
  const saveProfile = useSaveStudioSetting<StudioProfileValue>("studio_profile");
  const securitySetting = useStudioSetting<SecurityPolicyValue>(
    "security_policy",
    canManageRoles,
  );
  const saveSecurity =
    useSaveStudioSetting<SecurityPolicyValue>("security_policy");
  const stagesSetting = useStudioSetting<PipelineStagesValue>(
    "pipeline_stages",
    canManagePipeline,
  );
  const saveStages = useSaveStudioSetting<PipelineStagesValue>(
    "pipeline_stages",
  );

  const apiKeysQuery = useApiKeys(canManageIntegrations);
  const createApiKey = useCreateApiKey();
  const revokeApiKey = useRevokeApiKey();
  const webhooksQuery = useWebhooks(canManageIntegrations);
  const createWebhook = useCreateWebhook();
  const deleteWebhook = useDeleteWebhook();
  const licenseServersQuery = useLicenseServers(canManageLicenses);
  const createLicenseServer = useCreateLicenseServer();

  // Local drafts sit on top of the saved document so typing doesn't fire a
  // request per keystroke; the explicit save buttons below write them back.
  const [profileDraft, setProfileDraft] = useState<StudioProfileValue | null>(
    null,
  );
  const [securityDraft, setSecurityDraft] = useState<SecurityPolicyValue | null>(
    null,
  );
  const profile = profileDraft ?? profileSetting.data?.value ?? EMPTY_PROFILE;
  const security =
    securityDraft ?? securitySetting.data?.value ?? EMPTY_SECURITY;
  const pipelineStages =
    stagesSetting.data?.value ?? DEFAULT_PIPELINE_STAGES;

  const apiKeys = apiKeysQuery.data ?? [];
  const webhookEndpoints = webhooksQuery.data ?? [];
  const licenseServers = licenseServersQuery.data ?? [];

  const [oktaDialogOpen, setOktaDialogOpen] = useState(false);
  const [oktaDomainDraft, setOktaDomainDraft] = useState("");

  const [stageDialogDept, setStageDialogDept] = useState<PipelineDept | null>(
    null,
  );
  const [newStageName, setNewStageName] = useState("");

  const [licenseDialogOpen, setLicenseDialogOpen] = useState(false);
  const [licenseNameDraft, setLicenseNameDraft] = useState("");
  const [licenseVendorDraft, setLicenseVendorDraft] = useState("");
  const [licenseSeatsDraft, setLicenseSeatsDraft] = useState("10");

  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [tokenNameDraft, setTokenNameDraft] = useState("");

  const [webhookDialogOpen, setWebhookDialogOpen] = useState(false);
  const [webhookUrlDraft, setWebhookUrlDraft] = useState("");
  const [webhookEventDraft, setWebhookEventDraft] = useState(
    "task.status.changed",
  );

  // Holds a value the server will never hand back again (a raw API token, a
  // webhook signing secret). It exists only for as long as this dialog is open.
  const [revealedSecret, setRevealedSecret] = useState<{
    title: string;
    description: string;
    value: string;
  } | null>(null);

  const reportError = (title: string, err: unknown) =>
    toast({
      title,
      description: err instanceof Error ? err.message : "Please try again.",
      variant: "destructive",
    });

  const handleSaveProfile = async () => {
    try {
      await saveProfile.mutateAsync(profile);
      toast({ title: "Studio profile saved" });
    } catch (err) {
      reportError("Could not save studio profile", err);
    }
  };

  const handleConfigureOkta = () => {
    setOktaDomainDraft(security.oktaDomain);
    setOktaDialogOpen(true);
  };

  const handleSubmitOkta = async () => {
    const domain = oktaDomainDraft.trim();
    if (!domain) return;
    const next = { ...security, oktaConfigured: true, oktaDomain: domain };
    try {
      await saveSecurity.mutateAsync(next);
      setSecurityDraft(next);
      toast({
        title: "Okta SSO configured",
        description: `Members will now be directed to ${domain} to sign in.`,
      });
      setOktaDialogOpen(false);
    } catch (err) {
      reportError("Could not configure Okta SSO", err);
    }
  };

  const handleSaveSecurity = async () => {
    try {
      await saveSecurity.mutateAsync(security);
      toast({ title: "Security settings saved" });
    } catch (err) {
      reportError("Could not save security settings", err);
    }
  };

  const handleOpenAddStage = (dept: PipelineDept) => {
    setNewStageName("");
    setStageDialogDept(dept);
  };

  const handleSubmitStage = async () => {
    const stage = newStageName.trim();
    if (!stageDialogDept || !stage) return;
    const next: PipelineStagesValue = {
      ...pipelineStages,
      [stageDialogDept]: [...pipelineStages[stageDialogDept], stage],
    };
    try {
      await saveStages.mutateAsync(next);
      toast({
        title: "Stage added",
        description: `"${stage}" added to the ${stageDialogDept} pipeline.`,
      });
      setStageDialogDept(null);
    } catch (err) {
      reportError("Could not add stage", err);
    }
  };

  const handleSubmitLicense = async () => {
    const name = licenseNameDraft.trim();
    if (!name) return;
    try {
      await createLicenseServer.mutateAsync({
        name,
        vendor: licenseVendorDraft.trim(),
        seatsTotal: Number(licenseSeatsDraft) || 0,
      });
      toast({
        title: "License server added",
        description: `${name} is now tracked in License Management.`,
      });
      setLicenseNameDraft("");
      setLicenseVendorDraft("");
      setLicenseSeatsDraft("10");
      setLicenseDialogOpen(false);
    } catch (err) {
      reportError("Could not add license server", err);
    }
  };

  const handleSubmitToken = async () => {
    const name = tokenNameDraft.trim();
    if (!name) return;
    try {
      const created = await createApiKey.mutateAsync({ name });
      setTokenNameDraft("");
      setTokenDialogOpen(false);
      setRevealedSecret({
        title: "Copy your API token now",
        description: `"${created.name}" is stored hashed — this is the only time it can be shown. If you lose it, revoke the key and generate a new one.`,
        value: created.token,
      });
    } catch (err) {
      reportError("Could not generate API token", err);
    }
  };

  const handleRevokeApiKey = async (id: string, name: string) => {
    try {
      await revokeApiKey.mutateAsync(id);
      toast({
        title: "API key revoked",
        description: `"${name}" can no longer be used to authenticate.`,
      });
    } catch (err) {
      reportError("Could not revoke API key", err);
    }
  };

  const handleSubmitWebhook = async () => {
    const url = webhookUrlDraft.trim();
    if (!url) return;
    try {
      const created = await createWebhook.mutateAsync({
        url,
        events: [webhookEventDraft],
      });
      setWebhookUrlDraft("");
      setWebhookDialogOpen(false);
      setRevealedSecret({
        title: "Copy your webhook signing secret now",
        description: `Use this to verify the signature on deliveries to ${created.url}. It is stored server-side only and cannot be shown again.`,
        value: created.secret,
      });
    } catch (err) {
      reportError("Could not add webhook endpoint", err);
    }
  };

  const handleDeleteWebhook = async (id: string, url: string) => {
    try {
      await deleteWebhook.mutateAsync(id);
      toast({
        title: "Webhook endpoint removed",
        description: `Events will no longer be sent to ${url}.`,
      });
    } catch (err) {
      reportError("Could not remove webhook endpoint", err);
    }
  };

  const handleCopySecret = () => {
    if (!revealedSecret) return;
    copyToClipboard(revealedSecret.value).then((success) => {
      if (success) toast({ title: "Copied to clipboard" });
      else toast({ title: "Failed to copy", variant: "destructive" });
    });
  };

  const handleCopyCode = () => {
    const snippet = [
      "import forge_api",
      "",
      "# Connect to your workspace",
      "session = forge_api.Session(",
      '    server_url="https://nebula.forge.studio",',
      '    api_key="YOUR_API_KEY"',
      ")",
      "",
      "# Fetch shots needing review",
      "shots = session.query('Shot where status is \"review\"')",
      'print(f"Found {len(shots)} shots for review")',
    ].join("\n");
    copyToClipboard(snippet).then((success) => {
      if (success) toast({ title: "Copied to clipboard" });
      else toast({ title: "Failed to copy", variant: "destructive" });
    });
  };

  type TabId =
    | "profile"
    | "security"
    | "notifications"
    | "developer"
    | "pipelines"
    | "members"
    | "licenses"
    | "deployment";
  const visibleTabs = useMemo<TabId[]>(() => {
    const tabs: TabId[] = [];
    if (canManageRoles) tabs.push("profile");
    if (canManageRoles) tabs.push("security");
    tabs.push("notifications");
    if (canManageIntegrations) tabs.push("developer");
    if (canManagePipeline) tabs.push("pipelines");
    if (canManageMembers) tabs.push("members");
    if (canManageLicenses) tabs.push("licenses");
    if (canManageRoles) tabs.push("deployment");
    return tabs;
  }, [
    canManageRoles,
    canManageIntegrations,
    canManagePipeline,
    canManageMembers,
    canManageLicenses,
  ]);
  const defaultTab: TabId = visibleTabs[0] ?? "notifications";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Showing settings available to your role
            {currentUser ? ` (${ROLE_LABELS[currentUser.role]})` : ""}.
          </p>
        </div>
      </div>

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="mb-6">
          {canManageRoles && (
            <TabsTrigger value="profile">Studio Profile</TabsTrigger>
          )}
          {canManageRoles && (
            <TabsTrigger value="security">Security & SSO</TabsTrigger>
          )}
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          {/* Ungated on purpose: every role, including an artist who sees no
              other tab here, needs a way back to the walkthrough. */}
          <TabsTrigger value="help">Help</TabsTrigger>
          {canManageIntegrations && (
            <TabsTrigger value="developer">API & Developer</TabsTrigger>
          )}
          {canManagePipeline && (
            <TabsTrigger value="pipelines">Pipelines</TabsTrigger>
          )}
          {canManageMembers && (
            <TabsTrigger value="members">Members</TabsTrigger>
          )}
          {canManageLicenses && (
            <TabsTrigger value="licenses">Licenses</TabsTrigger>
          )}
          {canManageRoles && (
            <TabsTrigger value="deployment">Deployment</TabsTrigger>
          )}
        </TabsList>

        {canManageRoles && (
          <>
            <TabsContent
              value="profile"
              className="space-y-6 animate-in fade-in"
            >
              <Card>
                <CardHeader>
                  <CardTitle>General Information</CardTitle>
                  <CardDescription>
                    Basic details about your studio.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex gap-6 items-start">
                    <div className="w-24 h-24 rounded-lg bg-muted border border-border flex items-center justify-center flex-col gap-2 text-muted-foreground cursor-pointer hover:bg-muted/80">
                      <UploadCloud className="w-6 h-6" />
                      <span className="text-xs">Logo</span>
                    </div>
                    <div className="flex-1 space-y-4">
                      <div className="space-y-2">
                        <Label>Studio Name</Label>
                        <Input
                          value={profile.studioName}
                          placeholder="Your studio's name"
                          onChange={(e) =>
                            setProfileDraft({
                              ...profile,
                              studioName: e.target.value,
                            })
                          }
                          className="max-w-md"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Industry</Label>
                        <Select
                          value={profile.industry}
                          onValueChange={(value) =>
                            setProfileDraft({ ...profile, industry: value })
                          }
                        >
                          <SelectTrigger className="max-w-md">
                            <SelectValue placeholder="Select an industry" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="vfx">Visual Effects</SelectItem>
                            <SelectItem value="animation">
                              Feature Animation
                            </SelectItem>
                            <SelectItem value="games">
                              Game Development
                            </SelectItem>
                            <SelectItem value="commercial">
                              Commercial / Ad
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 pt-4 border-t border-border">
                    <Label>Timezone</Label>
                    <Select
                      value={profile.timezone}
                      onValueChange={(value) =>
                        setProfileDraft({ ...profile, timezone: value })
                      }
                    >
                      <SelectTrigger className="max-w-md">
                        <SelectValue placeholder="Select a timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pst">
                          Pacific Time (US & Canada)
                        </SelectItem>
                        <SelectItem value="est">
                          Eastern Time (US & Canada)
                        </SelectItem>
                        <SelectItem value="gmt">Greenwich Mean Time</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="pt-4 border-t border-border">
                    <Button
                      onClick={handleSaveProfile}
                      disabled={saveProfile.isPending}
                    >
                      {saveProfile.isPending ? "Saving…" : "Save Changes"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent
              value="security"
              className="space-y-6 animate-in fade-in"
            >
              <Card>
                <CardHeader>
                  <CardTitle>Authentication & SSO</CardTitle>
                  <CardDescription>
                    Configure enterprise Single Sign-On and security policies.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/10">
                    <div className="flex items-center gap-3">
                      <Shield className="w-8 h-8 text-blue-500" />
                      <div>
                        <h4 className="font-semibold text-sm flex items-center gap-2">
                          Okta SAML 2.0 Integration
                          {security.oktaConfigured && (
                            <Badge
                              variant="outline"
                              className="text-green-500 border-green-500/40 bg-green-500/10 text-[10px]"
                            >
                              Connected
                            </Badge>
                          )}
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          {security.oktaConfigured
                            ? `Members sign in via ${security.oktaDomain}.`
                            : "Force users to log in using your Okta directory."}
                        </p>
                      </div>
                    </div>
                    <Button variant="outline" onClick={handleConfigureOkta}>
                      {security.oktaConfigured ? "Reconfigure" : "Configure"}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/10">
                    <div className="flex items-center gap-3">
                      <Key className="w-8 h-8 text-amber-500" />
                      <div>
                        <h4 className="font-semibold text-sm">Enforce 2FA</h4>
                        <p className="text-xs text-muted-foreground">
                          Require two-factor authentication for all studio
                          members.
                        </p>
                      </div>
                    </div>
                    <motion.div whileTap={{ scale: 0.92 }}>
                      <Switch
                        checked={security.enforce2FA}
                        onCheckedChange={(checked) =>
                          setSecurityDraft({ ...security, enforce2FA: checked })
                        }
                        aria-label="Enforce two-factor authentication"
                      />
                    </motion.div>
                  </div>
                  <div className="space-y-2">
                    <Label>IP Allowlist (CIDR notation)</Label>
                    <Input
                      placeholder="e.g. 192.168.1.0/24, 10.0.0.0/8"
                      className="max-w-xl"
                      value={security.ipAllowlist}
                      onChange={(e) =>
                        setSecurityDraft({
                          ...security,
                          ipAllowlist: e.target.value,
                        })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Restrict access to Forge to specific office or VPN IP
                      ranges.
                    </p>
                  </div>
                  <div className="pt-4 border-t border-border">
                    <Button
                      onClick={handleSaveSecurity}
                      disabled={saveSecurity.isPending}
                    >
                      {saveSecurity.isPending ? "Saving…" : "Save Changes"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </>
        )}

        <TabsContent value="help" className="space-y-6 animate-in fade-in">
          <Card>
            <CardHeader>
              <CardTitle>Getting started walkthrough</CardTitle>
              <CardDescription>
                A short guided tour of the pages your role uses. It runs
                automatically the first time you sign in.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground max-w-lg">
                  {currentUser?.onboardedAt
                    ? "You have already been through the walkthrough. Run it again whenever you want a refresher — it is tailored to what your role can actually do."
                    : "You have not been through the walkthrough yet. It takes about a minute."}
                </p>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await apiFetch("/auth/onboarding", {
                        method: "POST",
                        body: JSON.stringify({ replay: true }),
                      });
                      updateCurrentUser({ onboardedAt: null });
                    } catch {
                      toast({
                        title: "Could not start the walkthrough",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  Run walkthrough
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent
          value="notifications"
          className="space-y-6 animate-in fade-in"
        >
          <Card>
            <CardHeader>
              <CardTitle>Email & Push Notifications</CardTitle>
              <CardDescription>
                Control when Forge sends you alerts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {NOTIFICATION_PREFERENCE_META.map((pref) => {
                const value = notificationPreferences[pref.category];
                return (
                  <div
                    key={pref.category}
                    className="flex items-center justify-between p-3 border-b border-border last:border-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3">
                      <Bell className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <h4 className="font-medium text-sm">{pref.label}</h4>
                        <p className="text-xs text-muted-foreground">
                          {pref.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">Email</Label>
                        <motion.div whileTap={{ scale: 0.92 }}>
                          <Switch
                            checked={value.email}
                            onCheckedChange={(checked) =>
                              setNotificationPreference(
                                pref.category,
                                "email",
                                checked,
                              )
                            }
                            aria-label={`Email notifications for ${pref.label}`}
                          />
                        </motion.div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">Push</Label>
                        <motion.div whileTap={{ scale: 0.92 }}>
                          <Switch
                            checked={value.push}
                            onCheckedChange={(checked) =>
                              setNotificationPreference(
                                pref.category,
                                "push",
                                checked,
                              )
                            }
                            aria-label={`In-app notifications for ${pref.label}`}
                          />
                        </motion.div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground pt-2">
                Push controls whether that category's notifications appear at
                all on your Notifications page. Changes save automatically.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {canManagePipeline && (
          <TabsContent value="pipelines" className="animate-in fade-in">
            <Card>
              <CardHeader>
                <CardTitle>Pipeline Customization</CardTitle>
                <CardDescription>
                  Modify pipeline stages for various departments.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {(["VFX", "3D", "2D"] as PipelineDept[]).map((dept) => (
                  <div key={dept} className="space-y-3">
                    <h3 className="font-semibold text-lg">
                      {dept} Pipeline Stages
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {pipelineStages[dept].map((s) => (
                        <Badge key={s} variant="secondary">
                          {s}
                        </Badge>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs px-2 rounded-full border-dashed"
                        onClick={() => handleOpenAddStage(dept)}
                      >
                        <Plus className="w-3 h-3 mr-1" /> Add Stage
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {canManageMembers && (
          <TabsContent value="members" className="animate-in fade-in">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
                <div>
                  <CardTitle>Team Members</CardTitle>
                  <CardDescription>
                    Manage access and roles. Inviting members and granting
                    admin access are managed from the Admin Panel.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  disabled
                  title="Invite Member is managed from the Admin Panel"
                >
                  Invite Member
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b border-border">
                    <tr>
                      <th className="p-4 text-left font-medium text-muted-foreground">
                        User
                      </th>
                      <th className="p-4 text-left font-medium text-muted-foreground">
                        Role
                      </th>
                      <th className="p-4 text-left font-medium text-muted-foreground">
                        Email
                      </th>
                      <th className="p-4 text-center font-medium text-muted-foreground w-20">
                        Admin
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr
                        key={user.id}
                        className="border-b border-border last:border-0 hover:bg-muted/10"
                      >
                        <td className="p-4 flex items-center gap-3">
                          <UserAvatar userId={user.id} />
                          <span className="font-medium">{user.name}</span>
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {user.role}
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {user.email}
                        </td>
                        <td className="p-4 text-center">
                          <motion.div
                            className="inline-flex"
                            whileTap={{ scale: 0.92 }}
                          >
                            <Switch
                              checked={user.role === "admin"}
                              disabled
                              title="Admin access is managed from the Admin Panel"
                              aria-label={`Admin access for ${user.name} (managed in Admin Panel)`}
                            />
                          </motion.div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {canManageRoles && (
              <Card>
                <CardHeader className="flex flex-row items-start justify-between border-b border-border pb-4">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="w-8 h-8 text-primary shrink-0" />
                    <div>
                      <CardTitle>Roles & Permissions</CardTitle>
                      <CardDescription>
                        What each role is allowed to do across Forge.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <p className="text-xs text-muted-foreground">
                    Role capabilities are fixed for this release — contact an
                    administrator to request a change.
                  </p>

                  <TooltipProvider delayDuration={200}>
                    <div className="overflow-x-auto border border-border rounded-lg">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="bg-muted/30 border-b border-border">
                            <th className="p-3 text-left font-medium text-muted-foreground sticky left-0 bg-muted/30 min-w-[220px] z-10">
                              Capability
                            </th>
                            {ROLES_ORDER.map((role) => (
                              <th
                                key={role}
                                className="p-3 text-center font-medium text-muted-foreground min-w-[104px] whitespace-nowrap"
                              >
                                {ROLE_LABELS[role]}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {CAPABILITY_CATEGORIES.map((category) => (
                            <Fragment key={category}>
                              <tr className="bg-muted/10">
                                <td
                                  colSpan={ROLES_ORDER.length + 1}
                                  className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sticky left-0 bg-muted/10"
                                >
                                  {category}
                                </td>
                              </tr>
                              {CAPABILITIES.filter(
                                (c) => c.category === category,
                              ).map((cap) => (
                                <tr
                                  key={cap.id}
                                  className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors"
                                >
                                  <td className="p-3 sticky left-0 bg-card">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="font-medium cursor-default">
                                          {cap.label}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent
                                        side="right"
                                        className="max-w-[220px]"
                                      >
                                        {cap.description}
                                      </TooltipContent>
                                    </Tooltip>
                                  </td>
                                  {ROLES_ORDER.map((role) => {
                                    const granted =
                                      grantsByRoleName[role]?.has(cap.id) ??
                                      false;
                                    return (
                                      <td
                                        key={role}
                                        className="p-3 text-center"
                                      >
                                        {granted ? (
                                          <Check
                                            className="w-4 h-4 mx-auto text-primary"
                                            aria-label={`${cap.label} granted for ${ROLE_LABELS[role]}`}
                                          />
                                        ) : (
                                          <X
                                            className="w-4 h-4 mx-auto text-muted-foreground/30"
                                            aria-label={`${cap.label} not granted for ${ROLE_LABELS[role]}`}
                                          />
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </TooltipProvider>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}

        {canManageLicenses && (
          <TabsContent value="licenses" className="animate-in fade-in">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
                <div>
                  <CardTitle>License Management</CardTitle>
                  <CardDescription>
                    Manage your studio's software licenses and seat allocation.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={() => setLicenseDialogOpen(true)}
                >
                  <Key className="w-4 h-4" /> Add License Server
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b border-border">
                    <tr>
                      <th className="p-4 text-left font-medium text-muted-foreground">
                        Software
                      </th>
                      <th className="p-4 text-left font-medium text-muted-foreground">
                        Vendor
                      </th>
                      <th className="p-4 text-center font-medium text-muted-foreground">
                        Seats Used
                      </th>
                      <th className="p-4 text-center font-medium text-muted-foreground">
                        Seats Owned
                      </th>
                      <th className="p-4 text-center font-medium text-muted-foreground">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {licenseServers.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="p-4 text-center text-muted-foreground text-sm"
                        >
                          No license servers tracked yet. Add one to start
                          monitoring seat usage.
                        </td>
                      </tr>
                    )}
                    {licenseServers.map((lic) => {
                      const ratio =
                        lic.seatsTotal > 0 ? lic.seatsInUse / lic.seatsTotal : 0;
                      const status =
                        ratio >= 1
                          ? "critical"
                          : ratio > 0.8
                            ? "warning"
                            : "healthy";
                      return (
                        <tr
                          key={lic.id}
                          className="border-b border-border last:border-0 hover:bg-muted/10"
                        >
                          <td className="p-4 font-medium">{lic.name}</td>
                          <td className="p-4 text-muted-foreground">
                            {lic.vendor || "—"}
                          </td>
                          <td className="p-4 text-center">{lic.seatsInUse}</td>
                          <td className="p-4 text-center">{lic.seatsTotal}</td>
                          <td className="p-4 text-center">
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${status === "critical" ? "text-red-500 border-red-500" : status === "warning" ? "text-yellow-500 border-yellow-500" : "text-green-500 border-green-500"}`}
                            >
                              {status === "critical"
                                ? "Maxed Out"
                                : status === "warning"
                                  ? "Near Limit"
                                  : "Available"}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {canManageRoles && (
          <TabsContent
            value="deployment"
            className="space-y-6 animate-in fade-in"
          >
            <Card className="border-primary ring-1 ring-primary/20">
              <CardHeader>
                <div className="flex items-center gap-3 mb-1">
                  <Cloud className="w-6 h-6 text-primary" />
                  <CardTitle className="text-2xl text-primary">
                    SaaS Managed
                  </CardTitle>
                </div>
                <CardDescription>
                  Your instance is fully managed by Forge.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-primary/10 border border-primary/20 p-4 rounded-lg text-sm text-foreground/90 space-y-2">
                  <p>
                    <strong>Current Region:</strong> AWS us-west-2 (Oregon)
                  </p>
                  <p>
                    <strong>Database:</strong> Multi-AZ High Availability
                  </p>
                  <p>
                    <strong>Storage:</strong> S3 with Transfer Acceleration
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-6 opacity-60">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3 mb-1">
                    <Building2 className="w-6 h-6" />
                    <CardTitle>On-Premises</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Deploy Forge inside your studio's firewall. Requires
                  Enterprise license.
                  <div className="mt-4">
                    <Button variant="outline" size="sm" disabled>
                      Contact Sales
                    </Button>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3 mb-1">
                    <Cloud className="w-6 h-6" />
                    <CardTitle>Hybrid Connect</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  SaaS control plane with on-premise asset storage mounts.
                  <div className="mt-4">
                    <Button variant="outline" size="sm" disabled>
                      Contact Sales
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}

        {canManageIntegrations && (
          <TabsContent
            value="developer"
            className="space-y-6 animate-in fade-in"
          >
            <Card>
              <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
                <div>
                  <CardTitle>API Keys</CardTitle>
                  <CardDescription>
                    Manage personal access tokens for API requests.
                  </CardDescription>
                </div>
                <Button size="sm" onClick={() => setTokenDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" /> Generate New Token
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b border-border">
                    <tr>
                      <th className="p-4 text-left font-medium text-muted-foreground">
                        Token Name
                      </th>
                      <th className="p-4 text-left font-medium text-muted-foreground">
                        Key
                      </th>
                      <th className="p-4 text-left font-medium text-muted-foreground">
                        Last Used
                      </th>
                      <th className="p-4 text-left font-medium text-muted-foreground">
                        Created
                      </th>
                      <th className="p-4 text-center font-medium text-muted-foreground">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiKeys.length === 0 && (
                      <tr>
                        <td
                          colSpan={5}
                          className="p-4 text-center text-muted-foreground text-sm"
                        >
                          No API keys. Generate one to get started.
                        </td>
                      </tr>
                    )}
                    {apiKeys.map((key) => (
                      <tr
                        key={key.id}
                        className="border-b border-border last:border-0 hover:bg-muted/10"
                      >
                        <td className="p-4 font-medium flex items-center gap-2">
                          <Key className="w-4 h-4 text-muted-foreground" />{" "}
                          {key.name}
                        </td>
                        <td className="p-4 font-mono text-xs text-muted-foreground">
                          {key.tokenPrefix}…
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {formatTimestamp(key.lastUsedAt) ?? "Never used"}
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {new Date(key.createdAt).toLocaleDateString()}
                        </td>
                        <td className="p-4 text-center">
                          {key.revokedAt ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-muted-foreground"
                            >
                              Revoked{" "}
                              {new Date(key.revokedAt).toLocaleDateString()}
                            </Badge>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                              disabled={revokeApiKey.isPending}
                              onClick={() =>
                                handleRevokeApiKey(key.id, key.name)
                              }
                            >
                              Revoke
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Python SDK Quickstart</CardTitle>
                <CardDescription>
                  Initialize the Forge Python API to fetch project data.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative group">
                  <div
                    className="absolute top-2 right-2 p-1.5 bg-muted rounded cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted-foreground/20"
                    onClick={handleCopyCode}
                  >
                    <Copy className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <pre className="bg-card border border-border p-4 rounded-md text-sm font-mono text-muted-foreground overflow-x-auto">
                    <span className="text-blue-400">import</span> forge_api
                    <br />
                    <br />
                    <span className="text-green-500">
                      # Connect to your workspace
                    </span>
                    <br />
                    session <span className="text-blue-400">=</span>{" "}
                    forge_api.Session(
                    <br />
                    &nbsp;&nbsp;&nbsp;&nbsp;server_url
                    <span className="text-blue-400">=</span>
                    <span className="text-orange-300">
                      "https://nebula.forge.studio"
                    </span>
                    ,<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;api_key
                    <span className="text-blue-400">=</span>
                    <span className="text-orange-300">"YOUR_API_KEY"</span>
                    <br />
                    )<br />
                    <br />
                    <span className="text-green-500">
                      # Fetch shots needing review
                    </span>
                    <br />
                    shots <span className="text-blue-400">=</span>{" "}
                    session.query(
                    <span className="text-orange-300">
                      'Shot where status is "review"'
                    </span>
                    )<br />
                    <span className="text-blue-400">print</span>(
                    <span className="text-orange-300">
                      f"Found {"{"}len(shots){"}"} shots for review"
                    </span>
                    )
                  </pre>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
                <div>
                  <CardTitle>Webhooks</CardTitle>
                  <CardDescription>
                    Listen to real-time events across your studio.
                  </CardDescription>
                </div>
                <Button size="sm" onClick={() => setWebhookDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" /> Add Endpoint
                </Button>
              </CardHeader>
              <CardContent className="pt-6">
                {webhookEndpoints.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border-2 border-dashed border-border rounded-lg">
                    <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No webhook endpoints configured.</p>
                    <p className="text-xs mt-1">
                      Add an endpoint to receive events like{" "}
                      <code>task.status.changed</code> or{" "}
                      <code>version.published</code>.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {webhookEndpoints.map((ep) => (
                      <div
                        key={ep.id}
                        className="flex items-center justify-between p-3 border border-border rounded-lg gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Terminal className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-sm font-mono truncate">
                            {ep.url}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {ep.events.map((event) => (
                            <Badge
                              key={event}
                              variant="secondary"
                              className="text-[10px]"
                            >
                              {event}
                            </Badge>
                          ))}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                            disabled={deleteWebhook.isPending}
                            onClick={() => handleDeleteWebhook(ep.id, ep.url)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={oktaDialogOpen} onOpenChange={setOktaDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Configure Okta SSO</DialogTitle>
            <DialogDescription>
              Enter your Okta domain to enable SAML 2.0 single sign-on.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="okta-domain">Okta Domain</Label>
            <Input
              id="okta-domain"
              placeholder="yourstudio.okta.com"
              value={oktaDomainDraft}
              onChange={(e) => setOktaDomainDraft(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOktaDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitOkta}
              disabled={!oktaDomainDraft.trim()}
            >
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={stageDialogDept !== null}
        onOpenChange={(open) => !open && setStageDialogDept(null)}
      >
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Add {stageDialogDept} Stage</DialogTitle>
            <DialogDescription>
              Add a new stage to the {stageDialogDept} pipeline.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="stage-name">Stage Name</Label>
            <Input
              id="stage-name"
              placeholder="e.g. Look Dev"
              value={newStageName}
              onChange={(e) => setNewStageName(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStageDialogDept(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitStage}
              disabled={!newStageName.trim() || saveStages.isPending}
            >
              Add Stage
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={licenseDialogOpen} onOpenChange={setLicenseDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Add License Server</DialogTitle>
            <DialogDescription>
              Track a new software license and its seat allocation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="license-name">Software Name</Label>
              <Input
                id="license-name"
                placeholder="e.g. RV Player"
                value={licenseNameDraft}
                onChange={(e) => setLicenseNameDraft(e.target.value)}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="license-vendor">Vendor</Label>
                <Input
                  id="license-vendor"
                  placeholder="e.g. Autodesk"
                  value={licenseVendorDraft}
                  onChange={(e) => setLicenseVendorDraft(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="license-seats">Seats Owned</Label>
                <Input
                  id="license-seats"
                  type="number"
                  min={0}
                  value={licenseSeatsDraft}
                  onChange={(e) => setLicenseSeatsDraft(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setLicenseDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitLicense}
              disabled={
                !licenseNameDraft.trim() || createLicenseServer.isPending
              }
            >
              Add Server
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Generate New Token</DialogTitle>
            <DialogDescription>
              Create a new personal access token for API requests.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="token-name">Token Name</Label>
            <Input
              id="token-name"
              placeholder="e.g. Nuke Render Script"
              value={tokenNameDraft}
              onChange={(e) => setTokenNameDraft(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              The token is shown once, immediately after it's created, and
              cannot be retrieved afterwards.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTokenDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitToken}
              disabled={!tokenNameDraft.trim() || createApiKey.isPending}
            >
              Generate Token
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={webhookDialogOpen} onOpenChange={setWebhookDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Add Webhook Endpoint</DialogTitle>
            <DialogDescription>
              Receive real-time events at a URL you control.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="webhook-url">Endpoint URL</Label>
              <Input
                id="webhook-url"
                placeholder="https://your-server.com/webhooks/forge"
                value={webhookUrlDraft}
                onChange={(e) => setWebhookUrlDraft(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Event</Label>
              <Select
                value={webhookEventDraft}
                onValueChange={setWebhookEventDraft}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="task.status.changed">
                    task.status.changed
                  </SelectItem>
                  <SelectItem value="version.published">
                    version.published
                  </SelectItem>
                  <SelectItem value="review.requested">
                    review.requested
                  </SelectItem>
                  <SelectItem value="review.approved">
                    review.approved
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setWebhookDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitWebhook}
              disabled={!webhookUrlDraft.trim() || createWebhook.isPending}
            >
              Add Endpoint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={revealedSecret !== null}
        onOpenChange={(open) => !open && setRevealedSecret(null)}
      >
        <DialogContent className="sm:max-w-[520px]">
          {revealedSecret && (
            <>
              <DialogHeader>
                <DialogTitle>{revealedSecret.title}</DialogTitle>
                <DialogDescription>
                  {revealedSecret.description}
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2 py-2">
                <code className="flex-1 min-w-0 break-all rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">
                  {revealedSecret.value}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopySecret}
                  aria-label="Copy to clipboard"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={() => setRevealedSecret(null)}>
                  I've saved it
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
