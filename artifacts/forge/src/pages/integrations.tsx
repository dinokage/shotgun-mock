import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useAuthStore } from "@/store/auth";
import { ComingSoon } from "@/components/shared/ComingSoon";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  AlertTriangle,
  Settings,
  RefreshCw,
  UploadCloud,
  Link as LinkIcon,
  Puzzle,
  Search,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useIntegrations,
  useSaveIntegration,
  useSyncIntegration,
  type IntegrationStatus,
} from "@/hooks/useIntegrations";
import {
  useStudioSetting,
  useSaveStudioSetting,
} from "@/hooks/useStudioSettings";
import { useCapability } from "@/hooks/use-capability";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";

// The catalogue of DCC tools Forge ships a plugin for. This is a product fact,
// so it stays static -- but nothing here says whether a studio has connected
// any of them: that comes entirely from the integrations table.
const INTEGRATION_CATALOGUE = [
  { provider: "maya", name: "Autodesk Maya", category: "3D/Animation", icon: "M" },
  { provider: "blender", name: "Blender", category: "3D/Animation", icon: "B" },
  { provider: "nuke", name: "Foundry Nuke", category: "Compositing", icon: "N" },
  { provider: "houdini", name: "SideFX Houdini", category: "FX/Simulation", icon: "H" },
  { provider: "premiere", name: "Adobe Premiere Pro", category: "Editing", icon: "Pr" },
  { provider: "photoshop", name: "Adobe Photoshop", category: "2D/Matte Painting", icon: "Ps" },
];

interface PathConfig {
  winPath: string;
  macPath: string;
  pythonInterpreter: string;
  apiUrl: string;
}

const EMPTY_PATH_CONFIG: PathConfig = {
  winPath: "",
  macPath: "",
  pythonInterpreter: "",
  apiUrl: "",
};

function formatLastSync(lastSyncAt: string | null) {
  return lastSyncAt ? new Date(lastSyncAt).toLocaleString() : "Never";
}

