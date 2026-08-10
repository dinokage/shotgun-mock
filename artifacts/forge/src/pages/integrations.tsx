import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { CheckCircle2, AlertTriangle, Settings, RefreshCw, UploadCloud, Link as LinkIcon, Puzzle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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

  const handleSync = (name: string) => {
    toast({
      title: "Sync Initiated",
      description: `Synchronizing pipeline data with ${name}...`,
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
        <Button variant="outline"><RefreshCw className="w-4 h-4 mr-2" /> Sync All</Button>
        <Button><Puzzle className="w-4 h-4 mr-2" /> Install Plugin</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {INTEGRATIONS.map(integration => (
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
                    onClick={() => handleSync(integration.name)}
                  >
                    {integration.status === 'disconnected' ? 'Connect' : 'Sync Data'}
                  </Button>
                  <Button variant="outline" size="icon"><Settings className="w-4 h-4" /></Button>
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
              <Input defaultValue="Z:\Projects\Forge" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Project Root Path (macOS/Linux)</label>
              <Input defaultValue="/Volumes/Projects/Forge" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Python Interpreter</label>
              <Input defaultValue="/usr/local/bin/python3" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">ShotGrid/Forge API URL</label>
              <Input defaultValue="https://api.forge-vfx.local/v1" />
            </div>
          </div>
          <Button className="mt-4"><UploadCloud className="w-4 h-4 mr-2" /> Save Configuration</Button>
        </CardContent>
      </Card>
    </div>
  );
}
