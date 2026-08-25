import { useRoute, Link } from "wouter";
import { PLUGINS } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChevronLeft,
  Star,
  ShieldCheck,
  Download,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";
import { usePluginsStore } from "@/store/plugins";
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
  const {
    installedPlugins,
    enabledPlugins,
    installPlugin,
    uninstallPlugin,
    togglePlugin,
  } = usePluginsStore();
  const { toast } = useToast();
  const canManageIntegrations = useCapability("manage_integrations");

  if (!plugin) return <div>Plugin not found</div>;

  const isInstalled = installedPlugins[plugin.id];
  const isEnabled = enabledPlugins[plugin.id];

  const handleInstall = () => {
    if (!canManageIntegrations) return;
    installPlugin(plugin.id);
    toast({
      title: "Plugin installed",
      description: `${plugin.name} is now active.`,
    });
  };

  const handleUninstall = () => {
    if (!canManageIntegrations) return;
    uninstallPlugin(plugin.id);
    toast({ description: `${plugin.name} removed.` });
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
              {plugin.verified ? (
                <div className="bg-blue-500/10 text-blue-500 border border-blue-500/30 px-2 py-0.5 rounded text-xs flex items-center gap-1 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5" /> Verified
                </div>
              ) : (
                <div className="bg-orange-500/10 text-orange-500 border border-orange-500/30 px-2 py-0.5 rounded text-xs flex items-center gap-1 font-medium">
                  <ShieldAlert className="w-3.5 h-3.5" /> Unverified
                </div>
              )}
            </div>
            <div className="text-muted-foreground mb-6">
              By {plugin.author} • Version {plugin.version}
            </div>

            <div className="flex items-center gap-6 mb-8">
              <div className="flex flex-col">
                <div className="flex items-center gap-1 font-bold text-xl">
                  {plugin.rating}{" "}
                  <Star className="w-5 h-5 fill-yellow-500 text-yellow-500 mb-0.5" />
                </div>
                <span className="text-xs text-muted-foreground">Rating</span>
              </div>
              <div className="w-px h-10 bg-border" />
              <div className="flex flex-col">
                <div className="flex items-center gap-1 font-bold text-xl">
                  {plugin.installs}{" "}
                  <Download className="w-5 h-5 text-muted-foreground mb-0.5" />
                </div>
                <span className="text-xs text-muted-foreground">Installs</span>
              </div>
            </div>

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
                      onCheckedChange={() =>
                        canManageIntegrations && togglePlugin(plugin.id)
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
              {plugin.description} Compatible with {plugin.compatibility}. Last
              updated {plugin.lastUpdated}.
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
                <h3 className="font-semibold">Permissions Required</h3>
                <ul className="text-sm space-y-3 text-muted-foreground">
                  <li className="flex gap-2">
                    <CheckCircle2 className="w-4 h-4 text-status-green shrink-0" />{" "}
                    Read asset metadata
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="w-4 h-4 text-status-green shrink-0" />{" "}
                    Create new versions
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="w-4 h-4 text-status-green shrink-0" />{" "}
                    Post comments on review sessions
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="w-4 h-4 text-status-green shrink-0" />{" "}
                    Access render logs
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
