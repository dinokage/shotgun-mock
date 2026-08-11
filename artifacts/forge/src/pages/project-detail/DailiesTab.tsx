import { PlayCircle, Download, CheckCircle2, XCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SHOTS, USERS } from '@/data/mockData';
import { StatusBadge } from '@/components/shared/StatusBadge';

export default function DailiesTab({ project }: { project: any }) {
  const projectShots = SHOTS.filter(s => s.projectId === project.id);
  
  return (
    <div className="h-full overflow-y-auto p-2">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Dailies & Previews</h2>
          <p className="text-sm text-muted-foreground">Review playblasts and rendered frames for this project.</p>
        </div>
        <Button size="sm"><PlayCircle className="w-4 h-4 mr-2" /> Play All in Theater</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {projectShots.map(shot => {
          const assignee = USERS.find(u => u.id === shot.assigneeId);
          // Deterministic thumbnail based on shot ID
          const thumbSeed = shot.id.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
          
          return (
            <Card key={shot.id} className="overflow-hidden group hover:shadow-md transition-all border-border">
              <div className="relative aspect-video bg-muted group-hover:opacity-90 transition-opacity">
                <img 
                  src={`https://picsum.photos/seed/${thumbSeed}/640/360`} 
                  alt={shot.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button variant="secondary" size="icon" className="rounded-full w-12 h-12 shadow-xl">
                    <PlayCircle className="w-6 h-6 ml-1" />
                  </Button>
                </div>
                <div className="absolute top-2 right-2 flex gap-1">
                  <Badge className="bg-black/60 text-white border-none font-mono text-[10px]">
                    {shot.usdVersion || 'v001'}
                  </Badge>
                </div>
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-semibold">{shot.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{shot.sequence}</div>
                  </div>
                  <StatusBadge status={shot.status} />
                </div>
                
                <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground border-t border-border/50 pt-3">
                  <span className="flex items-center gap-1.5 truncate">
                    <img src={assignee?.avatar} alt="" className="w-4 h-4 rounded-full" />
                    {assignee?.name || 'Unassigned'}
                  </span>
                  
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-green-500 hover:text-green-400 hover:bg-green-500/10">
                      <CheckCircle2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:text-red-400 hover:bg-red-500/10">
                      <XCircle className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// Temporary Badge component to avoid importing full UI library
function Badge({ children, className }: { children: React.ReactNode, className?: string }) {
  return <span className={`px-2 py-0.5 rounded-sm ${className}`}>{children}</span>;
}
