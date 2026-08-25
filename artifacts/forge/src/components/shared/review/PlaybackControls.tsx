import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PlaybackControlsProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  frame: number;
  maxFrames: number;
  /** Show the "003 / 240" frame counter inline next to the transport buttons. */
  showFrameLabel?: boolean;
  disabled?: boolean;
  className?: string;
  /** Applied to all three transport buttons (size, hover color, etc). */
  buttonClassName?: string;
  /** Extra classes applied only to the play/pause button (e.g. a filled circular style). */
  playButtonClassName?: string;
  /** Icon size classes for the skip-back / skip-forward icons. */
  iconClassName?: string;
  /** Icon size classes for the play/pause icon (falls back to `iconClassName`). */
  playIconClassName?: string;
  /** Nudges the play (not pause) triangle right so it looks centered inside a circular button. */
  centerPlayIcon?: boolean;
  frameLabelClassName?: string;
}

/**
 * Skip-back / play-pause / skip-forward transport, shared by the internal
 * review player's timeline bar + compare scrubber and the client portal's
 * player controls. Sizing/coloring is intentionally left to the caller since
 * the two apps place this control at very different scales.
 */
export function PlaybackControls({
  isPlaying,
  onTogglePlay,
  onStepBack,
  onStepForward,
  frame,
  maxFrames,
  showFrameLabel,
  disabled,
  className,
  buttonClassName,
  playButtonClassName,
  iconClassName = "w-4 h-4",
  playIconClassName,
  centerPlayIcon,
  frameLabelClassName,
}: PlaybackControlsProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        size="icon"
        variant="ghost"
        className={buttonClassName}
        disabled={disabled}
        aria-label="Previous Frame"
        onClick={onStepBack}
      >
        <SkipBack className={iconClassName} />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className={cn(buttonClassName, playButtonClassName)}
        disabled={disabled}
        aria-label={isPlaying ? "Pause" : "Play"}
        onClick={onTogglePlay}
      >
        {isPlaying ? (
          <Pause className={playIconClassName ?? iconClassName} />
        ) : (
          <Play
            className={cn(
              playIconClassName ?? iconClassName,
              centerPlayIcon && "ml-1",
            )}
          />
        )}
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className={buttonClassName}
        disabled={disabled}
        aria-label="Next Frame"
        onClick={onStepForward}
      >
        <SkipForward className={iconClassName} />
      </Button>
      {showFrameLabel && (
        <span
          className={cn(
            "text-xs font-mono text-muted-foreground ml-1",
            frameLabelClassName,
          )}
        >
          {String(frame).padStart(3, "0")} / {maxFrames}
        </span>
      )}
    </div>
  );
}
