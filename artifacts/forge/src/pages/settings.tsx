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
import { useUserStore } from "@/store/users";
import { useCapability } from "@/hooks/use-capability";
import {
  CAPABILITIES,
  CAPABILITY_CATEGORIES,
  ROLES_ORDER,
  DEFAULT_PERMISSION_SCHEME,
} from "@/store/permissions";
import {
  useNotificationStore,
  NOTIFICATION_PREFERENCE_META,
} from "@/store/notifications";
import {
  useStudioSettingsStore,
  type PipelineDept,
} from "@/store/studioSettings";

export default function Settings() {
  const { toast } = useToast();

  const currentUser = useAuthStore((s) => s.currentUser);
  const users = useUserStore((s) => s.users);
  const notificationPreferences = useNotificationStore((s) => s.preferences);
  const setNotificationPreference = useNotificationStore(
    (s) => s.setPreferenceChannel,
  );
  const profile = useStudioSettingsStore((s) => s.profile);
  const setProfile = useStudioSettingsStore((s) => s.setProfile);
  const security = useStudioSettingsStore((s) => s.security);
  const setSecurity = useStudioSettingsStore((s) => s.setSecurity);
  const pipelineStages = useStudioSettingsStore((s) => s.pipelineStages);
  const addPipelineStage = useStudioSettingsStore((s) => s.addPipelineStage);
  const admins = useStudioSettingsStore((s) => s.admins);
  const toggleAdmin = useStudioSettingsStore((s) => s.toggleAdmin);
  const apiKeys = useStudioSettingsStore((s) => s.apiKeys);
  const generateApiKey = useStudioSettingsStore((s) => s.generateApiKey);
  const revokeApiKey = useStudioSettingsStore((s) => s.revokeApiKey);
  const webhookEndpoints = useStudioSettingsStore((s) => s.webhookEndpoints);
  const addWebhookEndpoint = useStudioSettingsStore(
    (s) => s.addWebhookEndpoint,
  );
  const licenseServers = useStudioSettingsStore((s) => s.licenseServers);
  const addLicenseServer = useStudioSettingsStore((s) => s.addLicenseServer);
  const pendingInvites = useStudioSettingsStore((s) => s.pendingInvites);
  const inviteMember = useStudioSettingsStore((s) => s.inviteMember);

  const [oktaDialogOpen, setOktaDialogOpen] = useState(false);
  const [oktaDomainDraft, setOktaDomainDraft] = useState("");

  const [stageDialogDept, setStageDialogDept] = useState<PipelineDept | null>(
    null,
  );
  const [newStageName, setNewStageName] = useState("");

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmailDraft, setInviteEmailDraft] = useState("");

  const [licenseDialogOpen, setLicenseDialogOpen] = useState(false);
  const [licenseNameDraft, setLicenseNameDraft] = useState("");
  const [licenseTypeDraft, setLicenseTypeDraft] = useState("Floating");
  const [licenseSeatsDraft, setLicenseSeatsDraft] = useState("10");

  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [tokenNameDraft, setTokenNameDraft] = useState("");

  const [webhookDialogOpen, setWebhookDialogOpen] = useState(false);
  const [webhookUrlDraft, setWebhookUrlDraft] = useState("");
  const [webhookEventDraft, setWebhookEventDraft] = useState(
    "task.status.changed",
  );

  const handleConfigureOkta = () => {
    setOktaDomainDraft(security.oktaDomain);
    setOktaDialogOpen(true);
  };

  const handleSubmitOkta = () => {
    if (!oktaDomainDraft.trim()) return;
    setSecurity({ oktaConfigured: true, oktaDomain: oktaDomainDraft.trim() });
    toast({
      title: "Okta SSO configured",
      description: `Members will now be directed to ${oktaDomainDraft.trim()} to sign in.`,
    });
    setOktaDialogOpen(false);
  };

  const handleOpenAddStage = (dept: PipelineDept) => {
    setNewStageName("");
    setStageDialogDept(dept);
  };

  const handleSubmitStage = () => {
    if (!stageDialogDept || !newStageName.trim()) return;
    addPipelineStage(stageDialogDept, newStageName.trim());
    toast({
      title: "Stage added",
      description: `"${newStageName.trim()}" added to the ${stageDialogDept} pipeline.`,
    });
    setStageDialogDept(null);
  };

  const handleSubmitInvite = () => {
    if (!inviteEmailDraft.trim()) return;
    inviteMember(inviteEmailDraft.trim());
    toast({
      title: "Invitation sent",
      description: `An invite was sent to ${inviteEmailDraft.trim()}.`,
    });
    setInviteEmailDraft("");
    setInviteDialogOpen(false);
  };

  const handleSubmitLicense = () => {
    if (!licenseNameDraft.trim()) return;
    addLicenseServer({
      name: licenseNameDraft.trim(),
      type: licenseTypeDraft,
      owned: Number(licenseSeatsDraft) || 0,
    });
    toast({
      title: "License server added",
      description: `${licenseNameDraft.trim()} is now tracked in License Management.`,
    });
    setLicenseNameDraft("");
    setLicenseSeatsDraft("10");
    setLicenseDialogOpen(false);
  };

  const handleSubmitToken = () => {
    const name = tokenNameDraft.trim() || "Untitled Token";
    generateApiKey(name);
    toast({
      title: "API token generated",
      description: `"${name}" can now be used to authenticate API requests.`,
    });
    setTokenNameDraft("");
    setTokenDialogOpen(false);
  };

  const handleRevokeApiKey = (id: string, name: string) => {
    revokeApiKey(id);
    toast({
      title: "API key revoked",
      description: `"${name}" can no longer be used to authenticate.`,
    });
  };

  const handleSubmitWebhook = () => {
    if (!webhookUrlDraft.trim()) return;
    addWebhookEndpoint(webhookUrlDraft.trim(), webhookEventDraft);
    toast({
      title: "Webhook endpoint added",
      description: `Events will now be sent to ${webhookUrlDraft.trim()}.`,
    });
    setWebhookUrlDraft("");
    setWebhookDialogOpen(false);
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

  // Role-scoped tab visibility: derived from the current user's real capabilities
  // (fixed per-role in DEFAULT_PERMISSION_SCHEME), not a hardcoded role list.
  // Notifications is a personal preference, so it's always visible to anyone who reaches this page
  // (see App.tsx's route-level LeadershipGuard, which must not wrap /settings or
  // non-leadership members can never reach this tab at all).
  const canManageRoles = useCapability("manage_roles");
  const canManageMembers = useCapability("manage_members");
  const canManagePipeline = useCapability("manage_pipeline");
  const canManageLicenses = useCapability("manage_licenses");
  const canManageIntegrations = useCapability("manage_integrations");

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
                          onChange={(e) =>
                            setProfile({ studioName: e.target.value })
                          }
                          className="max-w-md"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Industry</Label>
                        <Select
                          value={profile.industry}
                          onValueChange={(value) =>
                            setProfile({ industry: value })
                          }
                        >
                          <SelectTrigger className="max-w-md">
                            <SelectValue />
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
                      onValueChange={(value) => setProfile({ timezone: value })}
                    >
                      <SelectTrigger className="max-w-md">
                        <SelectValue />
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

                  <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                    Changes save automatically.
                  </p>
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
                          setSecurity({ enforce2FA: checked })
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
                        setSecurity({ ipAllowlist: e.target.value })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Restrict access to Forge to specific office or VPN IP
                      ranges.
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                    Changes save automatically.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </>
        )}

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
                {pendingInvites.length > 0 && (
                  <div className="px-4 py-3 border-b border-border bg-muted/10 space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Pending Invites
                    </p>
                    {pendingInvites.map((invite) => (
                      <div
                        key={invite.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span>{invite.email}</span>
                        <Badge variant="outline" className="text-[10px]">
                          Invited{" "}
                          {new Date(invite.invitedAt).toLocaleDateString()}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
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
                              checked={admins[user.id] ?? false}
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
                                      DEFAULT_PERMISSION_SCHEME[role]?.[
                                        cap.id
                                      ] ?? false;
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
                        Type
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
                    {licenseServers.map((lic) => {
                      const ratio = lic.owned > 0 ? lic.used / lic.owned : 0;
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
                            {lic.type}
                          </td>
                          <td className="p-4 text-center">{lic.used}</td>
                          <td className="p-4 text-center">{lic.owned}</td>
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
                        Last Used
                      </th>
                      <th className="p-4 text-left font-medium text-muted-foreground">
                        Expires
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
                          colSpan={4}
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
                        <td className="p-4 text-muted-foreground">
                          {key.lastUsed}
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {key.expires}
                        </td>
                        <td className="p-4 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                            onClick={() => handleRevokeApiKey(key.id, key.name)}
                          >
                            Revoke
                          </Button>
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
                        className="flex items-center justify-between p-3 border border-border rounded-lg"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Terminal className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-sm font-mono truncate">
                            {ep.url}
                          </span>
                        </div>
                        <Badge
                          variant="secondary"
                          className="text-[10px] shrink-0"
                        >
                          {ep.event}
                        </Badge>
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
            <Button onClick={handleSubmitStage} disabled={!newStageName.trim()}>
              Add Stage
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Invite Member</DialogTitle>
            <DialogDescription>
              Send an invitation to join your studio in Forge.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="invite-email">Email Address</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="artist@studio.com"
              value={inviteEmailDraft}
              onChange={(e) => setInviteEmailDraft(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setInviteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitInvite}
              disabled={!inviteEmailDraft.trim()}
            >
              Send Invite
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
                <Label>License Type</Label>
                <Select
                  value={licenseTypeDraft}
                  onValueChange={setLicenseTypeDraft}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Floating">Floating</SelectItem>
                    <SelectItem value="Node-locked">Node-locked</SelectItem>
                    <SelectItem value="Render Node">Render Node</SelectItem>
                    <SelectItem value="Enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
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
              disabled={!licenseNameDraft.trim()}
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTokenDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitToken}>Generate Token</Button>
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
              disabled={!webhookUrlDraft.trim()}
            >
              Add Endpoint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
