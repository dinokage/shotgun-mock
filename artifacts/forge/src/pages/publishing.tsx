import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { ASSETS, USERS, PROJECTS, PublishLog } from '@/data/mockData';
import { Upload, CheckCircle2, XCircle, Clock, Loader2, Package, ChevronRight, ArrowRight, Filter, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { usePublishingStore } from '@/store/publishing';
import { useAuthStore } from '@/store/auth';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';

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

  const publishLogs = usePublishingStore(s => s.logs);
  const addPublishLog = usePublishingStore(s => s.addPublishLog);
  const currentUser = useAuthStore(s => s.currentUser);

  const queue = publishLogs.filter(p => p.status === 'queued' || p.status === 'validating');
  const recent = publishLogs.filter(p => p.status === 'success' || p.status === 'failed');
  const successRate = publishLogs.length > 0
    ? Math.round((publishLogs.filter(p => p.status === 'success').length / publishLogs.length) * 100)
    : 0;
  const oneDayMs = 24 * 60 * 60 * 1000;
  const publishedLast24h = publishLogs.filter(
    p => p.status === 'success' && Date.now() - new Date(p.publishedAt).getTime() <= oneDayMs
  ).length;

  const [assetIdInput, setAssetIdInput] = useState('S01_030_anim');
  const [versionNoteInput, setVersionNoteInput] = useState('Addressed supervisor notes on jump timing.');
  const [isValidating, setIsValidating] = useState(false);
  const [validationResults, setValidationResults] = useState<{name: string, status: 'pending'|'passed'|'failed'|'running', detail: string}[]>([]);

  const startValidation = (e: React.FormEvent) => {
    e.preventDefault();
    setIsValidating(true);

    const trimmedId = assetIdInput.trim();
    const trimmedNote = versionNoteInput.trim();

    // Real checks against the actual form input, not hardcoded pass results.
    const namingValid = /^[A-Za-z0-9]+_[A-Za-z0-9_]+$/.test(trimmedId);
    const noteValid = trimmedNote.length >= 10;
    const hasConflict = publishLogs.some(p => p.assetId === trimmedId && (p.status === 'queued' || p.status === 'validating'));

    const checks = [
      {
        name: 'Naming Convention',
        status: 'running' as const,
        detail: namingValid
          ? `"${trimmedId}" matches the required prefix_name pattern.`
          : `"${trimmedId}" does not match the required prefix_name pattern (letters/numbers, underscore-separated, no spaces).`,
      },
      {
        name: 'Version Note',
        status: 'pending' as const,
        detail: noteValid
          ? `Note has ${trimmedNote.length} characters of detail.`
          : `Note is too short (${trimmedNote.length} chars) — describe what changed in at least 10 characters.`,
      },
      {
        name: 'No Conflicting In-Flight Publish',
        status: 'pending' as const,
        detail: hasConflict
          ? `Another publish for "${trimmedId}" is already queued or validating.`
          : `No conflicting publish currently in the queue for "${trimmedId}".`,
      },
    ];
    setValidationResults(checks);

    const outcomes = [namingValid, noteValid, !hasConflict];

    // Steps still run in sequence so the UI reads as a pipeline, but the
    // pass/fail outcome for each step is decided above from real input.
    setTimeout(() => {
      setValidationResults(prev => [
        { ...prev[0], status: outcomes[0] ? 'passed' : 'failed' },
        { ...prev[1], status: 'running' },
        prev[2]
      ]);
    }, 800);

    setTimeout(() => {
      setValidationResults(prev => [
        prev[0],
        { ...prev[1], status: outcomes[1] ? 'passed' : 'failed' },
        { ...prev[2], status: 'running' }
      ]);
    }, 1600);

    setTimeout(() => {
      setValidationResults(prev => [
        prev[0],
        prev[1],
        { ...prev[2], status: outcomes[2] ? 'passed' : 'failed' }
      ]);
    }, 2400);
  };

  const handlePublish = () => {
    const trimmedId = assetIdInput.trim();
    const priorForAsset = publishLogs.filter(p => p.assetId === trimmedId);
    const version = `v${String(priorForAsset.length + 1).padStart(3, '0')}`;
    const now = new Date();

    const newLog: PublishLog = {
      id: `pub-${now.getTime()}`,
      assetId: trimmedId,
      version,
      publishedById: currentUser?.id ?? 'unknown',
      publishedAt: now.toISOString(),
      status: 'success',
      target: 'production',
      duration: '—',
      fileSize: '—',
      checks: validationResults.map(r => ({ name: r.name, passed: r.status === 'passed' })),
      log: [
        `[${now.toISOString()}] Publish requested by ${currentUser?.name ?? 'Unknown user'}.`,
        `[${now.toISOString()}] Version note: ${versionNoteInput.trim()}`,
        `[${now.toISOString()}] All pre-publish validators passed.`,
      ],
    };
    addPublishLog(newLog);

    setPublishDialogOpen(false);
    toast({ title: 'Publish Successful', description: `${trimmedId} ${version} was published to the pipeline.` });
    // reset state
    setTimeout(() => {
      setIsValidating(false);
      setValidationResults([]);
    }, 500);
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Publishing Center</h1>
          <p className="text-muted-foreground mt-1">Manage asset publishing pipeline</p>
        </div>
        
        <Dialog
          open={publishDialogOpen}
          onOpenChange={(open) => {
            setPublishDialogOpen(open);
            // Closing via the X button, Escape, or an overlay click (as
            // opposed to the programmatic close in handlePublish) leaves
            // isValidating/validationResults set. Without resetting here,
            // reopening the dialog drops the user back into a finished or
            // failed validation run with no way back to the form — a
            // dead end, especially when a check failed and Confirm Publish
            // is permanently disabled.
            if (!open) {
              setIsValidating(false);
              setValidationResults([]);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"><Upload className="w-4 h-4" /> Publish New (Ayon Validator)</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            {!isValidating ? (
              <form onSubmit={startValidation}>
                <DialogHeader>
                  <DialogTitle>Publish Asset</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Asset ID / Shot Name</Label>
                    <Input
                      required
                      placeholder="e.g. S01_030_anim"
                      value={assetIdInput}
                      onChange={(e) => setAssetIdInput(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Version Note</Label>
                    <Input
                      required
                      placeholder="What changed?"
                      value={versionNoteInput}
                      onChange={(e) => setVersionNoteInput(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" className="w-full">Run Pre-Publish Validators</Button>
                </DialogFooter>
              </form>
            ) : (
              <div className="space-y-6 py-4">
                <DialogHeader>
                  <DialogTitle>Pipeline Validation</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  {validationResults.map((result, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg border border-border/50">
                      <div className="mt-0.5">
                        {result.status === 'pending' && <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />}
                        {result.status === 'running' && <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />}
                        {result.status === 'passed' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                        {result.status === 'failed' && <XCircle className="w-5 h-5 text-red-500" />}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{result.name}</div>
                        <div className="text-xs text-muted-foreground">{result.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button 
                    className="w-full bg-green-600 hover:bg-green-700 text-white" 
                    disabled={!validationResults.every(r => r.status === 'passed')}
                    onClick={handlePublish}
                  >
                    Confirm Publish
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { title: 'In Queue', value: queue.length, ...STATUS_CONFIG.queued },
          { title: 'Validating', value: publishLogs.filter(p => p.status === 'validating').length, ...STATUS_CONFIG.validating },
          { title: 'Published (24h)', value: publishedLast24h, ...STATUS_CONFIG.success },
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
          <TabsTrigger value="all">All Publishes ({publishLogs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-4 space-y-3">
          {queue.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Clock />
                </EmptyMedia>
                <EmptyTitle>No items in queue</EmptyTitle>
                <EmptyDescription>Publishes will appear here while they're queued or validating.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
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
          {recent.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CheckCircle2 />
                </EmptyMedia>
                <EmptyTitle>No recent publishes</EmptyTitle>
                <EmptyDescription>Completed and failed publishes will show up here.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {recent.map(pub => {
            const asset = ASSETS.find(a => a.id === pub.assetId);
            const publisher = USERS.find(u => u.id === pub.publishedById);
            const config = STATUS_CONFIG[pub.status];
            const isExpanded = expandedLog === pub.id;

            return (
              <Card key={pub.id} className="hover:bg-muted/20 transition-colors">
                <CardContent className="p-4">
                  <div
                    className="flex items-center gap-4 cursor-pointer"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedLog(isExpanded ? null : pub.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setExpandedLog(isExpanded ? null : pub.id);
                      }
                    }}
                  >
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
          {publishLogs.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Package />
                </EmptyMedia>
                <EmptyTitle>No publishes yet</EmptyTitle>
                <EmptyDescription>Every publish action will show up in this log.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
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
                {publishLogs.map(pub => {
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
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
