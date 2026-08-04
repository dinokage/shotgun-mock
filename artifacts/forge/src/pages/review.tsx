import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { USERS } from '@/data/mockData';
import { Play, Pause, SkipBack, SkipForward, Volume2, PenTool, MousePointer2, Type, Square, ArrowUpRight, CheckCircle2, MessageSquare, XCircle, ChevronLeft, Circle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';

type AnnotationTool = 'select' | 'pen' | 'arrow' | 'rectangle' | 'text';

const TOOLS: { id: AnnotationTool; icon: typeof MousePointer2; label: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select' },
  { id: 'pen', icon: PenTool, label: 'Draw freehand' },
  { id: 'arrow', icon: ArrowUpRight, label: 'Draw arrow' },
  { id: 'rectangle', icon: Square, label: 'Draw rectangle' },
  { id: 'text', icon: Type, label: 'Add text annotation' },
];

interface Comment {
  id: string;
  userIndex: number;
  frame: number;
  text: string;
}

interface Annotation {
  id: string;
  frame: number;
  type: AnnotationTool;
  color: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  points?: {x: number, y: number}[];
  text?: string;
}

const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#d946ef', '#ffffff'];

export default function Review() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [frame, setFrame] = useState(1);
  const [tool, setTool] = useState<AnnotationTool>('select');
  const [viewerMode, setViewerMode] = useState(false);
  const [comments, setComments] = useState<Comment[]>([
    { id: 'c1', userIndex: 1, frame: 45, text: 'The rim light on the left side is blowing out a bit too much.' },
    { id: 'c2', userIndex: 0, frame: 112, text: 'Agreed. Also, can we add a bit more falloff to the shadow here?' },
  ]);
  const [commentDraft, setCommentDraft] = useState('');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [color, setColor] = useState(COLORS[0]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentDrawStart, setCurrentDrawStart] = useState<{x: number, y: number} | null>(null);
  const [currentPoints, setCurrentPoints] = useState<{x: number, y: number}[]>([]);
  const [tempRect, setTempRect] = useState<{x: number, y: number, w: number, h: number} | null>(null);
  
  const { toast } = useToast();
  const maxFrames = 240;
  const drawMode = tool !== 'select';

  // Global keydown for Spacebar play/pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      if (e.code === 'Space' && e.target instanceof Element && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setIsPlaying(p => !p);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Simple playback loop
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setFrame(f => (f >= maxFrames ? 1 : f + 1));
    }, 1000 / 24); // 24 fps
    return () => clearInterval(interval);
  }, [isPlaying]);

  const handleAction = (action: string) => {
    toast({ title: action, description: 'Action recorded.' });
  };

  const handleSubmitComment = () => {
    const text = commentDraft.trim();
    if (!text) return;
    setComments(prev => [...prev, { id: `c${prev.length + 1}`, userIndex: 0, frame, text }]);
    setCommentDraft('');
    toast({ description: `Comment added at frame ${frame}.` });
  };

  return (
    <div className="flex flex-col h-screen bg-background relative overflow-hidden">
      <div className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8 text-muted-foreground">
            <Link href="/projects/p1"><ChevronLeft className="w-5 h-5" /></Link>
          </Button>
          <div className="font-medium">FORGE REVIEW — SEQ_020_SH_040 v003</div>
        </div>
        <div className="flex items-center gap-4">
          {viewerMode && <div className="text-xs bg-blue-500/20 text-blue-500 px-2 py-1 rounded border border-blue-500/30">Viewer Mode</div>}
          <Button variant="outline" size="sm" onClick={() => setViewerMode(!viewerMode)}>
            {viewerMode ? 'Exit Viewer Mode' : 'Read-only Reviewer'}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Player */}
        <div className="flex-1 flex flex-col bg-black relative">
          {!viewerMode && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-card/80 backdrop-blur border border-border rounded-lg p-1.5 flex gap-3 z-30">
              <div className="flex gap-1">
                {TOOLS.map(({ id, icon: Icon, label }) => (
                  <Button
                    key={id}
                    size="icon"
                    variant={tool === id ? 'secondary' : 'ghost'}
                    className={`h-8 w-8 ${tool === id && id !== 'select' ? 'text-primary' : ''}`}
                    aria-label={label}
                    aria-pressed={tool === id}
                    onClick={() => setTool(id)}
                  >
                    <Icon className="w-4 h-4" />
                  </Button>
                ))}
              </div>
              <div className="w-px bg-border my-1" />
              <div className="flex gap-1 items-center px-1">
                {COLORS.map(c => (
                  <button
                    key={c}
                    className={`w-5 h-5 rounded-full border-2 transition-transform ${color === c ? 'scale-125 border-primary shadow-sm' : 'border-transparent hover:scale-110'}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 relative flex items-center justify-center">
            <div className="w-full aspect-video bg-muted/10 border border-border/20 shadow-2xl relative">
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/30 font-mono text-4xl">
                [VIDEO CONTENT]
              </div>
              {/* Render Annotations for this frame */}
              <svg className="absolute inset-0 z-10 pointer-events-none w-full h-full">
                <defs>
                  <marker id="arrowhead-red" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#ef4444" />
                  </marker>
                  {COLORS.map(c => (
                    <marker key={c} id={`arrowhead-${c.replace('#', '')}`} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                      <polygon points="0 0, 10 3.5, 0 7" fill={c} />
                    </marker>
                  ))}
                </defs>
                
                {annotations.filter(a => Math.abs(a.frame - frame) < 3).map(a => {
                  if (a.type === 'rectangle' && a.w && a.h) {
                    return (
                      <rect key={a.id} x={a.x} y={a.y} width={a.w} height={a.h} fill={`${a.color}20`} stroke={a.color} strokeWidth={2} className="pointer-events-auto cursor-pointer" onClick={() => tool === 'select' && setAnnotations(prev => prev.filter(p => p.id !== a.id))} />
                    );
                  }
                  if (a.type === 'pen' && a.points) {
                    const d = `M ${a.points.map(p => `${p.x},${p.y}`).join(' L ')}`;
                    return (
                      <path key={a.id} d={d} fill="none" stroke={a.color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="pointer-events-auto cursor-pointer hover:stroke-opacity-70" onClick={() => tool === 'select' && setAnnotations(prev => prev.filter(p => p.id !== a.id))} />
                    );
                  }
                  if (a.type === 'arrow' && a.points && a.points.length === 2) {
                    return (
                      <line key={a.id} x1={a.points[0].x} y1={a.points[0].y} x2={a.points[1].x} y2={a.points[1].y} stroke={a.color} strokeWidth={3} markerEnd={`url(#arrowhead-${a.color.replace('#', '')})`} className="pointer-events-auto cursor-pointer" onClick={() => tool === 'select' && setAnnotations(prev => prev.filter(p => p.id !== a.id))} />
                    );
                  }
                  return null;
                })}

                {/* Temp Drawing */}
                {isDrawing && tool === 'pen' && currentPoints.length > 0 && (
                   <path d={`M ${currentPoints.map(p => `${p.x},${p.y}`).join(' L ')}`} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                )}
                {isDrawing && tool === 'arrow' && currentDrawStart && currentPoints.length > 0 && (
                   <line x1={currentDrawStart.x} y1={currentDrawStart.y} x2={currentPoints[currentPoints.length - 1].x} y2={currentPoints[currentPoints.length - 1].y} stroke={color} strokeWidth={3} markerEnd={`url(#arrowhead-${color.replace('#', '')})`} />
                )}
                {tempRect && (
                  <rect x={tempRect.x} y={tempRect.y} width={tempRect.w} height={tempRect.h} fill={`${color}20`} stroke={color} strokeWidth={2} />
                )}
              </svg>

              {/* Text Annotations Overlay */}
              <div className="absolute inset-0 z-10 pointer-events-none">
                {annotations.filter(a => Math.abs(a.frame - frame) < 3 && a.type === 'text').map(a => (
                  <div key={a.id} className="absolute pointer-events-auto" style={{ left: a.x, top: a.y }}>
                    <input
                      type="text"
                      className="bg-black/50 text-white font-medium border border-white/20 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-white min-w-[120px]"
                      style={{ color: a.color }}
                      autoFocus
                      defaultValue={a.text}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAnnotations(prev => prev.map(p => p.id === a.id ? { ...p, text: val } : p));
                      }}
                      onBlur={(e) => {
                         if (!e.target.value.trim()) setAnnotations(prev => prev.filter(p => p.id !== a.id));
                      }}
                    />
                  </div>
                ))}
              </div>

              {drawMode && (
                <div 
                  className="absolute inset-0 cursor-crosshair z-20" 
                  onMouseDown={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    
                    if (tool === 'rectangle') {
                      setIsDrawing(true);
                      setCurrentDrawStart({ x, y });
                      setTempRect({ x, y, w: 0, h: 0 });
                    } else if (tool === 'pen' || tool === 'arrow') {
                      setIsDrawing(true);
                      setCurrentDrawStart({ x, y });
                      setCurrentPoints([{ x, y }]);
                    } else if (tool === 'text') {
                      setAnnotations(prev => [...prev, { id: Date.now().toString(), frame, type: 'text', color, x, y, text: '' }]);
                      setTool('select');
                    }
                  }}
                  onMouseMove={(e) => {
                    if (!isDrawing) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    
                    if (tool === 'rectangle' && currentDrawStart) {
                      const newX = Math.min(x, currentDrawStart.x);
                      const newY = Math.min(y, currentDrawStart.y);
                      const w = Math.abs(x - currentDrawStart.x);
                      const h = Math.abs(y - currentDrawStart.y);
                      setTempRect({ x: newX, y: newY, w, h });
                    } else if (tool === 'pen' || tool === 'arrow') {
                      setCurrentPoints(prev => [...prev, { x, y }]);
                    }
                  }}
                  onMouseUp={(e) => {
                    if (tool === 'rectangle' && tempRect && tempRect.w > 5) {
                      setAnnotations(prev => [...prev, { id: Date.now().toString(), frame, type: 'rectangle', color, ...tempRect }]);
                    } else if (tool === 'pen' && currentPoints.length > 1) {
                      setAnnotations(prev => [...prev, { id: Date.now().toString(), frame, type: 'pen', color, x: 0, y: 0, points: currentPoints }]);
                    } else if (tool === 'arrow' && currentDrawStart && currentPoints.length > 1) {
                      setAnnotations(prev => [...prev, { id: Date.now().toString(), frame, type: 'arrow', color, x: 0, y: 0, points: [currentDrawStart, currentPoints[currentPoints.length - 1]] }]);
                    }
                    setIsDrawing(false);
                    setCurrentDrawStart(null);
                    setCurrentPoints([]);
                    setTempRect(null);
                  }}
                  onMouseLeave={() => {
                    setIsDrawing(false);
                    setCurrentDrawStart(null);
                    setCurrentPoints([]);
                    setTempRect(null);
                  }}
                />
              )}
            </div>
          </div>

          <div className="h-16 bg-card border-t border-border flex items-center px-4 gap-4 shrink-0">
            <Button size="icon" variant="ghost" aria-label={isPlaying ? 'Pause' : 'Play'} onClick={() => setIsPlaying(!isPlaying)}>
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </Button>
            <div className="flex-1 flex items-center gap-4">
              <span className="text-xs font-mono w-16 text-right">{String(frame).padStart(3, '0')} / {maxFrames}</span>
              <Slider 
                value={[frame]} 
                max={maxFrames} 
                step={1} 
                onValueChange={(v) => setFrame(v[0])}
                className="flex-1"
              />
            </div>
            <div className="flex items-center gap-2 w-32">
              <Volume2 className="w-4 h-4 text-muted-foreground" />
              <Slider defaultValue={[80]} max={100} step={1} />
            </div>
          </div>

          {!viewerMode && (
            <div className="h-16 bg-muted/30 border-t border-border flex items-center justify-center gap-4 shrink-0 px-4">
              <Button className="bg-[#1E7A34] hover:bg-[#1E7A34]/90 text-white flex-1 max-w-xs" onClick={() => handleAction('Approved')}>
                <CheckCircle2 className="w-4 h-4 mr-2" /> Approve
              </Button>
              <Button className="bg-[#B5651D] hover:bg-[#B5651D]/90 text-white flex-1 max-w-xs" onClick={() => handleAction('Changes Requested')}>
                <MessageSquare className="w-4 h-4 mr-2" /> Request Changes
              </Button>
              <Button className="bg-[#A03030] hover:bg-[#A03030]/90 text-white flex-1 max-w-xs" onClick={() => handleAction('Rejected')}>
                <XCircle className="w-4 h-4 mr-2" /> Reject
              </Button>
            </div>
          )}
        </div>

        {/* Right: Comments */}
        <div className="w-80 bg-card border-l border-border flex flex-col shrink-0">
          <div className="p-4 border-b border-border bg-muted/20">
            <div className="text-xs font-semibold text-muted-foreground mb-2">APPROVAL CHAIN</div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-[#1E7A34]" /> Maya Chen <span className="text-xs text-muted-foreground ml-auto">Oct 1</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/50 border-t-primary animate-spin" /> 
                Aisha Diallo <span className="text-xs text-muted-foreground ml-auto">Pending</span>
              </div>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {comments.map(comment => {
              const user = USERS[comment.userIndex];
              return (
                <div className="flex gap-3" key={comment.id}>
                  <Avatar className="w-8 h-8"><AvatarImage src={user.avatar} /><AvatarFallback>{user.name.charAt(0)}</AvatarFallback></Avatar>
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="font-medium text-sm">{user.name}</span>
                      <button
                        type="button"
                        className="text-xs font-mono bg-primary/10 text-primary px-1 rounded hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`Jump to frame ${comment.frame}`}
                        onClick={() => setFrame(comment.frame)}
                      >
                        {String(comment.frame).padStart(3, '0')}
                      </button>
                    </div>
                    <p className="text-sm text-muted-foreground">{comment.text}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {!viewerMode && (
            <div className="p-4 border-t border-border bg-card">
              <textarea
                className="w-full h-24 bg-muted/50 border border-border rounded-md p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary mb-2"
                placeholder="Add a comment..."
                aria-label="Add a comment"
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
              />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => toast({ description: `Frame ${frame} stamped.` })}>
                  Stamp F{frame}
                </Button>
                <Button size="sm" className="flex-1" disabled={!commentDraft.trim()} onClick={handleSubmitComment}>Submit</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
