import { PLUGINS } from '@/data/mockData';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { usePluginsStore } from '@/store/plugins';
import { Search, Star, ShieldCheck, Download, Package, Zap, Link as LinkIcon, Activity, PenTool, Palette, Link2, Camera } from 'lucide-react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';

const ICON_MAP: Record<string, any> = {
  Package, Zap, Link: LinkIcon, Activity, PenTool, Palette, Link2, Camera
};

export default function Marketplace() {
  const { installedPlugins, installPlugin, uninstallPlugin, enabledPlugins, togglePlugin } = usePluginsStore();
  const { toast } = useToast();

  const handleInstallToggle = (e: React.MouseEvent, id: string) => {
    e.preventDefault(); // Prevent link click
    if (installedPlugins[id]) {
      uninstallPlugin(id);
      toast({ description: 'Plugin removed' });
    } else {
      installPlugin(id);
      toast({ title: 'Plugin installed', description: 'Plugin is now active.' });
    }
  };

  const handleEnableToggle = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    togglePlugin(id);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Plugin Marketplace</h1>
      </div>

      <div className="flex items-center justify-between py-2 border-b border-border">
        <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
          {['All', 'Pipeline', 'Render', 'Integration', 'Monitoring', 'Annotation'].map(cat => (
            <Badge key={cat} variant={cat === 'All' ? 'default' : 'secondary'} className="cursor-pointer">
              {cat}
            </Badge>
          ))}
        </div>
        <div className="relative w-64 hidden md:block">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search plugins..." className="pl-9 h-9" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 pt-4">
        {PLUGINS.map(plugin => {
          const Icon = ICON_MAP[plugin.icon] || Package;
          const isInstalled = installedPlugins[plugin.id];
          const isEnabled = enabledPlugins[plugin.id];
          
          return (
            <Link key={plugin.id} href={`/marketplace/${plugin.id}`}>
              <Card className="hover-elevate cursor-pointer h-full border-border hover:border-primary/50 transition-colors flex flex-col group">
                <CardContent className="p-5 flex-1 flex flex-col">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                      <Icon className="w-6 h-6" />
                    </div>
                    {plugin.verified && (
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30 gap-1 px-1.5 py-0">
                        <ShieldCheck className="w-3 h-3" /> Verified
                      </Badge>
                    )}
                  </div>
                  
                  <h3 className="font-bold text-lg mb-1 group-hover:text-primary transition-colors">{plugin.name}</h3>
                  <div className="text-xs text-muted-foreground mb-4">{plugin.category}</div>
                  
                  <div className="flex items-center gap-4 text-sm mt-auto mb-5">
                    <div className="flex items-center gap-1 font-medium">
                      <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" /> {plugin.rating}
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Download className="w-4 h-4" /> {plugin.installs}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-border flex items-center justify-between" onClick={e => e.preventDefault()}>
                    {isInstalled ? (
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <Switch checked={isEnabled} onCheckedChange={() => togglePlugin(plugin.id)} />
                          <span className="text-xs font-medium text-muted-foreground">{isEnabled ? 'Enabled' : 'Disabled'}</span>
                        </div>
                        <Button variant="outline" size="sm" onClick={(e) => handleInstallToggle(e, plugin.id)} className="text-destructive hover:bg-destructive hover:text-white border-transparent">
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90" onClick={(e) => handleInstallToggle(e, plugin.id)}>
                        Install
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
