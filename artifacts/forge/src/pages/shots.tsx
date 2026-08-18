import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SHOTS, PROJECTS, USERS, SEQUENCES } from '@/data/mockData';
import { Search, Film, Grid3X3, List, X, ChevronDown } from 'lucide-react';
import { Link, useSearchParams } from 'wouter';
import { useAuthStore } from '@/store/auth';

const STATUS_COLORS: Record<string, string> = {
  complete: 'bg-green-500/10 text-green-500',
  'in-progress': 'bg-blue-500/10 text-blue-500',
  bottleneck: 'bg-red-500/10 text-red-500',
  review: 'bg-purple-500/10 text-purple-500',
  'not-started': 'bg-muted text-muted-foreground',
  'at-risk': 'bg-orange-500/10 text-orange-500',
};

const SEQUENCE_PAGE_SIZE = 8;
const SHOTS_PER_GROUP_PAGE_SIZE = 12;
const LIST_PAGE_SIZE = 50;

export default function Shots() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const { currentUser } = useAuthStore();
  const [searchParams] = useSearchParams();
  // Artist sidebar links to /shots?mine=1 — scope the catalog down to the
  // current user's own assignments instead of showing the whole studio.
  const mineOnly = searchParams.get('mine') === '1';

  const filtered = useMemo(() => {
    return SHOTS.filter(s => {
      if (mineOnly && s.assigneeId !== currentUser?.id) return false;
      if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (projectFilter !== 'all' && s.projectId !== projectFilter) return false;
      return true;
    });
  }, [search, statusFilter, projectFilter, mineOnly, currentUser?.id]);

  const grouped = useMemo(() => {
    const groups: Record<string, typeof SHOTS> = {};
    filtered.forEach(s => {
      const key = s.sequence || 'Other';
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });
    return groups;
  }, [filtered]);

  const sequenceKeys = Object.keys(grouped);

  // How many results are currently visible per view/section — reset back to
  // the first page whenever the filter set changes, so "Load more" always
  // starts from a predictable, honest baseline.
  const [visibleSequences, setVisibleSequences] = useState(SEQUENCE_PAGE_SIZE);
  const [groupVisible, setGroupVisible] = useState<Record<string, number>>({});
  const [listVisible, setListVisible] = useState(LIST_PAGE_SIZE);
  useEffect(() => {
    setVisibleSequences(SEQUENCE_PAGE_SIZE);
    setGroupVisible({});
    setListVisible(LIST_PAGE_SIZE);
  }, [search, statusFilter, projectFilter, mineOnly, currentUser?.id]);

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{mineOnly ? 'My Shots' : 'Shot Management'}</h1>
          <p className="text-muted-foreground mt-1">
            {filtered.length} shots across {Object.keys(grouped).length} sequences
            {mineOnly && ' · assigned to you'}
          </p>
        </div>
        {mineOnly && (
          <Link href="/shots">
            <Button variant="outline" size="sm" className="gap-2">
              <X className="w-3.5 h-3.5" /> Clear "My Shots" filter
            </Button>
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 py-3 border-b border-border">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search shots..." className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {['complete', 'in-progress', 'bottleneck', 'review', 'at-risk', 'not-started'].map(s => (
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
          <Button variant={view === 'grid' ? 'secondary' : 'ghost'} size="icon" className="h-9 w-9" onClick={() => setView('grid')}><Grid3X3 className="w-4 h-4" /></Button>
          <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="icon" className="h-9 w-9" onClick={() => setView('list')}><List className="w-4 h-4" /></Button>
        </div>
      </div>

      {view === 'grid' && (
        <div className="space-y-6">
          {Object.entries(grouped).slice(0, visibleSequences).map(([seq, shots]) => {
            const shownInGroup = Math.min(groupVisible[seq] ?? SHOTS_PER_GROUP_PAGE_SIZE, shots.length);
            return (
              <div key={seq}>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  {seq} · {shots.length} shots
                  {shownInGroup < shots.length && (
                    <span className="normal-case font-normal tracking-normal text-muted-foreground/70"> (showing {shownInGroup})</span>
                  )}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-3">
                  {shots.slice(0, shownInGroup).map(shot => {
                    const assignee = USERS.find(u => u.id === shot.assigneeId);
                    return (
                      <Link key={shot.id} href={`/shots/${shot.id}`}>
                          <Card className="overflow-hidden hover:shadow-md transition-all cursor-pointer group border-border hover:border-primary/40">
                          <div className="aspect-video relative overflow-hidden">
                            <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, hsl(${(shot.id.charCodeAt(2) * 37) % 360}, 60%, 25%), hsl(${(shot.id.charCodeAt(2) * 37 + 60) % 360}, 50%, 15%))` }} />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="font-mono text-white/20 text-2xl font-black tracking-tighter select-none">{shot.name.split('_').pop()}</span>
                            </div>
                            <Badge className={`absolute top-1.5 right-1.5 ${STATUS_COLORS[shot.status]} text-[8px] border-0`}>
                              {shot.status.replace('-', ' ')}
                            </Badge>
                            <div className="absolute bottom-0 inset-x-0 h-6 bg-gradient-to-t from-black/60 to-transparent flex items-end px-2 pb-1">
                              <span className="text-[9px] text-white/70 font-mono">{shot.duration}f · {shot.currentVersion}</span>
                            </div>
                          </div>
                          <CardContent className="p-2.5">
                            <div className="font-medium text-xs truncate group-hover:text-primary transition-colors">{shot.name}</div>
                            <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-between">
                              <span className="font-mono">{shot.currentVersion}</span>
                              <span>{shot.duration}f</span>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
                {shownInGroup < shots.length && (
                  <div className="flex justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => setGroupVisible(v => ({ ...v, [seq]: shownInGroup + SHOTS_PER_GROUP_PAGE_SIZE }))}
                    >
                      <ChevronDown className="w-3.5 h-3.5" /> Load More Shots
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          {sequenceKeys.length > 0 && (
            <div className="flex flex-col items-center gap-2 py-2">
              <p className="text-xs text-muted-foreground">
                Showing {Math.min(visibleSequences, sequenceKeys.length)} of {sequenceKeys.length} sequences
              </p>
              {visibleSequences < sequenceKeys.length && (
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setVisibleSequences(v => v + SEQUENCE_PAGE_SIZE)}>
                  <ChevronDown className="w-3.5 h-3.5" /> Load More Sequences
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {view === 'list' && (
        <div className="space-y-4">
        <div className="rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-muted-foreground">
                <th className="h-10 px-4 text-left font-medium">Shot</th>
                <th className="h-10 px-4 text-left font-medium">Sequence</th>
                <th className="h-10 px-4 text-left font-medium">Status</th>
                <th className="h-10 px-4 text-left font-medium">Assignee</th>
                <th className="h-10 px-4 text-left font-medium">Version</th>
                <th className="h-10 px-4 text-left font-medium">Frames</th>
                <th className="h-10 px-4 text-left font-medium">Review</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, listVisible).map(shot => {
                const assignee = USERS.find(u => u.id === shot.assigneeId);
                return (
                  <tr key={shot.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="p-4"><Link href={`/shots/${shot.id}`} className="font-medium hover:text-primary">{shot.name}</Link></td>
                    <td className="p-4 text-muted-foreground">{shot.sequence}</td>
                    <td className="p-4"><Badge className={`${STATUS_COLORS[shot.status]} text-[10px]`}>{shot.status.replace('-', ' ')}</Badge></td>
                    <td className="p-4 text-muted-foreground">{assignee?.name}</td>
                    <td className="p-4 font-mono text-muted-foreground">{shot.currentVersion}</td>
                    <td className="p-4 text-muted-foreground">{shot.duration}f</td>
                    <td className="p-4"><Badge variant="outline" className="text-[10px]">{shot.reviewStatus}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="flex flex-col items-center gap-2 py-2">
            <p className="text-xs text-muted-foreground">
              Showing {Math.min(listVisible, filtered.length)} of {filtered.length} shots
            </p>
            {listVisible < filtered.length && (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setListVisible(v => v + LIST_PAGE_SIZE)}>
                <ChevronDown className="w-3.5 h-3.5" /> Load More
              </Button>
            )}
          </div>
        )}
        </div>
      )}
    </div>
  );
}
