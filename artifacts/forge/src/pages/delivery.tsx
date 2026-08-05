import { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Maximize, Lock, Download, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

// Mock Client Data
const clientName = "Netflix Executive (M. Murdock)";
const ipAddress = "192.168.4.101";
const sessionExpires = new Date(Date.now() + 1000 * 60 * 60 * 2).toLocaleTimeString(); // 2 hours from now

export default function Delivery() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [frame, setFrame] = useState(1);
  const maxFrames = 240;
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Playback loop
  useEffect(() => {
    let animationFrameId: number;
    if (isPlaying) {
      const loop = () => {
        setFrame(f => {
          if (f >= maxFrames) {
            setIsPlaying(false);
            return f;
          }
          return f + 1;
        });
        animationFrameId = requestAnimationFrame(loop);
      };
      animationFrameId = requestAnimationFrame(loop);
    }
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, maxFrames]);

  // Sync video
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = frame / 24;
    }
  }, [frame]);

  const handleFullscreen = () => {
    if (containerRef.current) {
      if (document.fullscreenElement) document.exitFullscreen();
      else containerRef.current.requestFullscreen();
    }
  };

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col z-[100]">
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-6 bg-gradient-to-b from-black/80 to-transparent absolute top-0 left-0 right-0 z-50">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-green-500" />
          <h1 className="font-semibold text-lg tracking-tight shadow-black drop-shadow-md">Forge Secure Delivery</h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-xs text-white/50 text-right">
            <div>Session expires at {sessionExpires}</div>
            <div className="flex items-center gap-1 justify-end mt-1"><Lock className="w-3 h-3" /> End-to-end Encrypted</div>
          </div>
          <Button variant="outline" className="bg-white/10 border-white/20 hover:bg-white/20 text-white shadow-black drop-shadow-md">
            <Download className="w-4 h-4 mr-2" /> Download Proxy
          </Button>
        </div>
      </div>

      {/* Main Video Area */}
      <div ref={containerRef} className="flex-1 relative flex items-center justify-center bg-zinc-950 overflow-hidden">
        <div className="w-full max-w-7xl aspect-video relative group">
          <video 
            ref={videoRef}
            src="https://storage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4"
            className="w-full h-full object-contain pointer-events-none"
            muted
            playsInline
          />
          
          {/* HARD BURN-IN WATERMARK (CSS Overlay for prototype) */}
          <div className="absolute inset-0 pointer-events-none z-40 overflow-hidden opacity-30 mix-blend-overlay">
            <div className="absolute top-1/4 left-1/4 -rotate-12 whitespace-nowrap text-white font-mono text-4xl font-bold tracking-widest drop-shadow-[0_2px_2px_rgba(0,0,0,1)]">
              {clientName}
            </div>
            <div className="absolute top-2/4 left-1/3 -rotate-12 whitespace-nowrap text-white font-mono text-3xl font-bold tracking-widest drop-shadow-[0_2px_2px_rgba(0,0,0,1)]">
              IP: {ipAddress}
            </div>
            <div className="absolute bottom-1/4 right-1/4 -rotate-12 whitespace-nowrap text-white font-mono text-4xl font-bold tracking-widest drop-shadow-[0_2px_2px_rgba(0,0,0,1)]">
              DO NOT DISTRIBUTE
            </div>
          </div>
          
          <div className="absolute top-4 right-4 text-white font-mono text-xl z-40 drop-shadow-[0_2px_2px_rgba(0,0,0,1)] bg-black/50 px-2 py-1 rounded">
            {String(frame).padStart(4, '0')}
          </div>

          {/* Player Controls */}
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/90 to-transparent flex flex-col justify-end px-6 pb-4 opacity-0 group-hover:opacity-100 transition-opacity z-50">
            <div className="flex items-center gap-4 mb-2">
              <span className="text-xs font-mono w-10 text-right">{frame}</span>
              <Slider
                value={[frame]}
                min={1}
                max={maxFrames}
                step={1}
                onValueChange={(v) => {
                  setFrame(v[0]);
                  setIsPlaying(false);
                }}
                className="flex-1 cursor-pointer"
              />
              <span className="text-xs font-mono w-10">{maxFrames}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20" onClick={() => { setIsPlaying(false); setFrame(f => Math.max(1, f - 1)); }}>
                  <SkipBack className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-10 w-10 text-white hover:bg-white/20" onClick={() => setIsPlaying(!isPlaying)}>
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20" onClick={() => { setIsPlaying(false); setFrame(f => Math.min(maxFrames, f + 1)); }}>
                  <SkipForward className="w-4 h-4" />
                </Button>
              </div>
              
              <div className="text-sm font-medium tracking-wide">
                vfx_shot_042_v003.mov
              </div>
              
              <div>
                <Button size="icon" variant="ghost" className="text-white hover:bg-white/20" onClick={handleFullscreen}>
                  <Maximize className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
