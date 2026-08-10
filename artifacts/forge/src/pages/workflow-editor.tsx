import { useCallback, useState } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  Handle,
  Position,
  Panel
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Play, Save, Workflow, Cog, Copy, Trash2, ArrowLeft, Paintbrush, Box, UserPlus, CheckSquare, Bell } from 'lucide-react';
import { Link } from 'wouter';

// Custom Node Components
const WorkflowNode = ({ data }: { data: any }) => {
  return (
    <div className="px-4 py-3 shadow-md rounded-md bg-card border border-border min-w-[180px]">
      <Handle type="target" position={Position.Top} className="w-16 !bg-primary/50" />
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-6 h-6 rounded flex items-center justify-center bg-${data.color}-500/10 text-${data.color}-500`}>
          <data.icon className="w-3.5 h-3.5" />
        </div>
        <div className="font-medium text-sm">{data.label}</div>
      </div>
      <div className="text-[10px] text-muted-foreground">{data.description}</div>
      <Handle type="source" position={Position.Bottom} className="w-16 !bg-primary" />
    </div>
  );
};

const nodeTypes = { custom: WorkflowNode };

const initialNodes: Node[] = [
  {
    id: 'trigger-1',
    type: 'custom',
    position: { x: 400, y: 50 },
    data: { label: 'Asset Created', description: 'Triggers when a new asset is added', icon: Play, color: 'green' },
  },
  {
    id: 'action-1',
    type: 'custom',
    position: { x: 400, y: 200 },
    data: { label: 'Generate Proxy', description: 'Create lightweight USD proxy', icon: Box, color: 'blue' },
  },
  {
    id: 'cond-1',
    type: 'custom',
    position: { x: 400, y: 350 },
    data: { label: 'Is Character?', description: 'Branch based on asset type', icon: Workflow, color: 'purple' },
  },
  {
    id: 'action-2a',
    type: 'custom',
    position: { x: 200, y: 500 },
    data: { label: 'Assign Rigging', description: 'Create rigging task', icon: UserPlus, color: 'orange' },
  },
  {
    id: 'action-2b',
    type: 'custom',
    position: { x: 600, y: 500 },
    data: { label: 'Assign Modeling', description: 'Create modeling task', icon: Paintbrush, color: 'orange' },
  },
  {
    id: 'action-3',
    type: 'custom',
    position: { x: 400, y: 650 },
    data: { label: 'Notify Supervisors', description: 'Send Slack alert', icon: Bell, color: 'pink' },
  },
  {
    id: 'action-4',
    type: 'custom',
    position: { x: 400, y: 800 },
    data: { label: 'Require Review', description: 'Auto-schedule initial review', icon: CheckSquare, color: 'cyan' },
  },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: 'trigger-1', target: 'action-1', type: 'smoothstep', animated: true, style: { strokeWidth: 2 } },
  { id: 'e2-3', source: 'action-1', target: 'cond-1', type: 'smoothstep', animated: true, style: { strokeWidth: 2 } },
  { id: 'e3-4a', source: 'cond-1', target: 'action-2a', type: 'smoothstep', label: 'Yes', animated: true, style: { strokeWidth: 2, stroke: '#f97316' } },
  { id: 'e3-4b', source: 'cond-1', target: 'action-2b', type: 'smoothstep', label: 'No', animated: true, style: { strokeWidth: 2, stroke: '#f97316' } },
  { id: 'e4a-5', source: 'action-2a', target: 'action-3', type: 'smoothstep', animated: true, style: { strokeWidth: 2 } },
  { id: 'e4b-5', source: 'action-2b', target: 'action-3', type: 'smoothstep', animated: true, style: { strokeWidth: 2 } },
  { id: 'e5-6', source: 'action-3', target: 'action-4', type: 'smoothstep', animated: true, style: { strokeWidth: 2 } },
];

export default function WorkflowEditor() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const onConnect = useCallback((params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      <div className="h-14 border-b border-border bg-card flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8 -ml-2"><Link href="/settings"><ArrowLeft className="w-4 h-4" /></Link></Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-semibold text-sm">Department Pipeline Builder</h1>
              <select className="bg-muted text-xs px-2 py-1 rounded border border-border outline-none">
                <option>VFX Pipeline</option>
                <option>3D Pipeline</option>
                <option>2D Pipeline</option>
              </select>
              <Badge variant="outline" className="text-[9px] h-4 bg-green-500/10 text-green-500 border-0">ACTIVE</Badge>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2"><Play className="w-4 h-4" /> Test Run</Button>
          <Button size="sm" className="gap-2"><Save className="w-4 h-4" /> Save Workflow</Button>
        </div>
      </div>

      <div className="flex-1 flex">
        <div className="flex-1 relative bg-background/50">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNode(node)}
            onPaneClick={() => setSelectedNode(null)}
            nodeTypes={nodeTypes}
            fitView
            className="bg-dot-pattern"
          >
            <Controls className="bg-card border-border fill-foreground" />
            <MiniMap className="bg-card border-border" nodeColor="#3b82f6" maskColor="rgba(0,0,0,0.5)" />
            <Background color="#555" gap={16} />
            
            <Panel position="top-left" className="bg-card/80 backdrop-blur-sm p-2 rounded-lg border border-border shadow-sm">
              <div className="text-xs font-medium mb-2 px-1">Pipeline Nodes</div>
              <div className="flex flex-col gap-1">
                <Button variant="ghost" size="sm" className="justify-start gap-2 h-8 text-xs font-normal"><Play className="w-3.5 h-3.5 text-green-500" /> Start / Trigger</Button>
                <Button variant="ghost" size="sm" className="justify-start gap-2 h-8 text-xs font-normal"><Box className="w-3.5 h-3.5 text-blue-500" /> Dept Stage (2D/3D/VFX)</Button>
                <Button variant="ghost" size="sm" className="justify-start gap-2 h-8 text-xs font-normal"><CheckSquare className="w-3.5 h-3.5 text-purple-500" /> Internal Review</Button>
                <Button variant="ghost" size="sm" className="justify-start gap-2 h-8 text-xs font-normal"><UserPlus className="w-3.5 h-3.5 text-orange-500" /> Client Feedback</Button>
                <Button variant="ghost" size="sm" className="justify-start gap-2 h-8 text-xs font-normal"><Workflow className="w-3.5 h-3.5 text-cyan-500" /> Branch / Condition</Button>
              </div>
            </Panel>
          </ReactFlow>
        </div>

        {/* Configuration Sidebar */}
        <div className="w-80 border-l border-border bg-card flex flex-col z-10 shrink-0">
          {selectedNode ? (
            <>
              <div className="p-4 border-b border-border">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Node Settings</h3>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Node Name</label>
                  <input type="text" className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm" value={selectedNode.data.label as string} readOnly />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
                  <textarea className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm h-20 resize-none" value={selectedNode.data.description as string} readOnly />
                </div>
                
                <div className="pt-4 border-t border-border">
                  <h4 className="text-sm font-medium mb-3">Configuration</h4>
                  <div className="space-y-3">
                    {selectedNode.id.includes('trigger') ? (
                      <div className="space-y-2">
                        <label className="text-xs text-muted-foreground block">Event Type</label>
                        <select className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm">
                          <option>Status Changed</option>
                          <option>Entity Created</option>
                          <option>Schedule Reached</option>
                        </select>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <label className="text-xs text-muted-foreground block">Action Type</label>
                        <select className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm">
                          <option>Run Script</option>
                          <option>Send Notification</option>
                          <option>Update Entity</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground bg-muted/10">
              <Cog className="w-10 h-10 opacity-20 mb-3" />
              <p className="text-sm">Select a node to configure its properties</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
