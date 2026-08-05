import { useState, useMemo } from 'react';
import { useUIStore } from '@/store/ui';
import { PROJECTS, ASSETS, SHOTS, TASKS, USERS, WORKFLOWS } from '@/data/mockData';
import { Search, FolderOpen, Package, Film, ListTodo, Users, Workflow, X, ArrowRight, Building2 } from 'lucide-react';
import { Link } from 'wouter';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type SearchResult = {
  type: 'project' | 'asset' | 'shot' | 'task' | 'artist' | 'workflow';
  id: string;
  name: string;
  subtitle: string;
  href: string;
};

const TYPE_ICONS = {
  project: FolderOpen,
  asset: Package,
  shot: Film,
  task: ListTodo,
  artist: Users,
  workflow: Workflow,
};

const TYPE_COLORS = {
  project: 'text-blue-500',
  asset: 'text-purple-500',
  shot: 'text-cyan-500',
  task: 'text-orange-500',
  artist: 'text-green-500',
  workflow: 'text-pink-500',
};

export function GlobalSearch() {
  const { searchOpen, setSearchOpen } = useUIStore();
  const [query, setQuery] = useState('');
  const [studio, setStudio] = useState('current');

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const res: SearchResult[] = [];

    PROJECTS.filter(p => p.name.toLowerCase().includes(q)).slice(0, 3).forEach(p =>
      res.push({ type: 'project', id: p.id, name: p.name, subtitle: p.type, href: `/projects/${p.id}` })
    );
    ASSETS.filter(a => a.name.toLowerCase().includes(q)).slice(0, 5).forEach(a =>
      res.push({ type: 'asset', id: a.id, name: a.name, subtitle: `${a.type} · ${a.status}`, href: `/assets/${a.id}` })
    );
    SHOTS.filter(s => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)).slice(0, 5).forEach(s =>
      res.push({ type: 'shot', id: s.id, name: s.name, subtitle: s.sequence, href: `/shots/${s.id}` })
    );
    TASKS.filter(t => t.title.toLowerCase().includes(q)).slice(0, 5).forEach(t =>
      res.push({ type: 'task', id: t.id, name: t.title, subtitle: t.status, href: `/tasks` })
    );
    USERS.filter(u => u.name.toLowerCase().includes(q)).slice(0, 3).forEach(u =>
      res.push({ type: 'artist', id: u.id, name: u.name, subtitle: u.role, href: `/profile` })
    );
    WORKFLOWS.filter(w => w.name.toLowerCase().includes(q)).slice(0, 2).forEach(w =>
      res.push({ type: 'workflow', id: w.id, name: w.name, subtitle: w.trigger, href: `/workflows/${w.id}` })
    );

    return res;
  }, [query]);

  if (!searchOpen) return null;

  const handleSelect = () => {
    setSearchOpen(false);
    setQuery('');
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-background/60 backdrop-blur-sm z-50 animate-in fade-in duration-150"
        onClick={() => { setSearchOpen(false); setQuery(''); }}
      />
      <div className="fixed top-[15vh] left-1/2 -translate-x-1/2 w-full max-w-2xl z-50 animate-in slide-in-from-top-4 fade-in duration-200">
        <div className="bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/20">
            <div className="flex-shrink-0 w-32 border-r border-border pr-3">
              <Select value={studio} onValueChange={setStudio}>
                <SelectTrigger className="h-8 text-xs border-0 bg-transparent focus:ring-0 shadow-none px-2 gap-1.5 hover:bg-muted/50 transition-colors rounded-md">
                  <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">LA Studio</SelectItem>
                  <SelectItem value="london">London Studio</SelectItem>
                  <SelectItem value="global">All Studios</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Search className="w-5 h-5 text-muted-foreground shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Search in ${studio === 'global' ? 'all studios' : studio === 'london' ? 'London' : 'LA'}...`}
              className="flex-1 bg-transparent text-lg outline-none placeholder:text-muted-foreground/50"
            />
            <button onClick={() => { setSearchOpen(false); setQuery(''); }}>
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Results */}
          <div className="max-h-[50vh] overflow-y-auto">
            {query && results.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                No results found for "{query}"
              </div>
            )}

            {!query && (
              <div className="p-4 space-y-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quick Links</div>
                {[
                  { label: 'Dashboard', href: '/' },
                  { label: 'My Tasks', href: '/tasks' },
                  { label: 'Review Queue', href: '/review' },
                  { label: 'Knowledge Graph', href: '/impact' },
                ].map(link => (
                  <Link key={link.href} href={link.href} onClick={handleSelect}>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted transition-colors text-sm cursor-pointer">
                      <ArrowRight className="w-3 h-3 text-muted-foreground" />
                      {link.label}
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {results.length > 0 && (
              <div className="py-2">
                {(['project', 'asset', 'shot', 'task', 'artist', 'workflow'] as const).map(type => {
                  const typeResults = results.filter(r => r.type === type);
                  if (typeResults.length === 0) return null;
                  const Icon = TYPE_ICONS[type];
                  return (
                    <div key={type}>
                      <div className="px-4 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{type}s</div>
                      {typeResults.map(r => (
                        <Link key={r.id} href={r.href} onClick={handleSelect}>
                          <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted transition-colors cursor-pointer">
                            <Icon className={`w-4 h-4 ${TYPE_COLORS[type]} shrink-0`} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{r.name}</div>
                              <div className="text-xs text-muted-foreground">{r.subtitle}</div>
                            </div>
                            <ArrowRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-4 py-2 flex items-center gap-4 text-[10px] text-muted-foreground">
            <span><kbd className="font-mono bg-muted px-1 rounded">↑↓</kbd> Navigate</span>
            <span><kbd className="font-mono bg-muted px-1 rounded">↵</kbd> Open</span>
            <span><kbd className="font-mono bg-muted px-1 rounded">esc</kbd> Close</span>
          </div>
        </div>
      </div>
    </>
  );
}
