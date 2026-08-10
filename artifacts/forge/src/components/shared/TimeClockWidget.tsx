import React, { useState, useEffect } from 'react';
import { Clock, Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function TimeClockWidget() {
  const [isActive, setIsActive] = useState(true);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    
    if (isActive) {
      interval = setInterval(() => {
        setSeconds(s => s + 1);
      }, 1000);
    } else if (!isActive && seconds !== 0) {
      if (interval) clearInterval(interval);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, seconds]);

  const toggleTimer = () => {
    setIsActive(!isActive);
  };

  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted/50 border border-border shrink-0">
      <Clock className={cn("w-3.5 h-3.5 hidden sm:block", isActive ? "text-primary" : "text-muted-foreground")} />
      <span className={cn("text-[11px] font-medium tabular-nums", isActive ? "text-foreground" : "text-muted-foreground")}>
        {formatTime(seconds)}
      </span>
      <Badge variant="outline" className={cn("ml-0.5 h-4 px-1 text-[9px] hidden lg:inline-flex", isActive ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-muted text-muted-foreground")}>
        {isActive ? 'PUNCHED IN' : 'PAUSED'}
      </Badge>
      <Button 
        variant="ghost" 
        size="icon" 
        className="w-5 h-5 ml-0.5 hover:bg-transparent" 
        onClick={toggleTimer}
      >
        {isActive ? <Pause className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5" />}
      </Button>
    </div>
  );
}
