import React, { useState } from 'react';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { CheckCircle2, AlertTriangle, Settings, RefreshCw, UploadCloud, Link as LinkIcon, Puzzle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIntegrationsStore } from '@/store/integrations';

const INTEGRATIONS = [
  { id: 'maya', name: 'Autodesk Maya', category: '3D/Animation', status: 'connected', version: 'v2.4.1', lastSync: '2 mins ago', icon: 'M' },
  { id: 'blender', name: 'Blender', category: '3D/Animation', status: 'connected', version: 'v1.8.0', lastSync: '1 hr ago', icon: 'B' },
  { id: 'nuke', name: 'Foundry Nuke', category: 'Compositing', status: 'warning', version: 'v3.0.2', lastSync: '2 days ago', icon: 'N' },
  { id: 'houdini', name: 'SideFX Houdini', category: 'FX/Simulation', status: 'disconnected', version: 'Not Installed', lastSync: 'Never', icon: 'H' },
  { id: 'premiere', name: 'Adobe Premiere Pro', category: 'Editing', status: 'connected', version: 'v1.2.5', lastSync: '10 mins ago', icon: 'Pr' },
  { id: 'photoshop', name: 'Adobe Photoshop', category: '2D/Matte Painting', status: 'connected', version: 'v1.5.0', lastSync: '5 mins ago', icon: 'Ps' },
];

export default function IntegrationsHub() {
  const { toast } = useToast();
  const runtime = useIntegrationsStore((s) => s.runtime);
  const autoSync = useIntegrationsStore((s) => s.autoSync);
  const syncIntegration = useIntegrationsStore((s) => s.syncIntegration);
  const toggleAutoSync = useIntegrationsStore((s) => s.toggleAutoSync);
  const pathConfig = useIntegrationsStore((s) => s.pathConfig);
  const savePathConfig = useIntegrationsStore((s) => s.savePathConfig);

  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [formConfig, setFormConfig] = useState(pathConfig);

  // Merge static seed data with any persisted runtime overrides (status/lastSync).
  const integrations = INTEGRATIONS.map((integration) => ({
    ...integration,
    ...runtime[integration.id],
  }));
  const settingsIntegration = integrations.find((i) => i.id === settingsId) ?? null;

  const handleSync = (id: string, name: string) => {
    const wasDisconnected = INTEGRATIONS.find((i) => i.id === id)?.status === 'disconnected' && !runtime[id];
    syncIntegration(id);
    toast({
      title: wasDisconnected ? 'Connected' : 'Sync Initiated',
      description: wasDisconnected
        ? `${name} is now connected and synchronized.`
        : `Synchronizing pipeline data with ${name}...`,
    });
  };

  const handleSyncAll = () => {
    integrations.forEach((integration) => syncIntegration(integration.id));
    toast({
      title: 'Sync All Initiated',
      description: `Synchronizing pipeline data with all ${integrations.length} integrations...`,
    });
  };

  const handleSaveConfig = () => {
    savePathConfig(formConfig);
    toast({
      title: 'Configuration Saved',
      description: 'Path mapping and environment variables have been updated.',
    });
  };

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">DCC Integrations</h1>
        <p className="text-muted-foreground">Manage pipeline connections to Digital Content Creation tools.</p>
      </div>

      <div className="flex items-center gap-4">
        <Input placeholder="Search integrations..." className="max-w-md" />
        <Button variant="outline" onClick={handleSyncAll}><RefreshCw className="w-4 h-4 mr-2" /> Sync All</Button>
        <Button asChild>
          <Link href="/marketplace"><Puzzle className="w-4 h-4 mr-2" /> Install Plugin</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {integrations.map(integration => (
          <Card key={integration.id} className="relative overflow-hidden group">
            {integration.status === 'connected' && (
              <div className="absolute top-0 right-0 w-16 h-16 bg-green-500/10 rounded-bl-full -z-10 transition-transform group-hover:scale-110" />
            )}
            <CardHeader className="pb-4">
              <div className="flex justify-between items-start">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center font-bold text-xl text-primary mb-3">
                  {integration.icon}
                </div>
                <Badge variant="outline" className={
                  integration.status === 'connected' ? 'bg-green-500/10 text-green-500 border-green-500/20' :
                  integration.status === 'warning' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                  'bg-muted text-muted-foreground'
                }>
                  {integration.status === 'connected' ? (
                    <><CheckCircle2 className="w-3 h-3 mr-1" /> Connected</>
                  ) : integration.status === 'warning' ? (
                    <><AlertTriangle className="w-3 h-3 mr-1" /> Update Reqd</>
                  ) : (
                    <><LinkIcon className="w-3 h-3 mr-1" /> Disconnected</>
                  )}
                </Badge>
              </div>
              <CardTitle>{integration.name}</CardTitle>
              <CardDescription>{integration.category}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Plugin Version</span>
                  <span className="font-mono">{integration.version}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Last Sync</span>
                  <span>{integration.lastSync}</span>
                </div>
                <div className="pt-4 flex gap-2">
                  <Button
                    variant={integration.status === 'disconnected' ? 'default' : 'outline'}
                    className="flex-1"
                    onClick={() => handleSync(integration.id, integration.name)}
                  >
                    {integration.status === 'disconnected' ? 'Connect' : 'Sync Data'}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setSettingsId(integration.id);
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
          <CardTitle className="text-lg">Global Pipeline Configuration</CardTitle>
          <CardDescription>Path mapping and environment variables for DCC tools.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Project Root Path (Windows)</label>
              <Input
                value={formConfig.winPath}
                onChange={(e) => setFormConfig((c) => ({ ...c, winPath: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Project Root Path (macOS/Linux)</label>
              <Input
                value={formConfig.macPath}
                onChange={(e) => setFormConfig((c) => ({ ...c, macPath: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Python Interpreter</label>
              <Input
                value={formConfig.pythonInterpreter}
                onChange={(e) => setFormConfig((c) => ({ ...c, pythonInterpreter: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">ShotGrid/Forge API URL</label>
              <Input
                value={formConfig.apiUrl}
                onChange={(e) => setFormConfig((c) => ({ ...c, apiUrl: e.target.value }))}
              />
            </div>
          </div>
          <Button className="mt-4" onClick={handleSaveConfig}>
            <UploadCloud className="w-4 h-4 mr-2" /> Save Configuration
          </Button>
        </CardContent>
      </Card>

      <Dialog open={settingsIntegration !== null} onOpenChange={(open) => !open && setSettingsId(null)}>
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
                <DialogDescription>{settingsIntegration.category} integration settings</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="outline" className={
                    settingsIntegration.status === 'connected' ? 'bg-green-500/10 text-green-500 border-green-500/20' :
                    settingsIntegration.status === 'warning' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                    'bg-muted text-muted-foreground'
                  }>
                    {settingsIntegration.status === 'connected' ? 'Connected' : settingsIntegration.status === 'warning' ? 'Update Reqd' : 'Disconnected'}
                  </Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Plugin Version</span>
                  <span className="font-mono">{settingsIntegration.version}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Last Sync</span>
                  <span>{settingsIntegration.lastSync}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
                  <div>
                    <div className="text-sm font-medium">Auto-sync</div>
                    <div className="text-xs text-muted-foreground">Automatically pull pipeline data on a schedule</div>
                  </div>
                  <Switch
                    checked={autoSync[settingsIntegration.id] ?? false}
                    onCheckedChange={(checked) => toggleAutoSync(settingsIntegration.id, checked)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    handleSync(settingsIntegration.id, settingsIntegration.name);
                    setSettingsId(null);
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
