import { cn } from '@/lib/utils';

interface FrameScrubberProps {
  frame: number;
  maxFrames: number;
  onFrameChange: (frame: number) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Plain range-input frame scrubber shared by the client portal's player and
 * the internal review player's version-compare scrubber. Pages remain free
 * to render their own frame-counter labels around it.
 */
export function FrameScrubber({ frame, maxFrames, onFrameChange, disabled, className }: FrameScrubberProps) {
  return (
    <input
      type="range"
      min={1}
      max={maxFrames}
      value={frame}
      disabled={disabled}
      aria-label="Frame scrubber"
      onChange={(e) => onFrameChange(parseInt(e.target.value, 10))}
      className={cn('h-1 accent-primary disabled:opacity-40 disabled:cursor-not-allowed', className)}
    />
  );
}
