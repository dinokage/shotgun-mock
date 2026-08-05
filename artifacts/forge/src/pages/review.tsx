import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { USERS } from '@/data/mockData';
import { Play, Pause, SkipBack, SkipForward, Volume2, PenTool, MousePointer2, Type, Square, ArrowUpRight, CheckCircle2, MessageSquare, XCircle, ChevronLeft, Circle, Upload, Camera, Film, Loader2, SplitSquareHorizontal, Layers, Mic, Square as SquareIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useHotkeys } from '@/hooks/use-hotkeys';
import { Link } from 'wouter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
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
  audioUrl?: string;
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

interface MediaClip {
  id: string;
  src: string;
  trackIndex: number;
  startFrame: number;
  endFrame: number;
  opacity: number;
  blendMode: 'normal' | 'multiply' | 'screen' | 'overlay' | 'difference';
  name: string;
  x: number;
  y: number;
  scale: number;
}

const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#d946ef', '#ffffff'];

export default function Review() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [frame, setFrame] = useState(1);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [videoClips, setVideoClips] = useState<MediaClip[]>([
    {
      id: 'base-v1',
      src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
      trackIndex: 0,
      startFrame: 1,
      endFrame: 240,
      opacity: 100,
      blendMode: 'normal',
      name: 'Main Sequence',
      x: 0,
      y: 0,
      scale: 1,
    }
  ]);
  const [tool, setTool] = useState<AnnotationTool>('select');
  const [viewerMode, setViewerMode] = useState(false);
  const [comments, setComments] = useState<Comment[]>([
    { id: 'c1', userIndex: 1, frame: 45, text: 'The rim light on the left side is blowing out a bit too much.' },
    { id: 'c2', userIndex: 0, frame: 112, text: 'Agreed. Also, can we add a bit more falloff to the shadow here?' },
  ]);
  const [commentDraft, setCommentDraft] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [color, setColor] = useState('#ef4444');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentDrawStart, setCurrentDrawStart] = useState<{x: number, y: number} | null>(null);
  const [currentPoints, setCurrentPoints] = useState<{x: number, y: number}[]>([]);
  const [tempRect, setTempRect] = useState<{x: number, y: number, w: number, h: number} | null>(null);
  const [resizing, setResizing] = useState<{ id: string, type: 'video' | 'annotation', edge: 'start' | 'end' } | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [draggingElement, setDraggingElement] = useState<{ id: string, type: 'video' | 'annotation', startX: number, startY: number, initialX: number, initialY: number } | null>(null);
  
  const [abWipe, setAbWipe] = useState(false);
  const [abWipePosition, setAbWipePosition] = useState(50);
  const [isDraggingWipe, setIsDraggingWipe] = useState(false);
  const [onionSkin, setOnionSkin] = useState(false);

  const { toast } = useToast();
  const maxFrames = 240;
  const drawMode = tool !== 'select';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const timelineRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcuts
  useHotkeys({
    'Space': () => setIsPlaying(p => !p),
    'ArrowLeft': () => { setIsPlaying(false); setFrame(f => Math.max(1, f - 1)); },
    'ArrowRight': () => { setIsPlaying(false); setFrame(f => Math.min(maxFrames, f + 1)); },
    'j': () => { setIsPlaying(false); setFrame(f => Math.max(1, f - 5)); },
    'k': () => setIsPlaying(p => !p),
    'l': () => { setIsPlaying(false); setFrame(f => Math.min(maxFrames, f + 5)); },
    '[': () => { /* trim in point placeholder */ },
    ']': () => { /* trim out point placeholder */ },
    'Escape': () => { setSelectedAnnotationId(null); setTool('select'); },
    'Delete': () => {
      if (selectedAnnotationId) {
        setAnnotations(prev => prev.filter(a => a.id !== selectedAnnotationId));
        setVideoClips(prev => prev.filter(v => v.id !== selectedAnnotationId || v.id === 'base-v1'));
        setSelectedAnnotationId(null);
      }
    },
    'Backspace': () => {
      if (selectedAnnotationId) {
        setAnnotations(prev => prev.filter(a => a.id !== selectedAnnotationId));
        setVideoClips(prev => prev.filter(v => v.id !== selectedAnnotationId || v.id === 'base-v1'));
        setSelectedAnnotationId(null);
      }
    },
    '1': () => setTool('select'),
    '2': () => setTool('pen'),
    '3': () => setTool('arrow'),
    '4': () => setTool('rectangle'),
    '5': () => setTool('text'),
  }, [selectedAnnotationId, maxFrames]);

  const handleScreenshot = async () => {
    try {
      const canvas = document.createElement('canvas');
      // Use the first video for dimensions
      const baseVideo = Array.from(videoRefs.current.values())[0];
      if (!baseVideo) return;
      canvas.width = baseVideo.videoWidth || 1920;
      canvas.height = baseVideo.videoHeight || 1080;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      // Draw all active videos
      videoClips.forEach(clip => {
        if (frame >= clip.startFrame && frame <= clip.endFrame) {
          const v = videoRefs.current.get(clip.id);
          if (v) {
            ctx.globalAlpha = clip.opacity / 100;
            ctx.globalCompositeOperation = clip.blendMode === 'normal' ? 'source-over' : clip.blendMode as GlobalCompositeOperation;
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          }
        }
      });
      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = 'source-over';
      
      // Draw text overlays
      const textOverlays = document.querySelectorAll('.text-annotation-input');
      const videoRect = baseVideo ? baseVideo.getBoundingClientRect() : { width: 1920, height: 1080, left: 0, top: 0 };
      const scaleX = canvas.width / videoRect.width;
      const scaleY = canvas.height / videoRect.height;

      textOverlays.forEach((input) => {
         const htmlInput = input as HTMLInputElement;
         const rect = htmlInput.getBoundingClientRect();
         const x = (rect.left - videoRect.left) * scaleX;
         const y = (rect.top - videoRect.top) * scaleY;
         ctx.font = `${(parseInt(htmlInput.style.fontSize) || 14) * scaleY}px ${htmlInput.style.fontFamily || 'sans-serif'}`;
         ctx.fillStyle = htmlInput.style.color || 'white';
         ctx.fillText(htmlInput.value, x + (4*scaleX), y + (16 * scaleY)); 
      });

      // Draw SVG overlay
      const svgElement = document.querySelector('.annotation-svg') as SVGSVGElement | null;
      
      const finalizeScreenshot = () => {
        canvas.toBlob(async (blob) => {
          if (blob) {
            try {
              await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
              toast({ title: 'Screenshot Saved', description: 'Frame with annotations copied!' });
            } catch (e) {
              toast({ title: 'Screenshot Failed', description: 'Could not access clipboard.', variant: 'destructive' });
            }
          }
        }, 'image/png');
      };

      if (svgElement) {
        const svgData = new XMLSerializer().serializeToString(svgElement);
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          finalizeScreenshot();
        };
        // Encode SVG properly for Image src
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
      } else {
        finalizeScreenshot();
      }
    } catch (err) {
      toast({ title: 'Screenshot Failed', description: 'Error creating screenshot.', variant: 'destructive' });
    }
  };
  
  const handleRender = () => {
    setIsRendering(true);
    setRenderProgress(0);
    
    // Simulate render loop
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 5 + 2;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setTimeout(() => {
          setIsRendering(false);
          toast({ title: 'Render Complete', description: 'Composite sequence exported successfully.' });
        }, 500);
      }
      setRenderProgress(progress);
    }, 100);
  };
  
  // Global keydown for Spacebar play/pause and Arrow keys for scrubbing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(p => !p);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        setIsPlaying(false);
        setFrame(f => Math.max(1, f - 1));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        setIsPlaying(false);
        setFrame(f => Math.min(maxFrames, f + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle global mouse move for timeline resizing
  useEffect(() => {
    if (!resizing) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const hoveredFrame = Math.max(1, Math.min(maxFrames, Math.floor((x / rect.width) * maxFrames)));
      
      if (resizing.type === 'video') {
        setVideoClips(prev => prev.map(v => {
          if (v.id !== resizing.id) return v;
          if (resizing.edge === 'start') return { ...v, startFrame: Math.min(hoveredFrame, v.endFrame - 1) };
          return { ...v, endFrame: Math.max(hoveredFrame, v.startFrame + 1) };
        }));
      } else {
        setAnnotations(prev => prev.map(a => {
          if (a.id !== resizing.id) return a;
          const currentStart = a.startFrame ?? a.frame;
          const currentEnd = a.endFrame ?? Math.min(maxFrames, a.frame + 60);
          if (resizing.edge === 'start') return { ...a, startFrame: Math.min(hoveredFrame, currentEnd - 1) };
          return { ...a, endFrame: Math.max(hoveredFrame, currentStart + 1) };
        }));
      }
    };
    
    const handleMouseUp = () => setResizing(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
  }, [resizing, maxFrames]);

  // Handle global mouse move for canvas dragging
  useEffect(() => {
    if (!draggingElement) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - draggingElement.startX;
      const dy = e.clientY - draggingElement.startY;
      
      if (draggingElement.type === 'video') {
        setVideoClips(prev => prev.map(v => {
          if (v.id !== draggingElement.id) return v;
          return { ...v, x: draggingElement.initialX + dx, y: draggingElement.initialY + dy };
        }));
      } else {
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

  // Handle global mouse move for A/B Wipe
  useEffect(() => {
    if (!isDraggingWipe) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      const videoContainer = document.getElementById('video-canvas-container');
      if (!videoContainer) return;
      const rect = videoContainer.getBoundingClientRect();
      let newPct = ((e.clientX - rect.left) / rect.width) * 100;
      newPct = Math.max(0, Math.min(100, newPct));
      setAbWipePosition(newPct);
    };
    
    const handleMouseUp = () => setIsDraggingWipe(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
  }, [isDraggingWipe]);

  // Video playback engine
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = Date.now();
    
    if (isPlaying) {
      // Start playing all active videos, synced to current frame
      videoRefs.current.forEach((v, id) => {
        const clip = videoClips.find(c => c.id === id);
        if (clip && frame >= clip.startFrame && frame <= clip.endFrame) {
          v.currentTime = (frame - clip.startFrame) / 24;
          v.play().catch(e => console.log('Playback error:', e));
        }
      });

      const updateFrame = () => {
        const now = Date.now();
        const dt = now - lastTime;
        if (dt >= 1000 / 24) { // 24 fps
          setFrame(f => {
            let nextF = f + 1;
            if (nextF > maxFrames) {
              nextF = 1; // loop back
              // Force seek on all videos
              videoRefs.current.forEach((v, id) => {
                const clip = videoClips.find(c => c.id === id);
                if (clip && nextF >= clip.startFrame && nextF <= clip.endFrame) {
                  v.currentTime = (nextF - clip.startFrame) / 24;
                  v.play().catch(() => {});
                }
              });
            } else {
              // Check if any video just entered its active span
              videoRefs.current.forEach((v, id) => {
                const clip = videoClips.find(c => c.id === id);
                if (clip && nextF === clip.startFrame) {
                  v.currentTime = 0;
                  v.play().catch(() => {});
                }
                if (clip && nextF === clip.endFrame + 1) {
                  v.pause();
                }
              });
            }
            return nextF;
          });
          lastTime = now;
        }
        animationFrameId = requestAnimationFrame(updateFrame);
      };
      animationFrameId = requestAnimationFrame(updateFrame);
    } else {
      // Pause all videos
      videoRefs.current.forEach(v => v.pause());
    }
    
    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, videoClips]); // Don't add frame, it relies on functional state updates to avoid restarting loop

  // Sync videos to frame when scrubbing (paused)
  useEffect(() => {
    if (!isPlaying) {
      videoRefs.current.forEach((v, id) => {
        const clip = videoClips.find(c => c.id === id);
        if (clip && frame >= clip.startFrame && frame <= clip.endFrame) {
          v.currentTime = (frame - clip.startFrame) / 24;
        }
      });
    }
  }, [frame, isPlaying, videoClips]);

  const handleAction = (action: string) => {
    toast({ title: action, description: 'Action recorded.' });
  };

  const handleSubmitComment = (audioUrl?: string) => {
    const text = commentDraft.trim();
    if (!text && !audioUrl) return;
    setComments(prev => [...prev, { id: `c${prev.length + 1}`, userIndex: 0, frame, text, audioUrl }]);
    setCommentDraft('');
    toast({ description: audioUrl ? `Voice note added at frame ${frame}.` : `Comment added at frame ${frame}.` });
  };

  const toggleRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      // Simulate stopping recording and saving blob
      handleSubmitComment('mock-audio-blob:12345');
    } else {
      setIsRecording(true);
      toast({ title: 'Recording Started', description: 'Speak now. Click again to stop.' });
    }
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
                      const newId = `v${videoClips.length + 1}`;
                      setVideoClips(prev => [...prev, {
                        id: newId,
                        src: URL.createObjectURL(file),
                        trackIndex: prev.length,
                        startFrame: frame,
                        endFrame: Math.min(frame + 60, maxFrames),
                        opacity: 100,
                        blendMode: 'normal',
                        name: file.name,
                        x: 0,
                        y: 0,
                        scale: 1
                      }]);
                      toast({ title: 'Video Added', description: `Track ${videoClips.length + 1} added.` });
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
              <div className="w-px h-6 bg-border mx-2" />
              <Button variant="ghost" size="icon" onClick={() => setAbWipe(!abWipe)} title="Toggle A/B Wipe" className={abWipe ? 'text-primary bg-primary/10' : ''}>
                <SplitSquareHorizontal className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setOnionSkin(!onionSkin)} title="Toggle Onion Skinning" className={onionSkin ? 'text-primary bg-primary/10' : ''}>
                <Layers className="w-4 h-4" />
              </Button>
              <div className="w-px h-6 bg-border mx-2" />
              <Button variant="ghost" size="icon" onClick={handleScreenshot} title="Copy Screenshot to Clipboard">
                <Camera className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleRender} title="Export & Render Composition">
                <Film className="w-4 h-4" />
              </Button>
            </div>
          )}

          {isRendering && (
            <div className="absolute inset-0 z-50 bg-background/90 backdrop-blur-sm flex flex-col items-center justify-center">
              <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
              <div className="text-lg font-medium mb-2">Rendering Composition...</div>
              <div className="w-64 h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all duration-100 ease-linear" style={{ width: `${renderProgress}%` }} />
              </div>
              <div className="text-sm text-muted-foreground mt-2">{Math.round(renderProgress)}%</div>
            </div>
          )}

          <div className="flex-1 relative flex items-center justify-center">
            <div className="w-full aspect-video bg-muted/10 border border-border/20 shadow-2xl relative overflow-hidden">
              {videoClips.map(clip => {
                const isActive = frame >= clip.startFrame && frame <= clip.endFrame;
                return (
                  <ContextMenu key={clip.id}>
                    <ContextMenuTrigger asChild>
                      <video 
                        ref={(el) => {
                          if (el) videoRefs.current.set(clip.id, el);
                          else videoRefs.current.delete(clip.id);
                        }}
                        src={clip.src}
                        className={`absolute inset-0 w-full h-full object-contain ${isActive ? 'opacity-100' : 'opacity-0 hidden'} ${tool === 'select' ? 'cursor-move' : ''}`}
                        style={{ 
                          opacity: clip.opacity / 100, 
                          mixBlendMode: clip.blendMode,
                          pointerEvents: tool === 'select' ? 'auto' : 'none',
                          transform: `translate(${clip.x || 0}px, ${clip.y || 0}px) scale(${clip.scale || 1})`,
                          zIndex: selectedAnnotationId === clip.id ? 5 : 1,
                          clipPath: (abWipe && clip.id !== 'base-v1') ? `polygon(0 0, ${abWipePosition}% 0, ${abWipePosition}% 100%, 0 100%)` : undefined
                        }}
                        onMouseDown={(e) => {
                          if (tool === 'select' && e.button !== 2) {
                            e.stopPropagation();
                            setSelectedAnnotationId(clip.id);
                            setDraggingElement({ id: clip.id, type: 'video', startX: e.clientX, startY: e.clientY, initialX: clip.x || 0, initialY: clip.y || 0 });
                          }
                        }}
                        muted
                        playsInline
                      />
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-48 z-50">
                      <ContextMenuItem 
                        disabled={clip.id === 'base-v1'}
                        onClick={() => {
                          setVideoClips(prev => prev.filter(v => v.id !== clip.id));
                          if (selectedAnnotationId === clip.id) setSelectedAnnotationId(null);
                          toast({ title: 'Video Deleted', description: 'Clip removed from composition.' });
                        }}
                        className="text-red-500 focus:bg-red-500/10 focus:text-red-500"
                      >
                        Delete Video
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={handleRender}>
                        Merge & Render Composite
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                )
              })}
              
              {/* A/B Wipe Slider */}
              {abWipe && (
                <div 
                  className="absolute top-0 bottom-0 w-1 bg-primary z-40 cursor-ew-resize flex items-center justify-center shadow-[0_0_10px_rgba(0,0,0,0.5)]"
                  style={{ left: `${abWipePosition}%` }}
                  onMouseDown={(e) => { e.stopPropagation(); setIsDraggingWipe(true); }}
                >
                  <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-lg pointer-events-none">
                    <SplitSquareHorizontal className="w-3 h-3 text-primary-foreground" />
                  </div>
                </div>
              )}

              {/* Render Annotations for this frame */}
              <svg className="annotation-svg absolute inset-0 z-10 pointer-events-none w-full h-full">
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
                  if (a.type === 'text') return false;
                  const start = a.startFrame ?? a.frame;
                  const end = a.endFrame ?? a.frame + 60;
                  return onionSkin ? (frame >= start - 3 && frame <= end + 3) : (frame >= start && frame <= end);
                }).map(a => {
                  const start = a.startFrame ?? a.frame;
                  const end = a.endFrame ?? a.frame + 60;
                  const isMainFrame = frame >= start && frame <= end;
                  const opacity = isMainFrame ? 1 : 0.2;

                  if (a.type === 'rectangle' && a.w && a.h) {
                    return (
                      <rect key={a.id} x={a.x} y={a.y} width={a.w} height={a.h} fill={`${a.color}20`} stroke={a.color} strokeWidth={2} style={{ opacity }} className="pointer-events-auto cursor-pointer" onClick={() => tool === 'select' && setAnnotations(prev => prev.filter(p => p.id !== a.id))} />
                    );
                  }
                  if (a.type === 'pen' && a.points) {
                    const d = `M ${a.points.map(p => `${p.x},${p.y}`).join(' L ')}`;
                    return (
                      <path key={a.id} d={d} fill="none" stroke={a.color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" style={{ opacity }} className="pointer-events-auto cursor-pointer hover:stroke-opacity-70" onClick={() => tool === 'select' && setAnnotations(prev => prev.filter(p => p.id !== a.id))} />
                    );
                  }
                  if (a.type === 'arrow' && a.points && a.points.length === 2) {
                    return (
                      <line key={a.id} x1={a.points[0].x} y1={a.points[0].y} x2={a.points[1].x} y2={a.points[1].y} stroke={a.color} strokeWidth={3} style={{ opacity }} markerEnd={`url(#arrowhead-${a.color.replace('#', '')})`} className="pointer-events-auto cursor-pointer" onClick={() => tool === 'select' && setAnnotations(prev => prev.filter(p => p.id !== a.id))} />
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
                  return onionSkin ? (frame >= start - 3 && frame <= end + 3) : (frame >= start && frame <= end);
                }).map(a => {
                  const start = a.startFrame ?? a.frame;
                  const end = a.endFrame ?? a.frame + 60;
                  const isMainFrame = frame >= start && frame <= end;
                  const opacity = isMainFrame ? 1 : 0.2;

                  return (
                  <div 
                    key={a.id} 
                    className={`absolute pointer-events-auto rounded border-2 transition-colors ${selectedAnnotationId === a.id ? 'border-primary ring-2 ring-primary/50' : 'border-transparent'} ${tool === 'select' ? 'cursor-move' : ''}`} 
                    style={{ left: a.x, top: a.y, opacity, backgroundColor: a.backgroundColor !== 'transparent' ? a.backgroundColor : undefined }}
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
            </div>
          </div>

          <div className="h-48 bg-card border-t border-border flex flex-col shrink-0">
            {/* Timeline Tools */}
            <div className="h-10 border-b border-border flex items-center px-4 gap-4">
              <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="Previous Frame" onClick={() => { setIsPlaying(false); setFrame(f => Math.max(1, f - 1)); }}>
                <SkipBack className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" aria-label={isPlaying ? 'Pause' : 'Play'} onClick={() => setIsPlaying(!isPlaying)}>
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="Next Frame" onClick={() => { setIsPlaying(false); setFrame(f => Math.min(maxFrames, f + 1)); }}>
                <SkipForward className="w-4 h-4" />
              </Button>
              <span className="text-xs font-mono">{String(frame).padStart(3, '0')} / {maxFrames}</span>
            </div>
            {/* Timeline Tracks */}
            <div ref={timelineRef} className="flex-1 overflow-y-auto relative p-2 space-y-1 bg-muted/10 cursor-pointer" onMouseDown={(e) => {
                 if (resizing) return;
                 const rect = e.currentTarget.getBoundingClientRect();
                 const x = e.clientX - rect.left;
                 const newFrame = Math.max(1, Math.min(maxFrames, Math.floor((x / rect.width) * maxFrames)));
                 setFrame(newFrame);
               }}>
               {/* Video Tracks */}
               {videoClips.map((clip, index) => (
                 <div key={clip.id} className="flex h-8 w-full bg-muted/20 rounded relative">
                   <ContextMenu>
                     <ContextMenuTrigger asChild>
                       <div 
                         className={`absolute h-full ${selectedAnnotationId === clip.id ? 'border-2 border-primary ring-2 ring-primary/50' : 'border border-blue-500/50 hover:bg-blue-500/30'} bg-blue-500/20 rounded flex items-center px-2 text-[10px] text-blue-500 font-medium overflow-hidden group cursor-pointer`}
                         style={{ left: `${(clip.startFrame / maxFrames) * 100}%`, width: `${((clip.endFrame - clip.startFrame) / maxFrames) * 100}%` }}
                         onClick={(e) => { e.stopPropagation(); setSelectedAnnotationId(clip.id); }}
                       >
                         {clip.name} (V{index + 1})
                         <div className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize opacity-0 group-hover:opacity-100 bg-blue-500/50 hover:w-3 z-20" onMouseDown={(e) => { e.stopPropagation(); setResizing({ id: clip.id, type: 'video', edge: 'start' }); }} />
                         <div className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize opacity-0 group-hover:opacity-100 bg-blue-500/50 hover:w-3 z-20" onMouseDown={(e) => { e.stopPropagation(); setResizing({ id: clip.id, type: 'video', edge: 'end' }); }} />
                       </div>
                     </ContextMenuTrigger>
                     <ContextMenuContent className="w-48 z-50">
                       <ContextMenuItem 
                         disabled={clip.id === 'base-v1'} 
                         onClick={(e) => { e.stopPropagation(); setVideoClips(prev => prev.filter(v => v.id !== clip.id)); if (selectedAnnotationId === clip.id) setSelectedAnnotationId(null); toast({ title: 'Video Deleted', description: 'Clip removed.' }); }} 
                         className="text-red-500 focus:bg-red-500/10 focus:text-red-500"
                       >
                         Delete Video
                       </ContextMenuItem>
                       <ContextMenuSeparator />
                       <ContextMenuItem onClick={(e) => { e.stopPropagation(); handleRender(); }}>Merge & Render Composite</ContextMenuItem>
                     </ContextMenuContent>
                   </ContextMenu>
                 </div>
               ))}
               {/* Annotations Track */}
               <div className="flex h-16 w-full bg-muted/20 rounded relative">
                  {annotations.map(a => {
                     const start = a.startFrame ?? a.frame;
                     const end = a.endFrame ?? Math.min(maxFrames, a.frame + 60);
                     const left = (start / maxFrames) * 100;
                     const width = ((end - start) / maxFrames) * 100;

                     return (
                        <ContextMenu key={a.id}>
                          <ContextMenuTrigger asChild>
                            <div 
                              className={`absolute h-full rounded cursor-pointer transition-colors overflow-hidden flex items-center group ${selectedAnnotationId === a.id ? 'bg-primary/50 border-2' : 'bg-primary/30 border hover:bg-primary/40'}`} 
                              style={{ left: `${left}%`, width: `${width}%`, borderColor: a.color }} 
                              onClick={(e) => { e.stopPropagation(); setSelectedAnnotationId(a.id); }}
                            >
                               <span className={`text-[10px] font-medium px-1 truncate capitalize`} style={{ color: a.color }}>{a.text || a.type}</span>
                               <div className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize opacity-0 group-hover:opacity-100 bg-black/40 hover:w-3 z-20" onMouseDown={(e) => { e.stopPropagation(); setResizing({ id: a.id, type: 'annotation', edge: 'start' }); }} />
                               <div className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize opacity-0 group-hover:opacity-100 bg-black/40 hover:w-3 z-20" onMouseDown={(e) => { e.stopPropagation(); setResizing({ id: a.id, type: 'annotation', edge: 'end' }); }} />
                            </div>
                          </ContextMenuTrigger>
                          <ContextMenuContent className="w-48 z-50">
                            <ContextMenuItem 
                              onClick={(e) => { e.stopPropagation(); setAnnotations(prev => prev.filter(p => p.id !== a.id)); if (selectedAnnotationId === a.id) setSelectedAnnotationId(null); toast({ title: 'Annotation Deleted' }); }} 
                              className="text-red-500 focus:bg-red-500/10 focus:text-red-500"
                            >
                              Delete Annotation
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
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
                        {comment.text && <p className="text-sm text-muted-foreground">{comment.text}</p>}
                        {comment.audioUrl && (
                          <div className="mt-2 bg-primary/10 rounded-full h-8 flex items-center px-3 gap-2 w-48">
                            <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-primary/20 shrink-0 text-primary">
                              <Play className="w-3 h-3" />
                            </Button>
                            <div className="flex-1 flex items-center gap-0.5 h-3">
                              {/* Fake audio waveform */}
                              {[1, 2, 4, 3, 5, 2, 4, 1, 3, 2, 1, 4, 2].map((v, i) => (
                                <div key={i} className="w-1 bg-primary/60 rounded-full" style={{ height: `${v * 20}%` }} />
                              ))}
                            </div>
                            <span className="text-[10px] text-primary font-mono shrink-0">0:04</span>
                          </div>
                        )}
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
                  <div className="flex gap-2 relative">
                    <Button 
                      variant={isRecording ? 'destructive' : 'outline'} 
                      size="icon" 
                      className={`shrink-0 ${isRecording ? 'animate-pulse' : ''}`}
                      onClick={toggleRecording}
                      aria-label="Record Voice Note"
                    >
                      {isRecording ? <SquareIcon className="w-4 h-4 fill-current" /> : <Mic className="w-4 h-4" />}
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => toast({ description: `Frame ${frame} stamped.` })}>
                      Stamp F{frame}
                    </Button>
                    <Button size="sm" className="flex-1" disabled={!commentDraft.trim() && !isRecording} onClick={() => handleSubmitComment()}>Submit</Button>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="properties" className="flex-1 overflow-y-auto p-4 m-0 space-y-6 data-[state=inactive]:hidden">
              {!selectedAnnotationId ? (
                <div className="text-sm text-muted-foreground text-center mt-10">Select a track or annotation on the timeline to edit properties.</div>
              ) : (
                (() => {
                  const ann = annotations.find(a => a.id === selectedAnnotationId);
                  const clip = videoClips.find(v => v.id === selectedAnnotationId);
                  
                  if (clip) {
                    return (
                      <div className="space-y-4">
                        <div>
                          <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Track Name</Label>
                          <input type="text" className="w-full bg-muted/50 border border-border rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary outline-none" value={clip.name} onChange={(e) => setVideoClips(prev => prev.map(p => p.id === clip.id ? { ...p, name: e.target.value } : p))} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                             <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Start Frame</Label>
                             <input type="number" min={1} max={maxFrames} className="w-full bg-muted/50 border border-border rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary outline-none" value={clip.startFrame} onChange={(e) => setVideoClips(prev => prev.map(p => p.id === clip.id ? { ...p, startFrame: parseInt(e.target.value) } : p))} />
                          </div>
                          <div>
                             <Label className="text-xs font-semibold text-muted-foreground mb-1 block">End Frame</Label>
                             <input type="number" min={1} max={maxFrames} className="w-full bg-muted/50 border border-border rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary outline-none" value={clip.endFrame} onChange={(e) => setVideoClips(prev => prev.map(p => p.id === clip.id ? { ...p, endFrame: parseInt(e.target.value) } : p))} />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Opacity ({clip.opacity}%)</Label>
                          <input type="range" min="0" max="100" className="w-full accent-primary" value={clip.opacity} onChange={(e) => setVideoClips(prev => prev.map(p => p.id === clip.id ? { ...p, opacity: parseInt(e.target.value) } : p))} />
                        </div>
                        <div>
                          <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Blend Mode</Label>
                          <select className="w-full bg-muted/50 border border-border rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary outline-none" value={clip.blendMode} onChange={(e) => setVideoClips(prev => prev.map(p => p.id === clip.id ? { ...p, blendMode: e.target.value as any } : p))}>
                            <option value="normal">Normal</option>
                            <option value="multiply">Multiply</option>
                            <option value="screen">Screen</option>
                            <option value="overlay">Overlay</option>
                            <option value="difference">Difference</option>
                          </select>
                        </div>
                      </div>
                    )
                  }

                  if (!ann) return <div className="text-sm text-muted-foreground text-center mt-10">Select an item on the timeline.</div>;
                  return (
                    <div className="space-y-4">
                      {ann.type === 'text' && (
                        <div>
                          <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Text Content</Label>
                          <input type="text" className="w-full bg-muted/50 border border-border rounded p-2 text-sm mt-1 focus:ring-1 focus:ring-primary outline-none" value={ann.text || ''} onChange={(e) => setAnnotations(prev => prev.map(p => p.id === ann.id ? { ...p, text: e.target.value } : p))} />
                        </div>
                      )}
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
                      
                      {ann.type === 'text' && (
                        <>
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
                        </>
                      )}

                      <div>
                        <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Color</Label>
                        <div className="flex gap-2 mt-1">
                          {COLORS.map(c => (
                            <button key={c} className={`w-6 h-6 rounded-full border-2 ${ann.color === c ? 'border-primary' : 'border-transparent'}`} style={{ backgroundColor: c }} onClick={() => setAnnotations(prev => prev.map(p => p.id === ann.id ? { ...p, color: c } : p))} />
                          ))}
                        </div>
                      </div>
                      
                      {ann.type === 'text' && (
                        <div>
                          <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Background</Label>
                          <div className="flex gap-2 mt-1">
                             <button className={`w-6 h-6 rounded border-2 ${ann.backgroundColor === 'transparent' ? 'border-primary' : 'border-border'}`} style={{ backgroundImage: 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)', backgroundSize: '10px 10px', backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0' }} onClick={() => setAnnotations(prev => prev.map(p => p.id === ann.id ? { ...p, backgroundColor: 'transparent' } : p))} title="Transparent" />
                            {['#00000080', '#ffffff80', '#ef444480', '#3b82f680'].map(c => (
                              <button key={c} className={`w-6 h-6 rounded border-2 ${ann.backgroundColor === c ? 'border-primary' : 'border-transparent'}`} style={{ backgroundColor: c }} onClick={() => setAnnotations(prev => prev.map(p => p.id === ann.id ? { ...p, backgroundColor: c } : p))} />
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="pt-4 border-t border-border mt-4">
                         <Button variant="destructive" size="sm" className="w-full" onClick={() => {
                           setAnnotations(prev => prev.filter(p => p.id !== ann.id));
                           setSelectedAnnotationId(null);
                         }}>Delete Annotation</Button>
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
