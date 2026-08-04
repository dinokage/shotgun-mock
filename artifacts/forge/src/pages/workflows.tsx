import { WORKFLOWS } from '@/data/mockData';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Workflow, Plus, Play, Edit3 } from 'lucide-react';
import { Link } from 'wouter';

export default function Workflows() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Workflows</h1>
        <Button className="gap-2" asChild>
          <Link href="/workflows/new"><Plus className="w-4 h-4" /> New Workflow</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {WORKFLOWS.map(wf => (
          <Card key={wf.id} className="hover-elevate hover:border-primary/50 transition-colors group">
            <CardContent className="p-5">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4">
                <Workflow className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-lg mb-1">{wf.name}</h3>
              <p className="text-sm text-muted-foreground mb-4 line-clamp-2 h-10">{wf.description}</p>
              
              <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                <div className="bg-muted px-2 py-1 rounded">Trigger: {wf.trigger}</div>
                <div>{wf.nodes} nodes</div>
              </div>

              <div className="flex gap-2 pt-4 border-t border-border opacity-80 group-hover:opacity-100 transition-opacity">
                <Button variant="outline" size="sm" className="flex-1" asChild>
                  <Link href={`/workflows/${wf.id}`}><Edit3 className="w-4 h-4 mr-1.5" /> Edit</Link>
                </Button>
                <Button size="sm" className="flex-1" asChild>
                  <Link href={`/workflows/run/${wf.id}`}><Play className="w-4 h-4 mr-1.5" /> Run</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
