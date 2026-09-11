import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { stagger } from "@/lib/motion";
import { useAuthStore } from "@/store/auth";
import { ComingSoon } from "@/components/shared/ComingSoon";
import { PLUGINS } from "@/data/mockData";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  useInstalledPlugins,
  useInstallPlugin,
  useUninstallPlugin,
  useSetPluginEnabled,
} from "@/hooks/usePlugins";
import {
  Search,
  Package,
  Zap,
  Link as LinkIcon,
  Activity,
  PenTool,
  Palette,
  Link2,
  Camera,
  GitFork,
  Globe,
  DollarSign,
  Plug,
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCapability } from "@/hooks/use-capability";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";

const ICON_MAP: Record<string, any> = {
  Package,
  Zap,
  Link: LinkIcon,
  Activity,
  PenTool,
  Palette,
  Link2,
  Camera,
  GitFork,
  Globe,
  DollarSign,
  Plug,
};

// Derived from the catalogue rather than hardcoded: the fixed list had
// drifted and omitted three categories, so those plugins were only reachable
// under "All".
const CATEGORIES = [
  "All",
  ...Array.from(new Set(PLUGINS.map((p) => p.category))).sort(),
];

export default function Marketplace() {
  const { currentUser } = useAuthStore();
  const prefersReducedMotion = useReducedMotion();
  const { data: installed = [] } = useInstalledPlugins();
  const installPlugin = useInstallPlugin();
  const uninstallPlugin = useUninstallPlugin();
  const setPluginEnabled = useSetPluginEnabled();
  const { toast } = useToast();
  const canManageIntegrations = useCapability("manage_integrations");
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");

  // No DCC integration hooks exist behind any of these plugins yet -- an
  // artist or producer "installing" one would get a toggle that does
  // nothing real. Admin keeps the working page while this is built out.
  if (currentUser?.role !== "admin") {
    return (
      <ComingSoon
        icon={Package}
        title="Plugin Marketplace"
        description="DCC plugin integrations aren't wired up yet. Once they are, you'll be able to browse and install them here."
      />
    );
  }

  const visiblePlugins = PLUGINS.filter((p) => {
    const matchesCategory =
      activeCategory === "All" || p.category === activeCategory;
    const matchesSearch =
      search.trim() === "" ||
      p.name.toLowerCase().includes(search.trim().toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // A catalogue entry with no row on the server is uninstalled, full stop.
  const installState = new Map(installed.map((p) => [p.pluginId, p]));

  const handleInstallToggle = (e: React.MouseEvent, id: string) => {
    e.preventDefault(); // Prevent link click
    if (!canManageIntegrations) return;
    if (installState.has(id)) {
      uninstallPlugin.mutate(id, {
        onSuccess: () => toast({ description: "Plugin removed" }),
      });
    } else {
      installPlugin.mutate(id, {
        onSuccess: () =>
          toast({
            title: "Plugin installed",
            description: "Plugin is now active.",
          }),
      });
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">
          Plugin Marketplace
        </h1>
      </div>

      <div className="flex items-center justify-between py-2 border-b border-border">
        <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
          {CATEGORIES.map((cat) => (
            <Badge
              key={cat}
              variant={cat === activeCategory ? "default" : "secondary"}
              className="cursor-pointer"
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </Badge>
          ))}
        </div>
        <div className="relative w-64 hidden md:block">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search plugins..."
            className="pl-9 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 pt-4">
        {visiblePlugins.length === 0 && (
          <div className="col-span-full">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Search />
                </EmptyMedia>
                <EmptyTitle>No plugins match your filters</EmptyTitle>
                <EmptyDescription>
                  Try a different category or search term.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}
        {visiblePlugins.map((plugin, i) => {
          const Icon = ICON_MAP[plugin.icon] || Package;
          const state = installState.get(plugin.id);
          const isInstalled = !!state;
          const isEnabled = state?.enabled ?? false;

          return (
            <motion.div
              key={plugin.id}
              {...(prefersReducedMotion ? {} : stagger(i))}
            >
              <Link href={`/marketplace/${plugin.id}`}>
                <Card className="hover-elevate cursor-pointer h-full border-border hover:border-primary/50 hover:shadow-md transition-all flex flex-col group">
                  <CardContent className="p-5 flex-1 flex flex-col">
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                        <Icon className="w-6 h-6" />
                      </div>
                    </div>

                    <h3 className="font-bold text-lg mb-1 group-hover:text-primary transition-colors">
                      {plugin.name}
                    </h3>
                    <div className="text-xs text-muted-foreground mb-4">
                      {plugin.category}
                    </div>

                    <p className="text-sm text-muted-foreground mb-5 line-clamp-3">
                      {plugin.description}
                    </p>

                    <div
                      className="mt-auto pt-4 border-t border-border flex items-center justify-between"
                      onClick={(e) => e.preventDefault()}
                    >
                      {isInstalled ? (
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
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
                            <span className="text-xs font-medium text-muted-foreground">
                              {isEnabled ? "Enabled" : "Disabled"}
                            </span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!canManageIntegrations}
                            onClick={(e) => handleInstallToggle(e, plugin.id)}
                            className="text-destructive hover:bg-destructive hover:text-white border-transparent disabled:opacity-50"
                          >
                            Remove
                          </Button>
                        </div>
                      ) : canManageIntegrations ? (
                        <Button
                          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                          onClick={(e) => handleInstallToggle(e, plugin.id)}
                        >
                          Install
                        </Button>
                      ) : (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="w-full" tabIndex={0}>
                                <Button className="w-full" disabled>
                                  Install
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
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
