import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ASSETS, PROJECTS, USERS } from '@/data/mockData';
import { Search, Grid3X3, List, Filter, Package, Eye, ArrowUpDown } from 'lucide-react';
import { Link } from 'wouter';

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
  blocked: 'bg-red-500/10 text-red-500',
  'at-risk': 'bg-orange-500/10 text-orange-500',
  'not-started': 'bg-muted text-muted-foreground',
  review: 'bg-purple-500/10 text-purple-500',
};

export default function Assets() {
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [newAssetOpen, setNewAssetOpen] = useState(false);
  const { toast } = useToast();

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setNewAssetOpen(false);
    toast({ title: 'Asset Created', description: 'New asset added to the project successfully.' });
  };

  const filtered = useMemo(() => {
    return ASSETS.filter(a => {
      if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !a.id.toLowerCase().includes(search.toLowerCase())) return false;
      if (typeFilter !== 'all' && a.type !== typeFilter) return false;
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (projectFilter !== 'all' && a.projectId !== projectFilter) return false;
      return true;
    });
  }, [search, typeFilter, statusFilter, projectFilter]);

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Asset Browser</h1>
          <p className="text-muted-foreground mt-1">{filtered.length} assets across {PROJECTS.length} projects</p>
        </div>
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
                  <Input required placeholder="e.g. Hero Character" />
                </div>
                <div className="space-y-2">
                  <Label>Asset Type</Label>
                  <Select required defaultValue="Character">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['Character', 'Environment', 'Prop', 'Rig', 'Effects'].map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
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
            {['complete', 'in-progress', 'blocked', 'at-risk', 'review', 'not-started'].map(s => (
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.slice(0, 40).map(asset => {
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
      )}

      {/* List View */}
      {view === 'list' && (
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
              {filtered.slice(0, 50).map(asset => {
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
      )}

      {filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No assets match your filters</p>
        </div>
      )}
    </div>
  );
}
