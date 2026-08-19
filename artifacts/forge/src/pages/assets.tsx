import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';
import { useToast } from '@/hooks/use-toast';
import { PROJECTS, USERS, Asset } from '@/data/mockData';
import { Search, Grid3X3, List, Filter, Package, Eye, ArrowUpDown, X, ChevronDown } from 'lucide-react';
import { Link, useSearchParams } from 'wouter';
import { useAuthStore } from '@/store/auth';
import { useAssetStore } from '@/store/assets';
import { useCapability } from '@/hooks/use-capability';

const TYPE_COLORS: Record<string, string> = {
  Character: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  Environment: 'bg-green-500/10 text-green-500 border-green-500/20',
  Prop: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  Rig: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  Effects: 'bg-red-500/10 text-red-500 border-red-500/20',
  Vehicle: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  Texture: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  Material: 'bg-pink-500/10 text-pink-500 border-pink-500/20',
  Audio: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
};

const STATUS_COLORS: Record<string, string> = {
  complete: 'bg-green-500/10 text-green-500',
  'in-progress': 'bg-blue-500/10 text-blue-500',
  bottleneck: 'bg-red-500/10 text-red-500',
  'at-risk': 'bg-orange-500/10 text-orange-500',
  'not-started': 'bg-muted text-muted-foreground',
  review: 'bg-purple-500/10 text-purple-500',
};

const GRID_PAGE_SIZE = 40;
const LIST_PAGE_SIZE = 50;

const ASSET_TYPE_OPTIONS: Asset['type'][] = ['Character', 'Environment', 'Prop', 'Rig', 'Effects', 'Vehicle', 'Texture', 'Material', 'Audio'];

