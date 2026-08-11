import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { PROJECTS, EPISODES, SHOTS } from '@/data/mockData';
import { Plus, Filter, Search, Download, LayoutGrid, List } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Link } from 'wouter';
import { apiClient } from '@/lib/apiClient';

export default function Projects() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'card'>('list');
  const [liveProjects, setLiveProjects] = useState<any[]>(PROJECTS);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const data = await apiClient.get('/projects');
        if (data && data.length > 0) {
          setLiveProjects(data);
        }
      } catch (e) {
        console.error("Failed to fetch projects:", e);
      }
    };
    fetchProjects();
  }, []);

  const handleNewProject = () => {
    toast({ title: 'New Project', description: 'Opening project creation wizard...' });
  };

  const filteredProjects = liveProjects.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 max-w-[1600px] mx-auto h-[calc(100vh-3.5rem)] flex flex-col space-y-4 bg-background">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Active Projects</h1>
          <p className="text-muted-foreground text-sm mt-1">Production pipeline tracking and client deliveries.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => toast({ title: "Exporting CSV..." })}>
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
        <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground"><Filter className="w-4 h-4" /></Button>
      </div>

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
            {filteredProjects.map(project => (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <div className="bg-card border border-border rounded-lg overflow-hidden shadow-sm hover:border-primary/50 transition-colors cursor-pointer group flex flex-col h-full">
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
                        {SHOTS.filter(s => s.projectId === project.id && s.thumbnail).slice(0, 4).map(shot => (
                          <div key={shot.id} className="w-8 h-8 rounded-sm bg-muted overflow-hidden border border-border">
                            <img src={shot.thumbnail} alt={shot.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100" />
                          </div>
                        ))}
                        {SHOTS.filter(s => s.projectId === project.id && s.thumbnail).length === 0 && (
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
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
