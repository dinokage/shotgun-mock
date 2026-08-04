import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const MOCK_NODES = [
  { id: 'center', type: 'asset', label: 'CHAR_Hero_Lyra', x: 0, y: 0 },
  { id: 't1', type: 'task', label: 'Rig facial controls', x: -100, y: -80 },
  { id: 's1', type: 'shot', label: 'SEQ_010_SH_010', x: 120, y: -50 },
  { id: 's2', type: 'shot', label: 'SEQ_010_SH_020', x: 140, y: 40 },
  { id: 's3', type: 'shot', label: 'SEQ_030_SH_015', x: 80, y: 120 },
  { id: 'u1', type: 'user', label: 'Luca Moretti', x: -120, y: 60 },
];

const MOCK_EDGES = [
  { from: 'center', to: 't1', label: 'has_task' },
  { from: 'center', to: 's1', label: 'used_in' },
  { from: 'center', to: 's2', label: 'used_in' },
  { from: 'center', to: 's3', label: 'used_in' },
  { from: 't1', to: 'u1', label: 'assigned_to' },
];

const TYPE_COLORS: Record<string, string> = {
  asset: 'hsl(280 60% 50%)', // purple
  shot: 'hsl(196 60% 40%)',  // teal
  task: 'hsl(28 72% 41%)',   // amber
  user: 'hsl(220 70% 50%)',  // blue
};

export default function ImpactAnalysis() {
  const [selectedEntity, setSelectedEntity] = useState('CHAR_Hero_Lyra');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden p-6 max-w-7xl mx-auto gap-6">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Impact Analysis</h1>
          <p className="text-muted-foreground mt-1">Knowledge Graph Explorer</p>
        </div>
        <div className="w-72">
          <Select value={selectedEntity} onValueChange={setSelectedEntity}>
            <SelectTrigger>
              <SelectValue placeholder="Select entity..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CHAR_Hero_Lyra">CHAR_Hero_Lyra</SelectItem>
              <SelectItem value="ENV_SpaceStation">ENV_SpaceStation</SelectItem>
              <SelectItem value="FX_MagicBlast">FX_MagicBlast</SelectItem>
              <SelectItem value="SEQ_020_SH_040">SEQ_020_SH_040</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="shrink-0 bg-primary/5 border-primary/20">
        <CardContent className="p-4 flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <span className="text-xl">📊</span>
          </div>
          <div>
            <h3 className="font-semibold text-primary">Impact Summary</h3>
            <p className="text-sm mt-1">
              Changing <strong className="font-mono">{selectedEntity}</strong> affects <strong>8 shots</strong> across 2 sequences, notifying <strong>4 artists</strong>. 3 tasks depend directly on this asset.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="flex-1 overflow-hidden relative bg-[#0B131A] dark:bg-black/50">
        {mounted && (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="w-full h-full overflow-visible" style={{ transform: 'translate(50%, 50%)' }}>
              <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--muted-foreground))" opacity="0.5" />
                </marker>
              </defs>
              
              {/* Edges */}
              {MOCK_EDGES.map((edge, i) => {
                const fromNode = MOCK_NODES.find(n => n.id === edge.from)!;
                const toNode = MOCK_NODES.find(n => n.id === edge.to)!;
                const midX = (fromNode.x + toNode.x) / 2;
                const midY = (fromNode.y + toNode.y) / 2;
                
                return (
                  <g key={i}>
                    <line 
                      x1={fromNode.x} y1={fromNode.y} 
                      x2={toNode.x} y2={toNode.y} 
                      stroke="hsl(var(--muted-foreground))" 
                      strokeWidth="1.5" 
                      opacity="0.3"
                      markerEnd="url(#arrowhead)"
                    />
                    <rect x={midX - 25} y={midY - 8} width="50" height="16" fill="hsl(var(--background))" rx="4" opacity="0.8" />
                    <text x={midX} y={midY + 3} fontSize="8" fill="hsl(var(--muted-foreground))" textAnchor="middle">{edge.label}</text>
                  </g>
                );
              })}

              {/* Nodes */}
              {MOCK_NODES.map(node => {
                const color = TYPE_COLORS[node.type];
                const isCenter = node.id === 'center';
                const radius = isCenter ? 24 : 16;
                
                return (
                  <g key={node.id} className="cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setSelectedEntity(node.label)}>
                    <circle 
                      cx={node.x} cy={node.y} r={radius} 
                      fill={color} 
                      stroke="hsl(var(--background))" 
                      strokeWidth={isCenter ? 4 : 2}
                      className={isCenter ? "shadow-2xl" : ""}
                    />
                    <text 
                      x={node.x} y={node.y + radius + 14} 
                      fontSize="10" 
                      fill="hsl(var(--foreground))" 
                      textAnchor="middle"
                      className="font-medium drop-shadow-md"
                    >
                      {node.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}
        <div className="absolute bottom-4 left-4 flex gap-3">
          {Object.entries(TYPE_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5 bg-background/80 backdrop-blur px-2 py-1 rounded text-xs border border-border">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
              <span className="capitalize">{type}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