export default function Assets() {
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [newAssetOpen, setNewAssetOpen] = useState(false);
  const [newAssetName, setNewAssetName] = useState('');
  const [newAssetType, setNewAssetType] = useState<Asset['type']>('Character');
  const [newAssetProjectId, setNewAssetProjectId] = useState(PROJECTS[0]?.id ?? '');
  const { toast } = useToast();
  const { currentUser } = useAuthStore();
  const assets = useAssetStore(s => s.assets);
  const setAssets = useAssetStore(s => s.setAssets);
  // Studio Ops: creating a top-level pipeline asset is gated the same way as
  // adding/reordering pipeline stages, rather than a hardcoded role list.
  const canCreateAsset = useCapability('manage_pipeline');
  const [searchParams] = useSearchParams();
  // Artist sidebar links to /assets?mine=1 — scope the catalog down to the
  // current user's own assignments instead of showing the whole studio.
  const mineOnly = searchParams.get('mine') === '1';

  const resetCreateForm = () => {
    setNewAssetName('');
    setNewAssetType('Character');
    setNewAssetProjectId(PROJECTS[0]?.id ?? '');
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssetName.trim() || !newAssetProjectId || !currentUser) {
      toast({ title: 'Missing fields', description: 'Please fill out all required fields.', variant: 'destructive' });
      return;
    }

    // Derived from the live store, not a frozen import, so ids stay unique
    // across a session even after multiple assets are created.
    const nextNumericId = assets.reduce((max, a) => {
      const n = parseInt(a.id.replace(/\D/g, ''), 10);
      return Number.isFinite(n) ? Math.max(max, n) : max;
    }, 0);

    const newAsset: Asset = {
      id: `asset${nextNumericId + 1}`,
      name: newAssetName.trim(),
      projectId: newAssetProjectId,
      type: newAssetType,
      status: 'not-started',
      assigneeId: currentUser.id,
      updatedAt: new Date().toISOString().split('T')[0],
      version: 'v001',
      tags: [],
      thumbnailSeed: 2000 + nextNumericId + 1,
      fileSize: '0 MB',
      dependencies: [],
      publishStatus: 'draft',
      description: '',
    };

    setAssets([newAsset, ...assets]);
    setNewAssetOpen(false);
    resetCreateForm();
    toast({ title: 'Asset Created', description: `"${newAsset.name}" was added to the project.` });
  };

  const filtered = useMemo(() => {
    return assets.filter(a => {
      if (mineOnly && a.assigneeId !== currentUser?.id) return false;
      if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !a.id.toLowerCase().includes(search.toLowerCase())) return false;
      if (typeFilter !== 'all' && a.type !== typeFilter) return false;
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (projectFilter !== 'all' && a.projectId !== projectFilter) return false;
      return true;
    });
  }, [assets, search, typeFilter, statusFilter, projectFilter, mineOnly, currentUser?.id]);

  // How many results are currently visible per view — reset back to the
  // first page whenever the filter set (or the active view) changes, so
  // "Load more" always starts from a predictable, honest baseline.
  const [gridVisible, setGridVisible] = useState(GRID_PAGE_SIZE);
  const [listVisible, setListVisible] = useState(LIST_PAGE_SIZE);
  useEffect(() => {
    setGridVisible(GRID_PAGE_SIZE);
    setListVisible(LIST_PAGE_SIZE);
  }, [search, typeFilter, statusFilter, projectFilter, mineOnly, currentUser?.id]);

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{mineOnly ? 'My Assets' : 'Asset Browser'}</h1>
          <p className="text-muted-foreground mt-1">
            {filtered.length} assets across {PROJECTS.length} projects
            {mineOnly && ' · assigned to you'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {mineOnly && (
            <Link href="/assets">
              <Button variant="outline" size="sm" className="gap-2">
                <X className="w-3.5 h-3.5" /> Clear "My Assets" filter
              </Button>
            </Link>
          )}
          {canCreateAsset && (
            <Dialog open={newAssetOpen} onOpenChange={setNewAssetOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2"><Package className="w-4 h-4" /> New Asset</Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleCreate}>
                  <DialogHeader>
                    <DialogTitle>Create New Asset</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Asset Name</Label>
                      <Input required placeholder="e.g. Hero Character" value={newAssetName} onChange={e => setNewAssetName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Asset Type</Label>
                      <Select required value={newAssetType} onValueChange={(v) => setNewAssetType(v as Asset['type'])}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ASSET_TYPE_OPTIONS.map(t => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Project</Label>
                      <Select required value={newAssetProjectId} onValueChange={setNewAssetProjectId}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PROJECTS.map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit">Create Asset</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 py-3 border-b border-border">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search assets..." className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {['Character', 'Environment', 'Prop', 'Rig', 'Effects', 'Vehicle', 'Texture', 'Material', 'Audio'].map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {['complete', 'in-progress', 'bottleneck', 'at-risk', 'review', 'not-started'].map(s => (
              <SelectItem key={s} value={s}>{s.replace('-', ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Project" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {PROJECTS.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-1">
          <Button variant={view === 'grid' ? 'secondary' : 'ghost'} size="icon" className="h-9 w-9" onClick={() => setView('grid')}>
            <Grid3X3 className="w-4 h-4" />
          </Button>
          <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="icon" className="h-9 w-9" onClick={() => setView('list')}>
            <List className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Grid View */}
      {view === 'grid' && (
        <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.slice(0, gridVisible).map(asset => {
            const project = PROJECTS.find(p => p.id === asset.projectId);
            return (
              <Link key={asset.id} href={`/assets/${asset.id}`}>
                <Card className="overflow-hidden hover:shadow-lg transition-all cursor-pointer group border-border hover:border-primary/40">
                  <div className="aspect-video bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center relative">
                    <Package className="w-8 h-8 text-muted-foreground/30" />
                    <div className="absolute top-2 right-2">
                      <Badge className={`${STATUS_COLORS[asset.status]} text-[9px] border-0`}>
                        {asset.status.replace('-', ' ')}
                      </Badge>
                    </div>
                    <div className="absolute bottom-2 left-2">
                      <Badge className={`${TYPE_COLORS[asset.type] || ''} text-[9px] border`}>
                        {asset.type}
                      </Badge>
                    </div>
                  </div>
                  <CardContent className="p-3">
                    <div className="font-medium text-sm truncate group-hover:text-primary transition-colors">{asset.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{project?.name} · {asset.version}</div>
                    <div className="flex items-center gap-2 mt-2">
                      {asset.tags.slice(0, 2).map(tag => (
                        <Badge key={tag} variant="outline" className="text-[9px] h-4 px-1">{tag}</Badge>
                      ))}
                      <span className="text-[10px] text-muted-foreground ml-auto">{asset.fileSize}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
        <AssetsLoadMore
          shown={Math.min(gridVisible, filtered.length)}
          total={filtered.length}
          onLoadMore={() => setGridVisible(v => v + GRID_PAGE_SIZE)}
        />
        </div>
      )}

      {/* List View */}
      {view === 'list' && (
        <div className="space-y-4">
        <div className="rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-muted-foreground">
                <th className="h-10 px-4 text-left font-medium">Asset</th>
                <th className="h-10 px-4 text-left font-medium">Type</th>
                <th className="h-10 px-4 text-left font-medium">Status</th>
                <th className="h-10 px-4 text-left font-medium">Project</th>
                <th className="h-10 px-4 text-left font-medium">Assignee</th>
                <th className="h-10 px-4 text-left font-medium">Version</th>
                <th className="h-10 px-4 text-left font-medium">Size</th>
                <th className="h-10 px-4 text-left font-medium">Publish</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, listVisible).map(asset => {
                const project = PROJECTS.find(p => p.id === asset.projectId);
                const assignee = USERS.find(u => u.id === asset.assigneeId);
                return (
                  <tr key={asset.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="p-4">
                      <Link href={`/assets/${asset.id}`} className="font-medium hover:text-primary transition-colors">{asset.name}</Link>
                    </td>
                    <td className="p-4"><Badge className={`${TYPE_COLORS[asset.type] || ''} text-[10px] border`}>{asset.type}</Badge></td>
                    <td className="p-4"><Badge className={`${STATUS_COLORS[asset.status]} text-[10px]`}>{asset.status.replace('-', ' ')}</Badge></td>
                    <td className="p-4 text-muted-foreground">{project?.name}</td>
                    <td className="p-4 text-muted-foreground">{assignee?.name}</td>
                    <td className="p-4 font-mono text-muted-foreground">{asset.version}</td>
                    <td className="p-4 text-muted-foreground">{asset.fileSize}</td>
                    <td className="p-4">
                      <Badge variant="outline" className="text-[10px]">{asset.publishStatus}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <AssetsLoadMore
          shown={Math.min(listVisible, filtered.length)}
          total={filtered.length}
          onLoadMore={() => setListVisible(v => v + LIST_PAGE_SIZE)}
        />
        </div>
      )}

      {filtered.length === 0 && (
        <Empty className="border-2 border-dashed border-border rounded-lg py-20">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Package />
            </EmptyMedia>
            <EmptyTitle>No assets found</EmptyTitle>
            <EmptyDescription>No assets match your current search and filters.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => { setSearch(''); setTypeFilter('all'); setStatusFilter('all'); setProjectFilter('all'); }}>
              Clear Filters
            </Button>
          </EmptyContent>
        </Empty>
      )}
    </div>
  );
}

/** Honest "Showing X of Y" copy plus a Load More action, shared by the grid and list views. */
function AssetsLoadMore({ shown, total, onLoadMore }: { shown: number; total: number; onLoadMore: () => void }) {
  if (total === 0) return null;
  const hasMore = shown < total;
  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <p className="text-xs text-muted-foreground">
        Showing {shown} of {total} assets
      </p>
      {hasMore && (
        <Button variant="outline" size="sm" className="gap-2" onClick={onLoadMore}>
          <ChevronDown className="w-3.5 h-3.5" /> Load More
        </Button>
      )}
    </div>
  );
}
