import { useEffect, useRef, useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PROJECTS, ASSETS, SHOTS, USERS } from '@/data/mockData';
import { useTasksStore } from '@/store/tasks';
import { Maximize2, ZoomIn, ZoomOut, Filter, Activity, GitFork, Crosshair, Users as UsersIcon, ListTodo, Film, Package, FolderOpen, AlertTriangle, Sparkles } from 'lucide-react';
import * as d3 from 'd3-force';
import * as d3Zoom from 'd3-zoom';
import { select } from 'd3-selection';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';

type NodeType = 'project' | 'asset' | 'shot' | 'task' | 'user';

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  type: NodeType;
  name: string;
  status?: string;
  val: number;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  value: number;
  type: 'dependency' | 'assignment' | 'hierarchy';
}

const TYPE_COLORS: Record<NodeType, string> = {
  project: '#3b82f6', // blue-500
  asset: '#a855f7', // purple-500
  shot: '#06b6d4', // cyan-500
  task: '#f97316', // orange-500
  user: '#22c55e', // green-500
};

const getGlow = (status?: string) => {
  const s = status?.toLowerCase();
  if (s === 'bottleneck' || s === 'failed') return 'drop-shadow(0 0 10px rgba(239, 68, 68, 0.9))';
  if (s === 'in-progress' || s === 'review' || s === 'wip') return 'drop-shadow(0 0 8px rgba(249, 115, 22, 0.7))';
  if (s === 'approved' || s === 'completed') return 'drop-shadow(0 0 6px rgba(34, 197, 94, 0.5))';
  return 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))';
};

