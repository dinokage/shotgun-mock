import { useState } from 'react';
import { useRoute, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { ChevronLeft, CheckCircle2, PlayCircle, Loader2, AlertCircle, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

const RUN_NODES = [
  { id: '1', label: 'New Version', status: 'complete', color: 'bg-[#1E7A34]', icon: CheckCircle2, x: 50 },
  { id: '2', label: 'Notify Reviewers', status: 'complete', color: 'bg-[#1E7A34]', icon: CheckCircle2, x: 250 },
  { id: '3', label: 'Review Gate', status: 'paused', color: 'bg-[#B5651D]', icon: Clock, x: 450, badge: 'Awaiting approval from Maya Chen' },
  { id: '4', label: 'Publish Asset', status: 'pending', color: 'bg-muted-foreground', icon: PlayCircle, x: 650 },
];

export default function WorkflowRun() {
  const [, params] = useRoute('/workflows/run/:id');
  const [nodes, setNodes] = useState(RUN_NODES);
  const { toast } = useToast();

  const handleApprove = () => {
    // Transition node 3 to complete, node 4 to running
    let newNodes = [...nodes];
    newNodes[2] = { ...newNodes[2], status: 'complete', color: 'bg-[#1E7A34]', icon: CheckCircle2, badge: undefined };
    newNodes[3] = { ...newNodes[3], status: 'running', color: 'bg-blue-500', icon: Loader2 };
    setNodes([...newNodes]);

    setTimeout(() => {
      // Transition node 4 to complete
      newNodes = [...newNodes];
      newNodes[3] = { ...newNodes[3], status: 'complete', color: 'bg-[#1E7A34]', icon: CheckCircle2 };
      setNodes([...newNodes]);
      toast({ title: 'Workflow completed', description: 'All steps executed successfully.' });
    }, 1500);
  };

  return (
    <div className="flex flex-col h-screen bg-background relative">
      <div className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8 text-muted-foreground">
            <Link href="/workflows"><ChevronLeft className="w-5 h-5" /></Link>
          </Button>
          <div>
            <div className="font-semibold flex items-center gap-2">
              Run: Review → Approve → Publish
              <Badge variant="outline" className="text-blue-500 border-blue-500/30 bg-blue-500/10">In Progress</Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-muted/10 relative overflow-hidden flex flex-col">
        <div className="flex-1 relative">
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {nodes.slice(0, nodes.length - 1).map((n, i) => {
              const next = nodes[i+1];
              const isComplete = n.status === 'complete';
              return (
                <path 
                  key={i}
                  d={`M ${n.x + 160} 140 L ${next.x} 140`}
                  stroke={isComplete ? "hsl(134 60% 30%)" : "hsl(var(--border))"}
                  strokeWidth={isComplete ? "3" : "2"}
                  fill="none"
                />
              );
            })}
          </svg>

          {nodes.map((node) => {
            const isPaused = node.status === 'paused';
            return (
              <div 
                key={node.id}
                className={`absolute w-40 p-4 bg-card border-2 rounded-lg shadow-sm flex flex-col items-center justify-center text-center ${node.status === 'running' ? 'border-blue-500 animate-pulse' : 'border-border'}`}
                style={{ left: node.x, top: 100 }}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white mb-3 ${node.color} ${node.status === 'running' ? 'animate-spin' : ''}`}>
                  <node.icon className="w-5 h-5" />
                </div>
                <div className="font-medium text-sm">{node.label}</div>
                <div className="text-xs text-muted-foreground capitalize mt-1">{node.status}</div>
                
                {node.badge && (
                  <div className="absolute -bottom-10 whitespace-nowrap bg-orange-500/20 text-orange-500 text-xs px-2 py-1 rounded border border-orange-500/30">
                    {node.badge}
                  </div>
                )}
                
                {isPaused && (
                  <Button size="sm" className="absolute -bottom-20 bg-status-green hover:bg-status-green/90 text-white shadow-lg" onClick={handleApprove}>
                    Approve Step
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {/* Execution Log */}
        <div className="h-64 border-t border-border bg-card flex flex-col">
          <div className="p-2 border-b border-border font-semibold text-sm px-4 bg-muted/30 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-muted-foreground"/> Execution Log
          </div>
          <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1.5">
            <div className="text-muted-foreground">[10:00:01] <span className="text-foreground">Workflow triggered by v003 creation</span></div>
            <div className="text-muted-foreground">[10:00:02] <span className="text-status-green">Node 1 (New Version) completed successfully.</span></div>
            <div className="text-muted-foreground">[10:00:02] <span className="text-foreground">Executing Node 2 (Notify Reviewers)...</span></div>
            <div className="text-muted-foreground">[10:00:03] <span className="text-foreground">Sent email to m.chen@nebula.co, a.diallo@nebula.co</span></div>
            <div className="text-muted-foreground">[10:00:03] <span className="text-status-green">Node 2 (Notify Reviewers) completed successfully.</span></div>
            <div className="text-muted-foreground">[10:00:03] <span className="text-status-orange">Node 3 (Review Gate) paused. Awaiting manual input.</span></div>
            {nodes[3].status === 'complete' && (
              <>
                <div className="text-muted-foreground mt-2">[10:15:00] <span className="text-foreground">Manual approval received from Maya Chen.</span></div>
                <div className="text-muted-foreground">[10:15:00] <span className="text-status-green">Node 3 (Review Gate) completed successfully.</span></div>
                <div className="text-muted-foreground">[10:15:00] <span className="text-foreground">Executing Node 4 (Publish Asset)...</span></div>
                <div className="text-muted-foreground">[10:15:01] <span className="text-foreground">Copying files to /prod/assets/</span></div>
                <div className="text-muted-foreground">[10:15:01] <span className="text-status-green">Node 4 (Publish Asset) completed successfully.</span></div>
                <div className="text-muted-foreground font-bold mt-2">[10:15:01] <span className="text-status-green">WORKFLOW FINISHED.</span></div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
