import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { PROJECTS, EPISODES } from '@/data/mockData';
import { Plus, Filter, Search, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Link } from 'wouter';
import { apiClient } from '@/lib/apiClient';
import { useEffect } from 'react';

export default function Projects() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
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
        <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground"><Filter className="w-4 h-4" /></Button>
      </div>

      {/* Grid */}
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
    </div>
  );
}