export default function IntegrationsHub() {
  const { currentUser } = useAuthStore();
  const { toast } = useToast();
  const { data: connections = [] } = useIntegrations();
  const saveIntegration = useSaveIntegration();
  const syncIntegration = useSyncIntegration();
  const canManageIntegrations = useCapability("manage_integrations");

  const pathSetting = useStudioSetting<PathConfig>("pipeline_paths");
  const savePathConfig = useSaveStudioSetting<PathConfig>("pipeline_paths");

  const [settingsProvider, setSettingsProvider] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [pathDraft, setPathDraft] = useState<PathConfig | null>(null);
  const formConfig = pathDraft ?? pathSetting.data?.value ?? EMPTY_PATH_CONFIG;

  // A catalogue entry with no row in the integrations table has never been
  // connected, so it reads as disconnected with no sync history -- never as a
  // fabricated "connected".
  const allIntegrations = useMemo(() => {
    const byProvider = new Map(connections.map((c) => [c.provider, c]));
    return INTEGRATION_CATALOGUE.map((entry) => {
      const connection = byProvider.get(entry.provider) ?? null;
      return {
        ...entry,
        status: (connection?.status ?? "disconnected") as IntegrationStatus,
        autoSync: connection?.autoSync ?? false,
        lastSync: formatLastSync(connection?.lastSyncAt ?? null),
      };
    });
  }, [connections]);

  // No DCC hooks are wired up behind any of these yet -- "connecting" Maya
  // or Nuke here would flip a status flag with nothing real behind it.
  // Admin keeps the working page while that's built.
  if (currentUser?.role !== "admin") {
    return (
      <ComingSoon
        icon={LinkIcon}
        title="DCC Integrations"
        description="Direct integration with Maya, Nuke, Houdini and other DCC tools isn't built yet. This page will let you connect and manage them once it is."
      />
    );
  }

  const integrations = allIntegrations.filter((integration) => {
    const q = search.trim().toLowerCase();
    if (q === "") return true;
    return (
      integration.name.toLowerCase().includes(q) ||
      integration.category.toLowerCase().includes(q)
    );
  });
  const settingsIntegration =
    allIntegrations.find((i) => i.provider === settingsProvider) ?? null;

  const handleSync = async (provider: string, name: string) => {
    if (!canManageIntegrations) return;
    const current = allIntegrations.find((i) => i.provider === provider);
    const wasDisconnected = current?.status === "disconnected";
    try {
      await syncIntegration.mutateAsync({ provider, displayName: name });
      toast({
        title: wasDisconnected ? "Connected" : "Sync Initiated",
        description: wasDisconnected
          ? `${name} is now connected and synchronized.`
          : `Synchronizing pipeline data with ${name}...`,
      });
    } catch (err) {
      toast({
        title: "Sync failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSyncAll = async () => {
    if (!canManageIntegrations) return;
    // Only re-sync integrations that are already connected (or need an
    // update) — this must not silently provision/connect anything that's
    // currently disconnected. Use "Connect" on the card for that.
    const syncable = allIntegrations.filter(
      (integration) => integration.status !== "disconnected",
    );
    if (syncable.length === 0) {
      toast({
        title: "Nothing to sync",
        description: "No integrations are connected yet.",
      });
      return;
    }
    try {
      await Promise.all(
        syncable.map((integration) =>
          syncIntegration.mutateAsync({
            provider: integration.provider,
            displayName: integration.name,
          }),
        ),
      );
      toast({
        title: "Sync All Initiated",
        description: `Synchronizing pipeline data with ${syncable.length} connected integrations...`,
      });
    } catch (err) {
      toast({
        title: "Sync failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleToggleAutoSync = async (
    provider: string,
    name: string,
    enabled: boolean,
  ) => {
    if (!canManageIntegrations) return;
    try {
      await saveIntegration.mutateAsync({
        provider,
        displayName: name,
        autoSync: enabled,
      });
    } catch (err) {
      toast({
        title: "Could not update auto-sync",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSaveConfig = async () => {
    if (!canManageIntegrations) return;
    try {
      await savePathConfig.mutateAsync(formConfig);
      toast({
        title: "Configuration Saved",
        description:
          "Path mapping and environment variables have been updated.",
      });
    } catch (err) {
      toast({
        title: "Could not save configuration",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          DCC Integrations
        </h1>
        <p className="text-muted-foreground">
          Manage pipeline connections to Digital Content Creation tools.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <Input
          placeholder="Search integrations..."
          className="max-w-md"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {!canManageIntegrations && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button variant="outline" disabled>
                    <RefreshCw className="w-4 h-4 mr-2" /> Sync All
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[220px] text-xs">
                You don't have permission to manage integrations.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {canManageIntegrations && (
          <Button
            variant="outline"
            onClick={handleSyncAll}
            disabled={syncIntegration.isPending}
          >
            <RefreshCw className="w-4 h-4 mr-2" /> Sync All
          </Button>
        )}
        <Button asChild>
          <Link href="/marketplace">
            <Puzzle className="w-4 h-4 mr-2" /> Install Plugin
          </Link>
        </Button>
      </div>

      {integrations.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search />
            </EmptyMedia>
            <EmptyTitle>No integrations match your search</EmptyTitle>
            <EmptyDescription>
              Try a different name or category.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {integrations.map((integration) => (
          <Card
            key={integration.provider}
            className="relative overflow-hidden group"
          >
            {integration.status === "connected" && (
              <div className="absolute top-0 right-0 w-16 h-16 bg-green-500/10 rounded-bl-full -z-10 transition-transform group-hover:scale-110" />
            )}
            <CardHeader className="pb-4">
              <div className="flex justify-between items-start">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center font-bold text-xl text-primary mb-3">
                  {integration.icon}
                </div>
                <Badge
                  variant="outline"
                  className={
                    integration.status === "connected"
                      ? "bg-green-500/10 text-green-500 border-green-500/20"
                      : integration.status === "warning"
                        ? "bg-orange-500/10 text-orange-500 border-orange-500/20"
                        : "bg-muted text-muted-foreground"
                  }
                >
                  {integration.status === "connected" ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Connected
                    </>
                  ) : integration.status === "warning" ? (
                    <>
                      <AlertTriangle className="w-3 h-3 mr-1" /> Update Reqd
                    </>
                  ) : (
                    <>
                      <LinkIcon className="w-3 h-3 mr-1" /> Disconnected
                    </>
                  )}
                </Badge>
              </div>
              <CardTitle>{integration.name}</CardTitle>
              <CardDescription>{integration.category}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Auto-sync</span>
                  <span>{integration.autoSync ? "On" : "Off"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Last Sync</span>
                  <span>{integration.lastSync}</span>
                </div>
                <div className="pt-4 flex gap-2">
                  <Button
                    variant={
                      integration.status === "disconnected"
                        ? "default"
                        : "outline"
                    }
                    className="flex-1"
                    disabled={!canManageIntegrations || syncIntegration.isPending}
                    onClick={() =>
                      handleSync(integration.provider, integration.name)
                    }
                  >
                    {integration.status === "disconnected"
                      ? "Connect"
                      : "Sync Data"}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setSettingsProvider(integration.provider);
                    }}
                    aria-label={`${integration.name} settings`}
                  >
                    <Settings className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Global Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Global Pipeline Configuration
          </CardTitle>
          <CardDescription>
            Path mapping and environment variables for DCC tools.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Project Root Path (Windows)
              </label>
              <Input
                placeholder="e.g. Z:\Projects\Forge"
                value={formConfig.winPath}
                onChange={(e) =>
                  setPathDraft({ ...formConfig, winPath: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Project Root Path (macOS/Linux)
              </label>
              <Input
                placeholder="e.g. /Volumes/Projects/Forge"
                value={formConfig.macPath}
                onChange={(e) =>
                  setPathDraft({ ...formConfig, macPath: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Python Interpreter</label>
              <Input
                placeholder="e.g. /usr/local/bin/python3"
                value={formConfig.pythonInterpreter}
                onChange={(e) =>
                  setPathDraft({
                    ...formConfig,
                    pythonInterpreter: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                ShotGrid/Forge API URL
              </label>
              <Input
                placeholder="e.g. https://api.yourstudio.local/v1"
                value={formConfig.apiUrl}
                onChange={(e) =>
                  setPathDraft({ ...formConfig, apiUrl: e.target.value })
                }
              />
            </div>
          </div>
          {canManageIntegrations ? (
            <Button
              className="mt-4"
              onClick={handleSaveConfig}
              disabled={savePathConfig.isPending}
            >
              <UploadCloud className="w-4 h-4 mr-2" /> Save Configuration
            </Button>
          ) : (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="inline-block">
                    <Button className="mt-4" disabled>
                      <UploadCloud className="w-4 h-4 mr-2" /> Save
                      Configuration
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px] text-xs">
                  You don't have permission to manage integrations.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={settingsIntegration !== null}
        onOpenChange={(open) => !open && setSettingsProvider(null)}
      >
        <DialogContent className="max-w-md">
          {settingsIntegration && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center font-bold text-sm text-primary">
                    {settingsIntegration.icon}
                  </span>
                  {settingsIntegration.name}
                </DialogTitle>
                <DialogDescription>
                  {settingsIntegration.category} integration settings
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <Badge
                    variant="outline"
                    className={
                      settingsIntegration.status === "connected"
                        ? "bg-green-500/10 text-green-500 border-green-500/20"
                        : settingsIntegration.status === "warning"
                          ? "bg-orange-500/10 text-orange-500 border-orange-500/20"
                          : "bg-muted text-muted-foreground"
                    }
                  >
                    {settingsIntegration.status === "connected"
                      ? "Connected"
                      : settingsIntegration.status === "warning"
                        ? "Update Reqd"
                        : "Disconnected"}
                  </Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Last Sync</span>
                  <span>{settingsIntegration.lastSync}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
                  <div>
                    <div className="text-sm font-medium">Auto-sync</div>
                    <div className="text-xs text-muted-foreground">
                      Automatically pull pipeline data on a schedule
                    </div>
                  </div>
                  <Switch
                    checked={settingsIntegration.autoSync}
                    disabled={!canManageIntegrations || saveIntegration.isPending}
                    onCheckedChange={(checked) =>
                      handleToggleAutoSync(
                        settingsIntegration.provider,
                        settingsIntegration.name,
                        checked,
                      )
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={!canManageIntegrations || syncIntegration.isPending}
                  onClick={() => {
                    handleSync(
                      settingsIntegration.provider,
                      settingsIntegration.name,
                    );
                    setSettingsProvider(null);
                  }}
                >
                  <RefreshCw className="w-4 h-4 mr-2" /> Sync Now
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
