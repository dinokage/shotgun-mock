import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause, SkipBack, SkipForward, ThumbsUp, ThumbsDown, MessageSquare, ChevronLeft, LogOut, CheckCircle2, PenTool, MousePointer2, Type, Square, ArrowUpRight } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { SHOTS, PROJECTS } from '@/data/mockData';
import { useLocation } from 'wouter';
import { useAuthStore } from '@/store/auth';
import { Badge } from '@/components/ui/badge';

type AnnotationTool = 'select' | 'pen' | 'arrow' | 'rectangle' | 'text';

const TOOLS: { id: AnnotationTool; icon: typeof MousePointer2; label: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select' },
  { id: 'pen', icon: PenTool, label: 'Draw freehand' },
  { id: 'arrow', icon: ArrowUpRight, label: 'Draw arrow' },
  { id: 'rectangle', icon: Square, label: 'Draw rectangle' },
  { id: 'text', icon: Type, label: 'Add text annotation' },
];

const COLORS = ['#10b981', '#ef4444', '#3b82f6', '#eab308', '#d946ef', '#ffffff'];

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
  startFrame?: number;
  endFrame?: number;
  fontFamily?: string;
  fontSize?: number;
  backgroundColor?: string;
}

export default function ClientReview() {
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [frame, setFrame] = useState(1);
  const [feedback, setFeedback] = useState('');
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { logout } = useAuthStore();
  
  const [tool, setTool] = useState<AnnotationTool>('select');
  const [color, setColor] = useState('#10b981');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentDrawStart, setCurrentDrawStart] = useState<{x: number, y: number} | null>(null);
  const [currentPoints, setCurrentPoints] = useState<{x: number, y: number}[]>([]);
  const [tempRect, setTempRect] = useState<{x: number, y: number, w: number, h: number} | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [draggingElement, setDraggingElement] = useState<{ id: string, type: 'video' | 'annotation', startX: number, startY: number, initialX: number, initialY: number } | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const maxFrames = 240;

  // Pending client reviews
  const pendingReviews = SHOTS.filter(s => s.status === 'client-review');
  const activeShot = activeReviewId ? SHOTS.find(s => s.id === activeReviewId) : null;
  const activeProject = activeShot ? PROJECTS.find(p => p.id === activeShot.projectId) : null;

  useEffect(() => {
    let animationFrameId: number;
    let lastTime = Date.now();
    
    if (isPlaying && activeReviewId) {
      if (videoRef.current) {
        videoRef.current.currentTime = (frame - 1) / 24;
        videoRef.current.play().catch(() => {});
      }

      const updateFrame = () => {
        const now = Date.now();
        const dt = now - lastTime;
        if (dt >= 1000 / 24) { 
          setFrame(f => {
            let nextF = f + 1;
            if (nextF > maxFrames) {
              nextF = 1; 
              if (videoRef.current) {
                videoRef.current.currentTime = 0;
                videoRef.current.play().catch(() => {});
              }
            }
            return nextF;
          });
          lastTime = now;
        }
        animationFrameId = requestAnimationFrame(updateFrame);
      };
      animationFrameId = requestAnimationFrame(updateFrame);
    } else {
      if (videoRef.current) videoRef.current.pause();
    }
    
    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, activeReviewId]);

  // Handle global mouse move for canvas dragging
  useEffect(() => {
    if (!draggingElement) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - draggingElement.startX;
      const dy = e.clientY - draggingElement.startY;
      
      if (draggingElement.type === 'annotation') {
        setAnnotations(prev => prev.map(a => {
          if (a.id !== draggingElement.id) return a;
          return { ...a, x: draggingElement.initialX + dx, y: draggingElement.initialY + dy };
        }));
      }
    };
    
    const handleMouseUp = () => setDraggingElement(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
  }, [draggingElement]);

  const handleSubmit = (action: 'approved' | 'changes_requested') => {
    toast({ 
      title: action === 'approved' ? 'Approved' : 'Changes Requested', 
      description: 'Feedback sent back to Manager to assign tasks to pipeline.' 
    });
    setTimeout(() => {
      setActiveReviewId(null);
    }, 1500);
  };

  const handleLogout = () => {
    logout();
    setLocation('/login');
  };

  // DASHBOARD VIEW
  if (!activeReviewId) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
        <header className="h-16 px-8 flex items-center justify-between border-b border-white/10 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-600 rounded flex items-center justify-center font-bold shadow-lg shadow-emerald-500/20">F</div>
            <span className="font-bold text-lg tracking-tight">Forge Client Portal</span>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10">Secure Connection</Badge>
            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" /> Exit
            </Button>
          </div>
        </header>

        <main className="p-8 max-w-7xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Pending Reviews</h1>
            <p className="text-zinc-400 mt-2 text-sm">Please review the following deliveries and provide your feedback or approval.</p>
          </div>

          {pendingReviews.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 border border-white/5 rounded-xl bg-zinc-900/20">
              <CheckCircle2 className="w-16 h-16 text-emerald-500 mb-4 opacity-50" />
              <h3 className="text-xl font-semibold">All Caught Up!</h3>
              <p className="text-zinc-500">There are no pending reviews at this time.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pendingReviews.map(shot => {
                const project = PROJECTS.find(p => p.id === shot.projectId);
                return (
                  <div key={shot.id} className="group bg-zinc-900 border border-white/10 rounded-xl overflow-hidden hover:border-emerald-500/50 hover:shadow-[0_0_20px_rgba(16,185,129,0.15)] transition-all cursor-pointer flex flex-col" onClick={() => setActiveReviewId(shot.id)}>
                    <div className="relative aspect-video bg-zinc-800 overflow-hidden">
                      {shot.thumbnail ? (
                        <img src={shot.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                      ) : (
                        <div className="w-full h-full bg-zinc-800" />
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Play className="w-12 h-12 text-white drop-shadow-md" />
                      </div>
                    </div>
                    <div className="p-5 flex-1 flex flex-col">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-semibold text-lg">{shot.name}</div>
                          <div className="text-sm text-zinc-400">{project?.name}</div>
                        </div>
                        <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20">Awaiting Review</Badge>
                      </div>
                      <div className="mt-auto pt-4 flex items-center justify-between text-xs text-zinc-500 border-t border-white/5">
                        <span>{shot.usdVersion || 'v003.usd'}</span>
                        <span>Delivered Today</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    );
  }

  // PLAYER VIEW
  return (
    <div className="flex flex-col h-screen bg-black text-white overflow-hidden font-sans animate-in fade-in">
      <div className="h-16 px-6 flex items-center justify-between border-b border-white/10 shrink-0 bg-zinc-950">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="hover:bg-white/10" onClick={() => { setActiveReviewId(null); setIsPlaying(false); }}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="w-8 h-8 bg-emerald-600 rounded flex items-center justify-center font-bold">F</div>
          <div>
            <div className="font-semibold text-lg">{activeProject?.name} - {activeShot?.name}</div>
            <div className="text-xs text-white/50">External Client Review • Secure</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-white/50">Viewing {activeShot?.usdVersion || 'v003.usd'}</span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main Player */}
        <div className="flex-1 relative flex flex-col items-center justify-center p-4">
          <div className="relative w-full max-w-5xl aspect-video bg-zinc-900 rounded-lg overflow-hidden shadow-2xl border border-white/5">
            <video 
              ref={videoRef}
              src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4"
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              muted
              playsInline
            />

            {/* Annotation SVG Overlay */}
            <svg className="annotation-svg absolute inset-0 z-10 pointer-events-none w-full h-full">
              <defs>
                {COLORS.map(c => (
                  <marker key={c} id={`arrowhead-${c.replace('#', '')}`} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill={c} />
                  </marker>
                ))}
              </defs>
              {annotations.filter(a => {
                if (a.type === 'text') return false;
                const start = a.startFrame ?? a.frame;
                const end = a.endFrame ?? a.frame + 60;
                return frame >= start && frame <= end;
              }).map(a => {
                const opacity = 1;
                if (a.type === 'rectangle' && a.w && a.h) {
                  return <rect key={a.id} x={a.x} y={a.y} width={a.w} height={a.h} fill={`${a.color}20`} stroke={a.color} strokeWidth={2} className="pointer-events-auto cursor-pointer" onClick={() => tool === 'select' && setAnnotations(prev => prev.filter(p => p.id !== a.id))} />;
                }
                if (a.type === 'pen' && a.points) {
                  const d = `M ${a.points.map(p => `${p.x},${p.y}`).join(' L ')}`;
                  return <path key={a.id} d={d} fill="none" stroke={a.color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="pointer-events-auto cursor-pointer hover:stroke-opacity-70" onClick={() => tool === 'select' && setAnnotations(prev => prev.filter(p => p.id !== a.id))} />;
                }
                if (a.type === 'arrow' && a.points && a.points.length === 2) {
                  return <line key={a.id} x1={a.points[0].x} y1={a.points[0].y} x2={a.points[1].x} y2={a.points[1].y} stroke={a.color} strokeWidth={3} markerEnd={`url(#arrowhead-${a.color.replace('#', '')})`} className="pointer-events-auto cursor-pointer" onClick={() => tool === 'select' && setAnnotations(prev => prev.filter(p => p.id !== a.id))} />;
                }
                return null;
              })}
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

            {/* Drawing Interaction Overlay */}
            {tool !== 'select' && (
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
                  }
                }}
                onClick={(e) => {
                  if (tool === 'text') {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    setAnnotations(prev => [...prev, { 
                      id: Date.now().toString(), 
                      frame, 
                      startFrame: frame, 
                      endFrame: Math.min(frame + 60, maxFrames), 
                      type: 'text', 
                      color, 
                      x, 
                      y, 
                      text: '',
                      fontFamily: 'font-sans',
                      fontSize: 14,
                      backgroundColor: 'transparent'
                    }]);
                    setSelectedAnnotationId(Date.now().toString());
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
                    setAnnotations(prev => [...prev, { id: Date.now().toString(), frame, startFrame: frame, endFrame: Math.min(frame + 60, maxFrames), type: 'rectangle', color, ...tempRect }]);
                    setSelectedAnnotationId(Date.now().toString());
                  } else if (tool === 'pen' && currentPoints.length > 1) {
                    setAnnotations(prev => [...prev, { id: Date.now().toString(), frame, startFrame: frame, endFrame: Math.min(frame + 60, maxFrames), type: 'pen', color, x: 0, y: 0, points: currentPoints }]);
                    setSelectedAnnotationId(Date.now().toString());
                  } else if (tool === 'arrow' && currentDrawStart && currentPoints.length > 1) {
                    setAnnotations(prev => [...prev, { id: Date.now().toString(), frame, startFrame: frame, endFrame: Math.min(frame + 60, maxFrames), type: 'arrow', color, x: 0, y: 0, points: [currentDrawStart, currentPoints[currentPoints.length - 1]] }]);
                    setSelectedAnnotationId(Date.now().toString());
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

            {/* Text Annotations Overlay */}
            <div className="absolute inset-0 z-30 pointer-events-none">
              {annotations.filter(a => {
                if (a.type !== 'text') return false;
                const start = a.startFrame ?? a.frame;
                const end = a.endFrame ?? a.frame + 60;
                return frame >= start && frame <= end;
              }).map(a => {
                return (
                <div 
                  key={a.id} 
                  className={`absolute pointer-events-auto rounded border-2 transition-colors ${selectedAnnotationId === a.id ? 'border-emerald-500 ring-2 ring-emerald-500/50' : 'border-transparent'} ${tool === 'select' ? 'cursor-move' : ''}`} 
                  style={{ left: a.x, top: a.y, backgroundColor: a.backgroundColor !== 'transparent' ? a.backgroundColor : undefined }}
                  onMouseDown={(e) => {
                    if (tool === 'select') {
                      e.stopPropagation();
                      setSelectedAnnotationId(a.id);
                      setDraggingElement({ id: a.id, type: 'annotation', startX: e.clientX, startY: e.clientY, initialX: a.x, initialY: a.y });
                    }
                  }}
                  onClick={() => setSelectedAnnotationId(a.id)}
                >
                  <input
                    type="text"
                    className={`text-annotation-input bg-transparent text-white font-medium focus:outline-none min-w-[120px] px-2 py-1 ${a.backgroundColor !== 'transparent' ? 'drop-shadow-none' : 'drop-shadow-md'}`}
                    style={{ color: a.color, fontFamily: a.fontFamily === 'font-sans' ? 'Inter, sans-serif' : a.fontFamily === 'font-serif' ? 'Georgia, serif' : 'monospace', fontSize: `${a.fontSize}px` }}
                    autoFocus
                    defaultValue={a.text}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                    onBlur={(e) => {
                      const val = e.target.value.trim();
                      if (!val) {
                        setAnnotations(prev => prev.filter(p => p.id !== a.id));
                        if (selectedAnnotationId === a.id) setSelectedAnnotationId(null);
                      } else {
                        setAnnotations(prev => prev.map(p => p.id === a.id ? { ...p, text: val } : p));
                      }
                    }}
                  />
                </div>
              )})}
            </div>

            {/* Play overlay if paused */}
            {!isPlaying && (
              <div 
                className="absolute inset-0 bg-black/20 flex items-center justify-center cursor-pointer hover:bg-black/40 transition-colors"
                onClick={() => setIsPlaying(true)}
              >
                <div className="w-20 h-20 rounded-full bg-emerald-600/90 flex items-center justify-center backdrop-blur shadow-lg">
                  <Play className="w-10 h-10 text-white ml-2" />
                </div>
              </div>
            )}
          </div>
          
          {/* Top Floating Toolbar */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-zinc-900/90 backdrop-blur border border-white/10 rounded-lg p-1.5 flex gap-3 z-40 shadow-xl">
            <div className="flex gap-1 items-center">
              {TOOLS.map(({ id, icon: Icon, label }) => (
                <Button
                  key={id}
                  size="icon"
                  variant={tool === id ? 'secondary' : 'ghost'}
                  className={`h-8 w-8 text-zinc-300 hover:text-white hover:bg-white/10 ${tool === id ? 'bg-white/10 text-emerald-400' : ''}`}
                  aria-label={label}
                  aria-pressed={tool === id}
                  onClick={() => setTool(id)}
                >
                  <Icon className="w-4 h-4" />
                </Button>
              ))}
            </div>
            <div className="w-px bg-white/10 my-1" />
            <div className="flex gap-1 items-center px-1">
              {COLORS.map(c => (
                <button
                  key={c}
                  className={`w-5 h-5 rounded-full border-2 transition-transform ${color === c ? 'scale-125 border-emerald-500 shadow-sm' : 'border-transparent hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
          
          {/* Scrubber */}
          <div className="w-full max-w-5xl mt-6 px-4 z-40">
            <input 
              type="range" 
              min="1" 
              max={maxFrames} 
              value={frame}
              onChange={(e) => { setIsPlaying(false); setFrame(parseInt(e.target.value)); }}
              className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <div className="flex justify-between text-xs text-white/50 mt-2 font-mono">
              <span>{String(frame).padStart(3, '0')}</span>
              <span>{maxFrames}</span>
            </div>
          </div>
          
          {/* Controls */}
          <div className="flex items-center gap-4 mt-4">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => { setIsPlaying(false); setFrame(Math.max(1, frame - 1)); }}>
              <SkipBack className="w-5 h-5" />
            </Button>
            <Button size="icon" className="bg-emerald-600 hover:bg-emerald-700 text-white w-12 h-12 rounded-full" onClick={() => setIsPlaying(!isPlaying)}>
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
            </Button>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => { setIsPlaying(false); setFrame(Math.min(maxFrames, frame + 1)); }}>
              <SkipForward className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Right Sidebar: Feedback */}
        <div className="w-96 bg-zinc-950 border-l border-white/10 flex flex-col">
          <div className="p-6 border-b border-white/10">
            <h2 className="text-xl font-bold mb-1">Feedback</h2>
            <p className="text-sm text-white/50">Provide notes for the studio on this version.</p>
          </div>
          
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            <div className="space-y-3">
              <label className="text-sm font-medium">Add a note at frame {frame}</label>
              <Textarea 
                placeholder="E.g. The lighting on the left looks a bit dark..."
                className="bg-zinc-900 border-white/10 text-white min-h-[120px] focus:ring-emerald-500"
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
              />
              <Button className="w-full bg-white/10 hover:bg-white/20 text-white">
                <MessageSquare className="w-4 h-4 mr-2" />
                Add Note
              </Button>
            </div>
          </div>
          
          <div className="p-6 border-t border-white/10 bg-zinc-900/50">
            <div className="text-sm text-center mb-4 text-zinc-400">Final Decision</div>
            <div className="flex gap-3">
              <Button 
                variant="outline"
                className="flex-1 border-rose-500/50 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                onClick={() => handleSubmit('changes_requested')}
              >
                <ThumbsDown className="w-4 h-4 mr-2" />
                Revise
              </Button>
              <Button 
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => handleSubmit('approved')}
              >
                <ThumbsUp className="w-4 h-4 mr-2" />
                Approve
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
