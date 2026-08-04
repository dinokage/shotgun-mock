import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { PUBLISH_LOGS, ASSETS, USERS, PROJECTS } from '@/data/mockData';
import { Upload, CheckCircle2, XCircle, Clock, Loader2, Package, ChevronRight, ArrowRight, Filter, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

const STATUS_CONFIG = {
  success: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10', label: 'Published' },
  failed: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Failed' },
  validating: { icon: Loader2, color: 'text-yellow-500', bg: 'bg-yellow-500/10', label: 'Validating' },
  queued: { icon: Clock, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Queued' },
};

export default function Publishing() {
  const [tab, setTab] = useState('queue');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const { toast } = useToast();

  const queue = PUBLISH_LOGS.filter(p => p.status === 'queued' || p.status === 'validating');
  const recent = PUBLISH_LOGS.filter(p => p.status === 'success' || p.status === 'failed');
  const successRate = Math.round((PUBLISH_LOGS.filter(p => p.status === 'success').length / PUBLISH_LOGS.length) * 100);

  const handlePublish = (e: React.FormEvent) => {
    e.preventDefault();
    setPublishDialogOpen(false);
    toast({ title: 'Publish Queued', description: 'Your asset has been queued for validation.' });
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Publishing Center</h1>
          <p className="text-muted-foreground mt-1">Manage asset publishing pipeline</p>
        </div>
        
        <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Upload className="w-4 h-4" /> Publish New</Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handlePublish}>
              <DialogHeader>
                <DialogTitle>Publish Asset</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Asset ID</Label>
                  <Input required placeholder="e.g. ast_001" />
                </div>
                <div className="space-y-2">
                  <Label>Version Note</Label>
                  <Input required placeholder="What changed?" />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">Submit to Queue</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { title: 'In Queue', value: queue.length, ...STATUS_CONFIG.queued },
          { title: 'Validating', value: PUBLISH_LOGS.filter(p => p.status === 'validating').length, ...STATUS_CONFIG.validating },
          { title: 'Published (24h)', value: recent.filter(p => p.status === 'success').length, ...STATUS_CONFIG.success },
          { title: 'Success Rate', value: `${successRate}%`, icon: CheckCircle2, color: successRate > 90 ? 'text-green-500' : 'text-yellow-500', bg: successRate > 90 ? 'bg-green-500/10' : 'bg-yellow-500/10', label: 'Overall' },
        ].map((stat, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center mb-2`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.title}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="queue">Queue ({queue.length})</TabsTrigger>
          <TabsTrigger value="recent">Recent ({recent.length})</TabsTrigger>
          <TabsTrigger value="all">All Publishes ({PUBLISH_LOGS.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-4 space-y-3">
          {queue.length === 0 && <p className="text-center text-muted-foreground py-12">No items in queue.</p>}
          {queue.map(pub => {
            const asset = ASSETS.find(a => a.id === pub.assetId);
            const publisher = USERS.find(u => u.id === pub.publishedById);
            const config = STATUS_CONFIG[pub.status];
            return (
              <Card key={pub.id} className="hover:bg-muted/20 transition-colors">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg ${config.bg} flex items-center justify-center`}>
                    <config.icon className={`w-5 h-5 ${config.color} ${pub.status === 'validating' ? 'animate-spin' : ''}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{asset?.name || pub.assetId}</span>
                      <Badge variant="outline" className="text-[10px]">{pub.version}</Badge>
                      <Badge className={`${config.bg} ${config.color} text-[10px]`}>{config.label}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Target: {pub.target} · By {publisher?.name} · {pub.duration}
                    </div>
                  </div>
                  {pub.status === 'validating' && <Progress value={60} className="w-24 h-1.5" />}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="recent" className="mt-4 space-y-3">
          {recent.map(pub => {
            const asset = ASSETS.find(a => a.id === pub.assetId);
            const publisher = USERS.find(u => u.id === pub.publishedById);
            const config = STATUS_CONFIG[pub.status];
            const isExpanded = expandedLog === pub.id;

            return (
              <Card key={pub.id} className="hover:bg-muted/20 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4 cursor-pointer" onClick={() => setExpandedLog(isExpanded ? null : pub.id)}>
                    <div className={`w-10 h-10 rounded-lg ${config.bg} flex items-center justify-center shrink-0`}>
                      <config.icon className={`w-5 h-5 ${config.color}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{asset?.name || pub.assetId}</span>
                        <Badge variant="outline" className="text-[10px]">{pub.version}</Badge>
                        <Badge className={`${config.bg} ${config.color} text-[10px]`}>{config.label}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Target: {pub.target} · By {publisher?.name} · Duration: {pub.duration} · Size: {pub.fileSize}
                      </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  </div>

                  {isExpanded && (
                    <div className="mt-4 ml-14 space-y-4 animate-in slide-in-from-top-2">
                      {/* Validation Checks */}
                      <div>
                        <div className="text-xs font-semibold text-muted-foreground mb-2">VALIDATION CHECKS</div>
                        <div className="space-y-1.5">
                          {pub.checks.map((check, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm">
                              {check.passed ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-red-500" />}
                              <span className={check.passed ? '' : 'text-red-500'}>{check.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Log */}
                      <div>
                        <div className="text-xs font-semibold text-muted-foreground mb-2">LOG</div>
                        <div className="bg-muted/50 rounded-md p-3 font-mono text-xs space-y-1">
                          {pub.log.map((line, i) => (
                            <div key={i} className={line.includes('ERROR') ? 'text-red-500' : 'text-muted-foreground'}>{line}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <div className="rounded-md border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-muted-foreground">
                  <th className="h-10 px-4 text-left font-medium">Asset</th>
                  <th className="h-10 px-4 text-left font-medium">Version</th>
                  <th className="h-10 px-4 text-left font-medium">Status</th>
                  <th className="h-10 px-4 text-left font-medium">Target</th>
                  <th className="h-10 px-4 text-left font-medium">Publisher</th>
                  <th className="h-10 px-4 text-left font-medium">Duration</th>
                  <th className="h-10 px-4 text-left font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {PUBLISH_LOGS.map(pub => {
                  const asset = ASSETS.find(a => a.id === pub.assetId);
                  const publisher = USERS.find(u => u.id === pub.publishedById);
                  const config = STATUS_CONFIG[pub.status];
                  return (
                    <tr key={pub.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="p-4 font-medium">{asset?.name || pub.assetId}</td>
                      <td className="p-4 font-mono text-muted-foreground">{pub.version}</td>
                      <td className="p-4"><Badge className={`${config.bg} ${config.color} text-[10px]`}>{config.label}</Badge></td>
                      <td className="p-4 text-muted-foreground">{pub.target}</td>
                      <td className="p-4 text-muted-foreground">{publisher?.name}</td>
                      <td className="p-4 text-muted-foreground">{pub.duration}</td>
                      <td className="p-4 text-muted-foreground">{new Date(pub.publishedAt).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
