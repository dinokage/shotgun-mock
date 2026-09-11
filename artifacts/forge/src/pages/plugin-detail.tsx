import { useRoute, Link } from "wouter";
import { PLUGINS } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft } from "lucide-react";
import {
  useInstalledPlugins,
  useInstallPlugin,
  useUninstallPlugin,
  useSetPluginEnabled,
} from "@/hooks/usePlugins";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCapability } from "@/hooks/use-capability";

export default function PluginDetail() {
  const [, params] = useRoute("/marketplace/:id");
  const plugin = PLUGINS.find((p) => p.id === params?.id);
  const { data: installed = [] } = useInstalledPlugins();
  const installPlugin = useInstallPlugin();
  const uninstallPlugin = useUninstallPlugin();
  const setPluginEnabled = useSetPluginEnabled();
  const { toast } = useToast();
  const canManageIntegrations = useCapability("manage_integrations");

  if (!plugin) return <div>Plugin not found</div>;

  // No row on the server means this studio has never installed it.
  const state = installed.find((p) => p.pluginId === plugin.id);
  const isInstalled = !!state;
  const isEnabled = state?.enabled ?? false;

  const handleInstall = () => {
    if (!canManageIntegrations) return;
    installPlugin.mutate(plugin.id, {
      onSuccess: () =>
        toast({
          title: "Plugin installed",
          description: `${plugin.name} is now active.`,
        }),
    });
  };

  const handleUninstall = () => {
    if (!canManageIntegrations) return;
    uninstallPlugin.mutate(plugin.id, {
      onSuccess: () => toast({ description: `${plugin.name} removed.` }),
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="h-14 border-b border-border bg-card flex items-center px-4 shrink-0 gap-4">
        <Button
          variant="ghost"
          size="icon"
          asChild
          className="h-8 w-8 text-muted-foreground -ml-2"
        >
          <Link href="/marketplace">
            <ChevronLeft className="w-5 h-5" />
          </Link>
        </Button>
        <div className="font-semibold">{plugin.name}</div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full space-y-8">
        <div className="flex items-start gap-8">
          <div className="w-32 h-32 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0 border border-primary/20">
            <span className="text-5xl font-bold">{plugin.name.charAt(0)}</span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-4xl font-bold tracking-tight">
                {plugin.name}
              </h1>
            </div>
            <div className="text-muted-foreground mb-8">{plugin.category}</div>

            <div className="flex gap-4 p-4 border border-border rounded-lg bg-card max-w-md">
              {isInstalled ? (
                <>
                  <div className="flex-1 flex items-center justify-between border-r border-border pr-4">
                    <span className="font-medium text-sm">
                      {isEnabled ? "Active" : "Disabled"}
                    </span>
                    <Switch
                      checked={isEnabled}
                      disabled={!canManageIntegrations}
                      onCheckedChange={(next) =>
                        canManageIntegrations &&
                        setPluginEnabled.mutate({
                          pluginId: plugin.id,
                          enabled: next,
                        })
                      }
                    />
                  </div>
                  <Button
                    variant="destructive"
                    onClick={handleUninstall}
                    disabled={!canManageIntegrations}
                    className="w-24"
                  >
                    Uninstall
                  </Button>
                </>
              ) : canManageIntegrations ? (
                <Button
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                  onClick={handleInstall}
                >
                  Install Plugin
                </Button>
              ) : (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="w-full" tabIndex={0}>
                        <Button className="w-full" disabled>
                          Install Plugin
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="max-w-[220px] text-xs"
                    >
                      You don't have permission to manage integrations.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-8">
          <div className="col-span-2 space-y-6">
            <h2 className="text-xl font-semibold border-b border-border pb-2">
              Overview
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              {plugin.description}
            </p>
            <div className="flex gap-4 pt-4">
              <div className="w-1/2 aspect-video bg-muted rounded-lg border border-border flex items-center justify-center text-muted-foreground/30 font-medium">
                Screenshot 1
              </div>
              <div className="w-1/2 aspect-video bg-muted rounded-lg border border-border flex items-center justify-center text-muted-foreground/30 font-medium">
                Screenshot 2
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <Card>
              <CardContent className="p-4 space-y-4">
                {/* The four permissions listed here were identical for every
                    plugin — an invented per-plugin claim about what a studio
                    would be granting. There is no column behind it, so it says
                    what is actually true instead. */}
                <h3 className="font-semibold">Permissions Required</h3>
                <p className="text-sm text-muted-foreground">
                  This plugin has not published a permissions manifest yet.
                  Check with the author before installing it on a live show.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