export default function ImpactAnalysis() {
  const { toast } = useToast();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeProject, setActiveProject] = useState<string>(PROJECTS[0].id);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [dimensions, setDimensions] = useState({ width: 1000, height: 800 });
  const [transform, setTransform] = useState(d3Zoom.zoomIdentity);
  const TASKS = useTasksStore(state => state.tasks);

  // Generate graph data based on selection
  const { nodes, links } = useMemo(() => {
    const graphNodes: GraphNode[] = [];
    const graphLinks: GraphLink[] = [];

    const project = PROJECTS.find(p => p.id === activeProject);
    if (!project) return { nodes: [], links: [] };

    // Add Project Node
    graphNodes.push({ id: project.id, type: 'project', name: project.name, val: 30, status: project.status });

    // Filter relevant data
    const projectAssets = ASSETS.filter(a => a.projectId === activeProject).slice(0, 30);
    const projectShots = SHOTS.filter(s => s.projectId === activeProject).slice(0, 20);
    const projectTasks = TASKS.filter(t => t.projectId === activeProject && (t.assetId || t.shotId)).slice(0, 50);

    // Add Assets
    projectAssets.forEach(a => {
      graphNodes.push({ id: a.id, type: 'asset', name: a.name, val: 20, status: a.status });
      graphLinks.push({ source: project.id, target: a.id, value: 2, type: 'hierarchy' });
      
      a.dependencies.forEach(depId => {
        if (projectAssets.find(pa => pa.id === depId)) {
          graphLinks.push({ source: depId, target: a.id, value: 4, type: 'dependency' });
        }
      });
    });

    // Add Shots
    projectShots.forEach(s => {
      graphNodes.push({ id: s.id, type: 'shot', name: s.name, val: 20, status: s.status });
      graphLinks.push({ source: project.id, target: s.id, value: 2, type: 'hierarchy' });
    });

    // Add Tasks and Users
    const activeUsers = new Set<string>();
    projectTasks.forEach(t => {
      graphNodes.push({ id: t.id, type: 'task', name: t.title, val: 10, status: t.status });
      activeUsers.add(t.assigneeId);
      
      if (t.assetId && projectAssets.find(a => a.id === t.assetId)) graphLinks.push({ source: t.assetId, target: t.id, value: 3, type: 'hierarchy' });
      if (t.shotId && projectShots.find(s => s.id === t.shotId)) graphLinks.push({ source: t.shotId, target: t.id, value: 3, type: 'hierarchy' });
      
      t.dependencies.forEach(depId => {
        if (projectTasks.find(pt => pt.id === depId)) {
          graphLinks.push({ source: depId, target: t.id, value: 5, type: 'dependency' });
        }
      });
    });

    // Add Users
    activeUsers.forEach(uid => {
      const user = USERS.find(u => u.id === uid);
      if (user) {
        graphNodes.push({ id: user.id, type: 'user', name: user.name, val: 15 });
        // Link user to tasks
        projectTasks.filter(t => t.assigneeId === user.id).forEach(t => {
          graphLinks.push({ source: user.id, target: t.id, value: 1, type: 'assignment' });
        });
      }
    });

    return { nodes: graphNodes, links: graphLinks };
  }, [activeProject, TASKS]);

  // Simulation state
  const [simNodes, setSimNodes] = useState<GraphNode[]>([]);
  const [simLinks, setSimLinks] = useState<GraphLink[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    setDimensions({ width: clientWidth, height: clientHeight });

    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(d => d.type === 'dependency' ? 50 : 80))
      .force('charge', d3.forceManyBody().strength(-150))
      .force('center', d3.forceCenter(clientWidth / 2, clientHeight / 2))
      .force('collide', d3.forceCollide().radius(d => (d as GraphNode).val + 10));

    simulation.on('tick', () => {
      setSimNodes([...simulation.nodes()]);
      setSimLinks([...links]);
    });

    return () => {
      simulation.stop();
    };
  }, [nodes, links]);

  // Zoom setup
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = select(svgRef.current);
    const zoom = d3Zoom.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => setTransform(event.transform));
    svg.call(zoom as any);
  }, []);

  const handleCenter = () => {
    if (!svgRef.current) return;
    select(svgRef.current).call(
      d3Zoom.zoom<SVGSVGElement, unknown>().transform as any,
      d3Zoom.zoomIdentity.translate(dimensions.width / 2, dimensions.height / 2).scale(0.8).translate(-dimensions.width / 2, -dimensions.height / 2)
    );
  };

  const selectedConnectedIds = useMemo(() => {
    if (!selectedNode) return new Set<string>();
    const ids = new Set<string>([selectedNode.id]);
    links.forEach(l => {
      const srcId = typeof l.source === 'object' ? l.source.id : l.source;
      const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
      if (srcId === selectedNode.id) ids.add(tgtId as string);
      if (tgtId === selectedNode.id) ids.add(srcId as string);
    });
    return ids;
  }, [selectedNode, links]);

  return (
    <div className="p-6 h-[calc(100vh-3.5rem)] flex flex-col max-w-[1600px] mx-auto">
      <style>{`
        @keyframes flow {
          from { stroke-dashoffset: 24; }
          to { stroke-dashoffset: 0; }
        }
        .link-flow {
          animation: flow 1s linear infinite;
        }
      `}</style>
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Knowledge Graph</h1>
          <p className="text-muted-foreground mt-1">Interactive dependency map and impact analysis</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={activeProject} onValueChange={setActiveProject}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Select Project" /></SelectTrigger>
            <SelectContent>
              {PROJECTS.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2"><Filter className="w-4 h-4" /> Filters</Button>
          <Button 
            className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white mr-2"
            onClick={() => {
              toast({ title: "Scanning Pipeline...", description: "AI analyzing dependency trees for hidden bottlenecks...", duration: 2000 });
              setTimeout(() => toast({ title: "Scan Complete", description: "Found 3 hidden bottlenecks in LookDev.", variant: "destructive" }), 2000);
            }}
          >
            <Activity className="w-4 h-4 animate-pulse" /> Automated Pipeline Scanner
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button className="gap-2"><Activity className="w-4 h-4" /> Analyze Risk</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary" /> AI Risk Assessment
                </DialogTitle>
              </DialogHeader>
              <ScrollArea className="max-h-[60vh] mt-4 pr-4">
                <div className="space-y-6">
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <h4 className="font-semibold text-red-500 flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4" /> High Risk Chain Detected</h4>
                    <p className="text-sm text-foreground/80 leading-relaxed">
                      Rigging task "Hero Character Rig v14" is currently <span className="font-semibold text-red-400">Bottleneck</span>. This creates a critical bottleneck for 12 downstream animation tasks and 4 lighting sequences. Estimated schedule impact: +3 days.
                    </p>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-3">Suggested Mitigations</h4>
                    <div className="space-y-3">
                      <div className="p-3 bg-card border border-border rounded-lg text-sm">
                        <div className="font-medium text-blue-400 mb-1">Option A: Reassign & Expedite (Recommended)</div>
                        <div className="text-muted-foreground">Temporarily reassign 2 riggers from Project B to assist. Clears bottleneck in 24h. Impact to Project B: Negligible.</div>
                      </div>
                      <div className="p-3 bg-card border border-border rounded-lg text-sm">
                        <div className="font-medium text-orange-400 mb-1">Option B: Parallelize Downstream</div>
                        <div className="text-muted-foreground">Approve partial rig release. Allows Animators to start blocking while skin weights are finalized. Risk of rework: Medium.</div>
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollArea>
              <DialogFooter className="mt-6 border-t border-border pt-4">
                <Button variant="outline">Dismiss</Button>
                <Button 
                  className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                  onClick={() => {
                    toast({ title: 'Applying Mitigations', description: 'Reassigning 2 riggers to clear bottleneck...', duration: 2000 });
                    setTimeout(() => toast({ title: 'Mitigation Applied', description: 'Bottleneck cleared. Schedule optimized.', variant: 'default' }), 2000);
                  }}
                >
                  <Sparkles className="w-4 h-4" /> Apply AI Mitigations
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex-1 flex gap-6 min-h-0">
        {/* Graph Area */}
        <Card className="flex-1 relative overflow-hidden bg-dot-pattern">
          {/* Controls */}
          <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 bg-card/80 backdrop-blur-sm p-1.5 rounded-lg border border-border shadow-sm">
            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => select(svgRef.current as any).call(d3Zoom.zoom<SVGSVGElement, unknown>().scaleBy as any, 1.2)}><ZoomIn className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => select(svgRef.current as any).call(d3Zoom.zoom<SVGSVGElement, unknown>().scaleBy as any, 0.8)}><ZoomOut className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={handleCenter}><Crosshair className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" className="w-8 h-8"><Maximize2 className="w-4 h-4" /></Button>
          </div>

          {/* Legend */}
          <div className="absolute bottom-4 left-4 z-10 bg-card/80 backdrop-blur-sm p-3 rounded-lg border border-border shadow-sm space-y-2">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Node Types</div>
            {[
              { type: 'project', icon: FolderOpen, label: 'Project' },
              { type: 'asset', icon: Package, label: 'Asset' },
              { type: 'shot', icon: Film, label: 'Shot' },
              { type: 'task', icon: ListTodo, label: 'Task' },
              { type: 'user', icon: UsersIcon, label: 'Artist' },
            ].map(t => (
              <div key={t.type} className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: TYPE_COLORS[t.type as NodeType] }}>
                  <t.icon className="w-2 h-2 text-white" />
                </div>
                <span className="capitalize text-muted-foreground">{t.label}</span>
              </div>
            ))}
          </div>

          {/* Canvas */}
          <div ref={containerRef} className="w-full h-full bg-background/50 cursor-grab active:cursor-grabbing">
            <svg ref={svgRef} width={dimensions.width} height={dimensions.height} className="w-full h-full">
              <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
                {/* Links */}
                {simLinks.map((link, i) => {
                  const source = link.source as GraphNode;
                  const target = link.target as GraphNode;
                  
                  // Defensive check in case D3 didn't resolve the node (e.g. node not found)
                  if (typeof source === 'string' || typeof target === 'string' || source.x === undefined || target.x === undefined) return null;

                  const isDimmed = selectedNode && !selectedConnectedIds.has(source.id) && !selectedConnectedIds.has(target.id);
                  const isHighlighted = selectedNode && (source.id === selectedNode.id || target.id === selectedNode.id);
                  
                  return (
                      <line
                        key={`link-${i}`}
                        x1={source.x} y1={source.y}
                        x2={target.x} y2={target.y}
                        stroke={link.type === 'dependency' ? '#ef4444' : link.type === 'assignment' ? '#22c55e' : 'currentColor'}
                        strokeOpacity={isHighlighted ? 0.9 : isDimmed ? 0.05 : link.type === 'hierarchy' ? 0.15 : 0.5}
                        strokeWidth={isHighlighted ? 2.5 : 1.5}
                        strokeDasharray={link.type === 'assignment' ? '6,6' : link.type === 'dependency' ? '8,4' : 'none'}
                        className={link.type !== 'hierarchy' && !isDimmed ? 'link-flow' : ''}
                      />
                  );
                })}

                {/* Nodes */}
                {simNodes.map((node) => {
                  const isDimmed = selectedNode && !selectedConnectedIds.has(node.id);
                  const isSelected = selectedNode?.id === node.id;
                  
                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.x || 0}, ${node.y || 0})`}
                      onMouseEnter={() => setHoveredNode(node)}
                      onMouseLeave={() => setHoveredNode(null)}
                      onClick={(e) => { e.stopPropagation(); setSelectedNode(node === selectedNode ? null : node); }}
                      className="cursor-pointer transition-opacity duration-300"
                      style={{ opacity: isDimmed ? 0.15 : 1 }}
                    >
                      <circle
                        r={node.val}
                        fill={TYPE_COLORS[node.type]}
                        stroke={isSelected ? '#fff' : 'rgba(255,255,255,0.1)'}
                        strokeWidth={isSelected ? 3 : 1}
                        className="transition-all duration-300"
                        style={{ filter: getGlow(node.status) }}
                      />
                      {(hoveredNode?.id === node.id || isSelected || node.val > 15) && (
                        <text
                          y={node.val + 14}
                          textAnchor="middle"
                          fill="currentColor"
                          className="text-[10px] font-medium select-none pointer-events-none drop-shadow-md"
                          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
                        >
                          {node.name}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
        </Card>

        {/* Info Panel */}
        {selectedNode ? (
          <Card className="w-80 shrink-0 flex flex-col animate-in slide-in-from-right-4 duration-300">
            <div className="p-4 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2 mb-2">
                <Badge style={{ backgroundColor: TYPE_COLORS[selectedNode.type] }} className="text-[10px] capitalize text-white">
                  {selectedNode.type}
                </Badge>
                {selectedNode.status && (
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {selectedNode.status.replace('-', ' ')}
                  </Badge>
                )}
              </div>
              <h3 className="font-bold text-lg leading-tight">{selectedNode.name}</h3>
              <p className="text-xs text-muted-foreground mt-1">ID: {selectedNode.id}</p>
            </div>
            
            <div className="p-4 space-y-4 flex-1 overflow-y-auto">
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Connected Dependencies</div>
                <div className="space-y-1.5">
                  {links.filter(l => (typeof l.source === 'object' ? l.source.id : l.source) === selectedNode.id && l.type === 'dependency').map((l, i) => {
                    const tgt = l.target as GraphNode;
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-muted/40 border border-border">
                        <ArrowRight className="w-3 h-3 text-red-400" />
                        <span className="font-medium text-red-400">Blocks:</span> {tgt.name}
                      </div>
                    );
                  })}
                  {links.filter(l => (typeof l.target === 'object' ? l.target.id : l.target) === selectedNode.id && l.type === 'dependency').map((l, i) => {
                    const src = l.source as GraphNode;
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-muted/40 border border-border">
                        <ArrowRight className="w-3 h-3 text-orange-400 rotate-180" />
                        <span className="font-medium text-orange-400">Bottleneck By:</span> {src.name}
                      </div>
                    );
                  })}
                  {links.filter(l => (typeof l.source === 'object' ? l.source.id : l.source) === selectedNode.id || (typeof l.target === 'object' ? l.target.id : l.target) === selectedNode.id).filter(l => l.type === 'dependency').length === 0 && (
                    <div className="text-xs text-muted-foreground italic">No direct dependencies.</div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-border mt-auto">
              <Button className="w-full gap-2">View Details <ArrowRight className="w-4 h-4" /></Button>
            </div>
          </Card>
        ) : (
          <Card className="w-80 shrink-0 flex flex-col items-center justify-center p-6 text-center text-muted-foreground bg-muted/10 border-dashed">
            <GitFork className="w-12 h-12 opacity-20 mb-4" />
            <p className="text-sm">Select a node in the graph to view its impact and dependencies.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

// Ensure this icon is available for the list
function ArrowRight(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
    </svg>
  );
}
