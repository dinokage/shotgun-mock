import { useState } from 'react';
import { useRoute, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Play, Save, CheckCircle2, Zap, Bell, CheckSquare, Settings } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const NODE_TYPES = [
  { type: 'trigger', icon: Zap, label: 'Trigger', color: 'bg-yellow-500' },
  { type: 'condition', icon: CheckSquare, label: 'Condition', color: 'bg-purple-500' },
  { type: 'approval', icon: CheckCircle2, label: 'Approval', color: 'bg-blue-500' },
  { type: 'action', icon: Settings, label: 'Action', color: 'bg-green-500' },
  { type: 'notification', icon: Bell, label: 'Notification', color: 'bg-orange-500' },
];

const INITIAL_NODES = [
  { id: '1', type: 'trigger', label: 'New Version', x: 50, y: 100 },
  { id: '2', type: 'action', label: 'Notify Reviewers', x: 250, y: 100 },
  { id: '3', type: 'approval', label: 'Review Gate', x: 450, y: 100 },
  { id: '4', type: 'action', label: 'Publish Asset', x: 650, y: 100 },
];

export default function WorkflowEditor() {
  const [, params] = useRoute('/workflows/:id');
  const [nodes, setNodes] = useState(INITIAL_NODES);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSave = () => toast({ title: 'Saved', description: 'Workflow saved successfully.' });
  const handleValidate = () => toast({ title: 'Validation', description: 'No errors found.' });

  return (
    <div className="flex flex-col h-screen bg-background relative">
      <div className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8 text-muted-foreground">
            <Link href="/workflows"><ChevronLeft className="w-5 h-5" /></Link>
          </Button>
          <div className="font-semibold text-lg">Review → Approve → Publish</div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleValidate}>Validate</Button>
          <Button variant="outline" size="sm" onClick={handleSave} className="gap-2"><Save className="w-4 h-4"/> Save</Button>
          <Button size="sm" asChild className="bg-[#1E7A34] text-white hover:bg-[#1E7A34]/90 gap-2">
            <Link href={`/workflows/run/${params?.id}`}><Play className="w-4 h-4"/> Run</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Palette */}
        <div className="w-64 border-r border-border bg-card p-4 flex flex-col gap-2 shrink-0 overflow-y-auto">
          <div className="text-xs font-semibold text-muted-foreground mb-2">NODE TYPES</div>
          {NODE_TYPES.map(nt => (
            <div key={nt.type} className="flex items-center gap-3 p-3 border border-border rounded bg-muted/30 cursor-grab hover:bg-muted transition-colors">
              <div className={`w-8 h-8 rounded flex items-center justify-center text-white ${nt.color}`}>
                <nt.icon className="w-4 h-4" />
              </div>
              <span className="font-medium text-sm">{nt.label}</span>
            </div>
          ))}
        </div>

        {/* Canvas */}
        <div className="flex-1 bg-muted/10 relative overflow-hidden" onClick={() => setSelectedNode(null)}>
          {/* SVG Background Grid */}
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(hsl(var(--border)) 1px, transparent 0)', backgroundSize: '24px 24px' }} />
          
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {/* Draw edges (hardcoded simple path) */}
            {nodes.slice(0, nodes.length - 1).map((n, i) => {
              const next = nodes[i+1];
              return (
                <path 
                  key={i}
                  d={`M ${n.x + 160} ${n.y + 40} L ${next.x} ${next.y + 40}`}
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth="2"
                  fill="none"
                  markerEnd="url(#arrow)"
                />
              );
            })}
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--muted-foreground))" />
              </marker>
            </defs>
          </svg>

          {nodes.map((node) => {
            const nt = NODE_TYPES.find(t => t.type === node.type);
            const isSelected = selectedNode === node.id;
            return (
              <div 
                key={node.id}
                className={`absolute w-40 h-20 bg-card border-2 rounded-lg shadow-sm cursor-pointer select-none ${isSelected ? 'border-primary ring-2 ring-primary/20 ring-offset-2 ring-offset-background' : 'border-border hover:border-primary/50'}`}
                style={{ left: node.x, top: node.y }}
                onClick={(e) => { e.stopPropagation(); setSelectedNode(node.id); }}
              >
                <div className={`h-2 rounded-t-sm w-full ${nt?.color}`} />
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    {nt && <nt.icon className="w-3 h-3 text-muted-foreground" />}
                    <span className="text-xs font-medium text-muted-foreground uppercase">{node.type}</span>
                  </div>
                  <div className="font-medium text-sm truncate">{node.label}</div>
                </div>
                {/* Ports */}
                <div className="absolute top-1/2 -left-1.5 w-3 h-3 bg-card border-2 border-border rounded-full -translate-y-1/2" />
                <div className="absolute top-1/2 -right-1.5 w-3 h-3 bg-card border-2 border-border rounded-full -translate-y-1/2" />
              </div>
            );
          })}
        </div>

        {/* Right Properties */}
        {selectedNode ? (
          <div className="w-80 border-l border-border bg-card p-4 shrink-0 animate-in slide-in-from-right-8">
            <h3 className="font-semibold mb-4 border-b border-border pb-2">Properties</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Node Name</label>
                <input type="text" className="w-full bg-muted/50 border border-border rounded p-2 text-sm" value={nodes.find(n => n.id === selectedNode)?.label} readOnly />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Configuration JSON</label>
                <textarea className="w-full h-48 bg-muted/50 border border-border rounded p-2 text-sm font-mono resize-none" defaultValue={`{\n  "target": "reviewers",\n  "template": "v2"\n}`} />
              </div>
            </div>
          </div>
        ) : (
          <div className="w-80 border-l border-border bg-card p-4 shrink-0 flex items-center justify-center text-muted-foreground text-sm">
            Select a node to edit properties
          </div>
        )}
      </div>
    </div>
  );
}
