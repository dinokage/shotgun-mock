import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { USERS } from '@/data/mockData';
import { Play, Pause, SkipBack, SkipForward, Volume2, PenTool, MousePointer2, Type, Square, ArrowUpRight, CheckCircle2, MessageSquare, XCircle, ChevronLeft, Circle, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

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
  startFrame?: number;
  endFrame?: number;
  fontFamily?: string;
  fontSize?: number;
  backgroundColor?: string;
}

const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#d946ef', '#ffffff'];

export default function Review() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [frame, setFrame] = useState(1);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [videoSrc, setVideoSrc] = useState('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  
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

  // Play/pause video natively
  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.play().catch(e => console.log('Video playback error:', e));
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying]);

  // Sync frame to video while playing (Video is the source of truth)
  useEffect(() => {
    if (!isPlaying) return;
    let animationFrameId: number;
    const updateFrame = () => {
      if (videoRef.current) {
        let currentF = Math.floor(videoRef.current.currentTime * 24) + 1;
        if (currentF >= maxFrames) {
          setIsPlaying(false);
          videoRef.current.currentTime = 0;
          currentF = 1;
        }
        setFrame(currentF);
      }
      animationFrameId = requestAnimationFrame(updateFrame);
    };
    animationFrameId = requestAnimationFrame(updateFrame);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, maxFrames]);

  // Sync video to frame when scrubbing/paused (UI is the source of truth)
  useEffect(() => {
    if (!isPlaying && videoRef.current) {
      videoRef.current.currentTime = (frame - 1) / 24;
    }
  }, [frame, isPlaying]);

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
              <div className="flex gap-1 items-center">
                <input 
                  type="file" 
                  accept="video/*" 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setVideoSrc(URL.createObjectURL(file));
                      setFrame(1);
                      toast({ title: 'Video Loaded', description: file.name });
                    }
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  title="Upload Demo Video"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4" />
                </Button>
                <div className="w-px h-5 bg-border mx-1" />
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
              <video 
                ref={videoRef}
                src={videoSrc}
                className="absolute inset-0 w-full h-full object-cover"
                muted
                playsInline
              />
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
                {annotations.filter(a => {
                  if (a.type === 'text') {
                    const start = a.startFrame ?? a.frame;
                    const end = a.endFrame ?? a.frame + 60;
                    return frame >= start && frame <= end;
                  }
                  return Math.abs(a.frame - frame) < 3;
                }).map(a => {
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

              {/* Text Annotations Overlay */}
              <div className="absolute inset-0 z-30 pointer-events-none">
                {annotations.filter(a => {
                  if (a.type !== 'text') return false;
                  const start = a.startFrame ?? a.frame;
                  const end = a.endFrame ?? a.frame + 60;
                  return frame >= start && frame <= end;
                }).map(a => (
                  <div 
                    key={a.id} 
                    className={`absolute pointer-events-auto rounded border-2 transition-colors ${selectedAnnotationId === a.id ? 'border-primary ring-2 ring-primary/50' : 'border-transparent'}`} 
                    style={{ left: a.x, top: a.y, backgroundColor: a.backgroundColor !== 'transparent' ? a.backgroundColor : undefined }}
                    onClick={() => setSelectedAnnotationId(a.id)}
                  >
                    <input
                      type="text"
                      className={`bg-transparent text-white font-medium focus:outline-none min-w-[120px] px-2 py-1 ${a.backgroundColor !== 'transparent' ? 'drop-shadow-none' : 'drop-shadow-md'}`}
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
                ))}
              </div>
            </div>
          </div>

          <div className="h-48 bg-card border-t border-border flex flex-col shrink-0">
            {/* Timeline Tools */}
            <div className="h-10 border-b border-border flex items-center px-4 gap-4">
              <Button size="icon" variant="ghost" className="h-6 w-6" aria-label={isPlaying ? 'Pause' : 'Play'} onClick={() => setIsPlaying(!isPlaying)}>
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>
              <span className="text-xs font-mono">{String(frame).padStart(3, '0')} / {maxFrames}</span>
            </div>
            {/* Timeline Tracks */}
            <div className="flex-1 overflow-y-auto relative p-2 space-y-1 bg-muted/10 cursor-pointer" onMouseDown={(e) => {
                 const rect = e.currentTarget.getBoundingClientRect();
                 const x = e.clientX - rect.left;
                 const newFrame = Math.max(1, Math.min(maxFrames, Math.floor((x / rect.width) * maxFrames)));
                 setFrame(newFrame);
               }}>
               {/* Video Track 1 */}
               <div className="flex h-8 w-full bg-muted/20 rounded relative">
                 <div className="absolute left-0 w-full h-full bg-blue-500/20 border border-blue-500/50 rounded flex items-center px-2 text-[10px] text-blue-500 font-medium overflow-hidden">
                   Main Sequence (V1)
                 </div>
               </div>
               {/* Video Track 2 (Mock) */}
               <div className="flex h-8 w-full bg-muted/20 rounded relative">
                 <div className="absolute left-[10%] w-[40%] h-full bg-purple-500/20 border border-purple-500/50 rounded flex items-center px-2 text-[10px] text-purple-500 font-medium overflow-hidden">
                   B-Roll Clip.mp4 (V2)
                 </div>
               </div>
               {/* Audio Track 1 (Mock) */}
               <div className="flex h-8 w-full bg-muted/20 rounded relative">
                 <div className="absolute left-0 w-[80%] h-full bg-emerald-500/20 border border-emerald-500/50 rounded flex items-center px-2 text-[10px] text-emerald-500 font-medium overflow-hidden">
                   VO_Track_01.wav (A1)
                 </div>
               </div>
               {/* Annotations Track */}
               <div className="flex h-8 w-full bg-muted/20 rounded relative">
                  {annotations.filter(a => a.type === 'text').map(a => {
                     const start = a.startFrame ?? a.frame;
                     const end = a.endFrame ?? Math.min(maxFrames, a.frame + 60);
                     const left = (start / maxFrames) * 100;
                     const width = ((end - start) / maxFrames) * 100;
                     return (
                        <div 
                          key={a.id} 
                          className={`absolute h-full rounded cursor-pointer transition-colors overflow-hidden flex items-center ${selectedAnnotationId === a.id ? 'bg-amber-500/50 border-2 border-amber-500' : 'bg-amber-500/30 border border-amber-500/50 hover:bg-amber-500/40'}`} 
                          style={{ left: `${left}%`, width: `${width}%` }} 
                          onClick={(e) => { e.stopPropagation(); setSelectedAnnotationId(a.id); }}
                        >
                           <span className="text-[10px] font-medium text-amber-500 px-1 truncate">{a.text || 'Text Box'}</span>
                        </div>
                     )
                  })}
               </div>

               {/* Playhead */}
               <div className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-10 pointer-events-none" style={{ left: `${(frame / maxFrames) * 100}%` }}>
                  <div className="absolute top-0 -translate-x-1/2 w-3 h-3 rotate-45 bg-red-500" />
               </div>
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

        {/* Right: Comments & Properties */}
        <div className="w-80 bg-card border-l border-border flex flex-col shrink-0">
          <Tabs defaultValue="comments" className="flex-1 flex flex-col h-full">
            <div className="p-4 border-b border-border bg-muted/10 shrink-0">
              <TabsList className="w-full">
                <TabsTrigger value="comments" className="flex-1">Comments</TabsTrigger>
                <TabsTrigger value="properties" className="flex-1">Properties</TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="comments" className="flex-1 flex flex-col m-0 h-full overflow-hidden data-[state=inactive]:hidden">
              <div className="p-4 border-b border-border bg-muted/20 shrink-0">
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
                <div className="p-4 border-t border-border bg-card shrink-0">
                  <textarea
                    className="w-full h-24 bg-muted/50 border border-border rounded-md p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary mb-2"
                    placeholder="Add a comment... (Press Enter to submit)"
                    aria-label="Add a comment"
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (commentDraft.trim()) handleSubmitComment();
                      }
                    }}
                  />
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => toast({ description: `Frame ${frame} stamped.` })}>
                      Stamp F{frame}
                    </Button>
                    <Button size="sm" className="flex-1" disabled={!commentDraft.trim()} onClick={handleSubmitComment}>Submit</Button>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="properties" className="flex-1 overflow-y-auto p-4 m-0 space-y-6 data-[state=inactive]:hidden">
              {!selectedAnnotationId ? (
                <div className="text-sm text-muted-foreground text-center mt-10">Select an annotation on the timeline to edit properties.</div>
              ) : (
                (() => {
                  const ann = annotations.find(a => a.id === selectedAnnotationId);
                  if (!ann || ann.type !== 'text') return <div className="text-sm text-muted-foreground text-center mt-10">Select a text annotation on the timeline.</div>;
                  return (
                    <div className="space-y-4">
                      <div>
                        <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Text Content</Label>
                        <input type="text" className="w-full bg-muted/50 border border-border rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary outline-none" value={ann.text || ''} onChange={(e) => setAnnotations(prev => prev.map(p => p.id === ann.id ? { ...p, text: e.target.value } : p))} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                           <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Start Frame</Label>
                           <input type="number" min={1} max={maxFrames} className="w-full bg-muted/50 border border-border rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary outline-none" value={ann.startFrame ?? ann.frame} onChange={(e) => setAnnotations(prev => prev.map(p => p.id === ann.id ? { ...p, startFrame: parseInt(e.target.value) } : p))} />
                        </div>
                        <div>
                           <Label className="text-xs font-semibold text-muted-foreground mb-1 block">End Frame</Label>
                           <input type="number" min={1} max={maxFrames} className="w-full bg-muted/50 border border-border rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary outline-none" value={ann.endFrame ?? Math.min(maxFrames, ann.frame + 60)} onChange={(e) => setAnnotations(prev => prev.map(p => p.id === ann.id ? { ...p, endFrame: parseInt(e.target.value) } : p))} />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Font Family</Label>
                        <Select value={ann.fontFamily || 'font-sans'} onValueChange={(v) => setAnnotations(prev => prev.map(p => p.id === ann.id ? { ...p, fontFamily: v } : p))}>
                          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="font-sans">Sans-serif</SelectItem>
                            <SelectItem value="font-serif">Serif</SelectItem>
                            <SelectItem value="font-mono">Monospace</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Font Size</Label>
                        <input type="number" className="w-full bg-muted/50 border border-border rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary outline-none" value={ann.fontSize || 14} onChange={(e) => setAnnotations(prev => prev.map(p => p.id === ann.id ? { ...p, fontSize: parseInt(e.target.value) } : p))} />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Text Color</Label>
                        <div className="flex gap-2 mt-1">
                          {COLORS.map(c => (
                            <button key={c} className={`w-6 h-6 rounded-full border-2 ${ann.color === c ? 'border-primary' : 'border-transparent'}`} style={{ backgroundColor: c }} onClick={() => setAnnotations(prev => prev.map(p => p.id === ann.id ? { ...p, color: c } : p))} />
                          ))}
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Background</Label>
                        <div className="flex gap-2 mt-1">
                           <button className={`w-6 h-6 rounded border-2 ${ann.backgroundColor === 'transparent' ? 'border-primary' : 'border-border'}`} style={{ backgroundImage: 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)', backgroundSize: '10px 10px', backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0' }} onClick={() => setAnnotations(prev => prev.map(p => p.id === ann.id ? { ...p, backgroundColor: 'transparent' } : p))} title="Transparent" />
                          {['#00000080', '#ffffff80', '#ef444480', '#3b82f680'].map(c => (
                            <button key={c} className={`w-6 h-6 rounded border-2 ${ann.backgroundColor === c ? 'border-primary' : 'border-transparent'}`} style={{ backgroundColor: c }} onClick={() => setAnnotations(prev => prev.map(p => p.id === ann.id ? { ...p, backgroundColor: c } : p))} />
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
