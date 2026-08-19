import { WORKFLOWS } from '@/data/mockData';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Workflow, Plus, Play, Edit3 } from 'lucide-react';
import { Link } from 'wouter';
import { useWorkflowsStore } from '@/store/workflows';
import { useCapability } from '@/hooks/use-capability';

export default function Workflows() {
  // Node counts must reflect whatever's actually saved for each workflow,
  // not the static mockData snapshot - the graph store is the source of
  // truth once a workflow has been opened/edited. mockData's count is only
  // a fallback for a workflow that has no persisted graph yet.
  const graphs = useWorkflowsStore((s) => s.graphs);
  // Editing the pipeline graph (creating a workflow, or opening one in the
  // node editor) is gated on manage_pipeline, not just being on this
  // (already leadership-only) page - e.g. a coordinator can view this page
  // but shouldn't be able to rewire a live pipeline.
  const canManagePipeline = useCapability('manage_pipeline');

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Workflows</h1>
        {canManagePipeline ? (
          <Button className="gap-2" asChild>
            <Link href="/workflows/new"><Plus className="w-4 h-4" /> New Workflow</Link>
          </Button>
        ) : (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="inline-flex">
                  <Button className="gap-2" disabled>
                    <Plus className="w-4 h-4" /> New Workflow
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[220px] text-xs">
                You don't have permission to manage pipelines.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {WORKFLOWS.map(wf => {
          const nodeCount = graphs[wf.id]?.nodes.length ?? wf.nodes;
          return (
          <Card key={wf.id} className="hover-elevate hover:border-primary/50 transition-colors group">
            <CardContent className="p-5">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4">
                <Workflow className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-lg mb-1">{wf.name}</h3>
              <p className="text-sm text-muted-foreground mb-4 line-clamp-2 h-10">{wf.description}</p>

              <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                <div className="bg-muted px-2 py-1 rounded">Trigger: {wf.trigger}</div>
                <div>{nodeCount} nodes</div>
              </div>

              <div className="flex gap-2 pt-4 border-t border-border opacity-80 group-hover:opacity-100 transition-opacity">
                {canManagePipeline ? (
                  <Button variant="outline" size="sm" className="flex-1" asChild>
                    <Link href={`/workflows/${wf.id}`}><Edit3 className="w-4 h-4 mr-1.5" /> Edit</Link>
                  </Button>
                ) : (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={0} className="flex-1 inline-flex">
                          <Button variant="outline" size="sm" className="flex-1" disabled>
                            <Edit3 className="w-4 h-4 mr-1.5" /> Edit
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[220px] text-xs">
                        You don't have permission to manage pipelines.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                <Button size="sm" className="flex-1" asChild>
                  <Link href={`/workflows/run/${wf.id}`}><Play className="w-4 h-4 mr-1.5" /> Run</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
          );
        })}
      </div>
    </div>
  );
}
