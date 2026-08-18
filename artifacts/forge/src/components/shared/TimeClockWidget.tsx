import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { useAuthStore } from '@/store/auth';

export function TimeClockWidget() {
  const [seconds, setSeconds] = useState(0);
  const currentUser = useAuthStore((s) => s.currentUser);

  useEffect(() => {
    if (!currentUser) return;
    
    const storageKey = `forge-punch-in-time-${currentUser.id}`;
    let startTime = localStorage.getItem(storageKey);
    if (!startTime) {
      startTime = Date.now().toString();
      localStorage.setItem(storageKey, startTime);
    }

    const calculateElapsed = () => {
      const now = Date.now();
      const elapsed = Math.floor((now - parseInt(startTime!, 10)) / 1000);
      setSeconds(elapsed);
    };

    calculateElapsed();
    const interval = setInterval(calculateElapsed, 1000);
    
    return () => clearInterval(interval);
  }, [currentUser]);

  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted/50 border border-border shrink-0">
      <Clock className="w-3.5 h-3.5 hidden sm:block text-primary" />
      <span className="text-[11px] font-medium tabular-nums text-foreground">
        {formatTime(seconds)}
      </span>
      <Badge variant="outline" className="ml-0.5 h-4 px-1 text-[9px] hidden lg:inline-flex bg-green-500/10 text-green-500 border-green-500/20">
        PUNCHED IN
      </Badge>
    </div>
  );
}
