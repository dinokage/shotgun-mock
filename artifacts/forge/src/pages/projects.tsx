import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { PROJECTS } from '@/data/mockData';
import { Plus, Filter, ArrowUpDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';

export default function Projects() {
  const { toast } = useToast();

  const handleNewProject = () => {
    toast({ title: 'New Project', description: 'Opening project creation wizard...' });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
        <Button onClick={handleNewProject} className="gap-2">
          <Plus className="w-4 h-4" /> New Project
        </Button>
      </div>

      <div className="flex items-center gap-4 py-2 border-b border-border">
        <Button variant="outline" size="sm" className="gap-2">
          <Filter className="w-4 h-4" /> Status: All
        </Button>
        <Button variant="outline" size="sm" className="gap-2">
          <ArrowUpDown className="w-4 h-4" /> Sort: Last Active
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
        {PROJECTS.map(project => (
          <Link key={project.id} href={`/projects/${project.id}`}>
            <Card className="overflow-hidden hover-elevate cursor-pointer group border-border hover:border-primary/50 transition-colors">
              <div className="h-32 w-full relative" style={{ background: project.thumbnail }}>
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                <div className="absolute top-3 right-3">
                  <StatusBadge status={project.status} className="bg-background/90 backdrop-blur" />
                </div>
              </div>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-bold text-lg group-hover:text-primary transition-colors">{project.name}</h3>
                    <p className="text-sm text-muted-foreground">{project.type}</p>
                  </div>
                </div>
                
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">{project.progress}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div 
                      className="bg-primary h-2 rounded-full transition-all duration-500" 
                      style={{ width: `${project.progress}%` }} 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-5 text-sm">
                  <div>
                    <div className="text-muted-foreground text-xs mb-0.5">Shots & Assets</div>
                    <div className="font-medium">{project.shotsCount} / {project.assetsCount}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs mb-0.5">Due Date</div>
                    <div className="font-medium">{new Date(project.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
