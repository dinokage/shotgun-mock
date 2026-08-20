import { useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EPISODES } from '@/data/mockData';
import { useProjectStore } from '@/store/projects';
import { useShotStore } from '@/store/shots';
import { useUIStore } from '@/store/ui';
import { Plus, Filter, Search, Download, LayoutGrid, List } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Link } from 'wouter';
import { cut, stagger } from '@/lib/motion';

const STATUS_LABELS: Record<string, string> = {
  ON_TRACK: 'On Track',
  AT_RISK: 'At Risk',
  BOTTLENECK: 'Bottleneck',
  COMPLETE: 'Complete',
};

export default function Projects() {
  const prefersReducedMotion = useReducedMotion();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'card'>('list');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const projects = useProjectStore((state) => state.projects);
  const shots = useShotStore((state) => state.shots);
  const { setCreateProjectModalOpen } = useUIStore();

  const handleNewProject = () => {
    setCreateProjectModalOpen(true);
  };

  const projectTypes = useMemo(
    () => Array.from(new Set(projects.map((p) => p.type))).sort(),
    [projects]
  );

  const filteredProjects = projects.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (typeFilter !== 'all' && p.type !== typeFilter) return false;
    return true;
  });

  const escapeCSVValue = (value: unknown) => {
    const s = String(value ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const handleExportCSV = () => {
    const headers = ['ID', 'Project Name', 'Type', 'Client', 'Episodes', 'Progress %', 'Status', 'Due Date'];
    const rows = filteredProjects.map((project, idx) => [
      String(idx + 1).padStart(3, '0'),
      project.name,
      project.type,
      project.client,
      EPISODES.filter(e => e.projectId === project.id).length,
      project.progress,
      STATUS_LABELS[project.status] || project.status,
      project.dueDate,
    ]);
    const csv = [headers, ...rows].map((r) => r.map(escapeCSVValue).join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `projects-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({ title: 'Export Complete', description: `${filteredProjects.length} projects exported to CSV.` });
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto h-[calc(100vh-3.5rem)] flex flex-col space-y-4 bg-background">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Active Projects</h1>
          <p className="text-muted-foreground text-sm mt-1">Production pipeline tracking and client deliveries.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="w-4 h-4 mr-2" /> Export
          </Button>
          <Button onClick={handleNewProject} size="sm" className="gap-2">
            <Plus className="w-4 h-4" /> New Project
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg shadow-sm shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input 
            placeholder="Search projects..." 
            className="pl-9 h-9" 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
          />
        </div>
        <div className="flex bg-muted/50 p-0.5 rounded-lg border border-border">
          <Button 
            variant={view === 'list' ? 'secondary' : 'ghost'} 
            size="sm" 
            onClick={() => setView('list')}
            className="h-8 px-3 shadow-none"
          >
            <List className="w-4 h-4" />
          </Button>
          <Button 
            variant={view === 'card' ? 'secondary' : 'ghost'} 
            size="sm" 
            onClick={() => setView('card')}
            className="h-8 px-3 shadow-none"
          >
            <LayoutGrid className="w-4 h-4" />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowFilters((v) => !v)}
          title={showFilters ? 'Hide filters' : 'Show filters'}
          className={`h-9 w-9 ${showFilters ? 'text-foreground bg-muted' : 'text-muted-foreground'}`}
        >
          <Filter className="w-4 h-4" />
        </Button>
      </div>

      {/* Filters row 2: status & type */}
      <AnimatePresence initial={false}>
        {showFilters && (
          <motion.div
            key="project-filter-controls"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={cut.transition}
            className="overflow-hidden shrink-0"
          >
            <div className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg shadow-sm">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {projectTypes.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(statusFilter !== 'all' || typeFilter !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => { setStatusFilter('all'); setTypeFilter('all'); }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      {view === 'list' ? (
        <div className="flex-1 bg-card border border-border rounded-lg overflow-hidden shadow-sm flex flex-col">
          <div className="overflow-auto flex-1">
            <table className="w-full text-left text-[13px] whitespace-nowrap">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-md z-10 shadow-[0_1px_0_var(--border)]">
                <tr className="text-muted-foreground">
                  <th className="h-10 px-4 font-medium w-16">ID</th>
                  <th className="h-10 px-4 font-medium">Project Name</th>
                  <th className="h-10 px-4 font-medium">Type</th>
                  <th className="h-10 px-4 font-medium">Client</th>
                  <th className="h-10 px-4 font-medium">Episodes</th>
                  <th className="h-10 px-4 font-medium">Overall Progress</th>
                  <th className="h-10 px-4 font-medium">Status</th>
                  <th className="h-10 px-4 font-medium">Due Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((project, idx) => {
                  const epCount = EPISODES.filter(e => e.projectId === project.id).length;
                  return (
                    <tr 
                      key={project.id} 
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                    >
                      <td className="h-12 px-4 text-muted-foreground text-xs font-mono">{String(idx + 1).padStart(3, '0')}</td>
                      <td className="h-12 px-4 font-medium">
                        <Link href={`/projects/${project.id}`} className="hover:text-primary hover:underline transition-colors flex items-center gap-3">
                          <div className="w-6 h-6 rounded-sm bg-muted overflow-hidden shrink-0 border border-border/50">
                            {project.thumbnail.startsWith('http') ? (
                              <img src={project.thumbnail} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full" style={{ background: project.thumbnail }} />
                            )}
                          </div>
                          {project.name}
                        </Link>
                      </td>
                      <td className="h-12 px-4 text-muted-foreground">{project.type}</td>
                      <td className="h-12 px-4 text-muted-foreground">{project.client}</td>
                      <td className="h-12 px-4 tabular-nums text-muted-foreground">{epCount}</td>
                      <td className="h-12 px-4">
                        <div className="flex items-center gap-3 w-48">
                          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden border border-border/50">
                            <div 
                              className="bg-primary h-1.5 rounded-full transition-all duration-500" 
                              style={{ width: `${project.progress}%` }} 
                            />
                          </div>
                          <span className="text-[11px] tabular-nums font-medium min-w-[3ch]">{project.progress}%</span>
                        </div>
                      </td>
                      <td className="h-12 px-4">
                        <StatusBadge status={project.status} className="h-6 text-[10px]" />
                      </td>
                      <td className="h-12 px-4 tabular-nums text-muted-foreground">{project.dueDate}</td>
                    </tr>
                  );
                })}
                {filteredProjects.length === 0 && (
                  <tr>
                    <td colSpan={8} className="h-32 text-center text-muted-foreground">
                      No projects found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="h-10 bg-muted/30 border-t border-border flex items-center justify-between px-4 text-xs text-muted-foreground shrink-0">
            <span>{filteredProjects.length} projects</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
            {filteredProjects.map((project, i) => (
              <motion.div key={project.id} {...(prefersReducedMotion ? {} : stagger(i))}>
              <Link href={`/projects/${project.id}`}>
                <div className="bg-card border border-border rounded-lg overflow-hidden shadow-sm hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group flex flex-col h-full">
                  <div className="aspect-video w-full bg-muted overflow-hidden relative border-b border-border">
                    {project.thumbnail.startsWith('http') ? (
                      <img src={project.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full group-hover:opacity-80 transition-opacity" style={{ background: project.thumbnail }} />
                    )}
                    <div className="absolute top-2 right-2">
                      <StatusBadge status={project.status} className="shadow-md" />
                    </div>
                  </div>
                  <div className="p-4 flex flex-col flex-1">
                    <h3 className="font-semibold text-lg line-clamp-1 group-hover:text-primary transition-colors">{project.name}</h3>
                    <div className="text-sm text-muted-foreground mt-1 mb-4 flex justify-between">
                      <span>{project.client}</span>
                      <span>{project.type}</span>
                    </div>

                    {/* Previews of Latest Shorts inside Project */}
                    <div className="mb-4">
                      <div className="text-[10px] uppercase font-bold text-muted-foreground mb-2">Latest Deliveries</div>
                      <div className="flex gap-1">
                        {shots.filter(s => s.projectId === project.id && s.thumbnail).slice(0, 4).map(shot => (
                          <div key={shot.id} className="w-8 h-8 rounded-sm bg-muted overflow-hidden border border-border">
                            <img src={shot.thumbnail} alt={shot.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100" />
                          </div>
                        ))}
                        {shots.filter(s => s.projectId === project.id && s.thumbnail).length === 0 && (
                          <span className="text-xs text-muted-foreground italic">No deliveries yet.</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-auto">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                        <span>Progress</span>
                        <span className="tabular-nums font-medium text-foreground">{project.progress}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                        <div 
                          className="bg-primary h-1.5 rounded-full" 
                          style={{ width: `${project.progress}%` }} 
                        />
                      </div>
                      <div className="text-xs text-muted-foreground mt-4">
                        Due {new Date(project.dueDate).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
