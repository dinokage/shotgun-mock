import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { Annotation, AnnotationTool, Point, SetAnnotations, SetSelectedAnnotationId, SetDraggingElement } from './types';

interface AnnotationCanvasProps {
  annotations: Annotation[];
  onAnnotationsChange: SetAnnotations;
  frame: number;
  maxFrames: number;
  tool: AnnotationTool;
  color: string;
  /** Palette used to render arrow-head markers (must include every color the
   * toolbar exposes, since each annotation's arrow references `#{color}`). */
  colors: string[];
  selectedAnnotationId: string | null;
  onSelectedAnnotationIdChange: SetSelectedAnnotationId;
  onDraggingElementChange: SetDraggingElement;
  /** Static onion-skin edge fade: dims shape annotations within a few frames of
   * either edge of their own visible window at a flat opacity. Internal-review-only. */
  onionSkin?: boolean;
  /**
   * Real motion-persistence "Ghosting": once a stroke/shape annotation's own
   * visible window (`startFrame`..`endFrame`) has ended, its silhouette keeps
   * fading in on the next few frames instead of vanishing outright — opacity
   * decays with distance past the window's end. Lets an animator see how a
   * drawn note persists across the frames right after it stops being "current".
   * Shape annotations only (pen/arrow/rectangle) — text notes are unaffected.
   * Available to both the internal review player and the client portal.
   */
  ghosting?: boolean;
  selectionRingClassName?: string;
  /**
   * Makes the whole layer genuinely non-interactive: no pointer-driven
   * drawing surface, no click-to-delete on shapes, no dragging/editing text
   * annotations — regardless of what `tool` is currently set to. Callers
   * that hide their own toolbar for a read-only viewer must also pass this
   * (and normally also force `tool` to `'select'`) so a stale non-select
   * tool value, or a direct click on an existing annotation, can't still
   * mutate annotations once the toolbar controlling them is gone.
   */
  readOnly?: boolean;
}

/** Opacity for a ghost trail frame, indexed by (frame - annotation.endFrame) - 1. */
const GHOST_TRAIL_OPACITIES = [0.42, 0.26, 0.14];

/**
 * The shared annotation drawing/rendering layer used by both the internal
 * review player and the client review portal: the SVG shape overlay (pen /
 * arrow / rectangle), the pointer-driven drawing interaction surface, and the
 * draggable text-annotation overlay. Both pages own their own video/canvas
 * chrome around this — this component only renders the three absolutely
 * positioned layers that sit on top of the frame.
 */
export function AnnotationCanvas({
  annotations,
  onAnnotationsChange,
  frame,
  maxFrames,
  tool,
  color,
  colors,
  selectedAnnotationId,
  onSelectedAnnotationIdChange,
  onDraggingElementChange,
  onionSkin = false,
  ghosting = false,
  selectionRingClassName = 'border-primary ring-2 ring-primary/50',
  readOnly = false,
}: AnnotationCanvasProps) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentDrawStart, setCurrentDrawStart] = useState<Point | null>(null);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [tempRect, setTempRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const drawMode = !readOnly && tool !== 'select';

  const resetDrawState = () => {
    setIsDrawing(false);
    setCurrentDrawStart(null);
    setCurrentPoints([]);
    setTempRect(null);
  };

  const addAnnotation = (partial: Omit<Annotation, 'id' | 'frame' | 'startFrame' | 'endFrame'>) => {
    const id = Date.now().toString();
    onAnnotationsChange((prev) => [
      ...prev,
      { id, frame, startFrame: frame, endFrame: Math.min(frame + 60, maxFrames), ...partial },
    ]);
    onSelectedAnnotationIdChange(id);
  };

  /** Renders one pen/arrow/rectangle annotation. Shared by the normal (in-window)
   * pass and the ghost-trail pass so both stay in sync visually. */
  const renderShape = (a: Annotation, opacity: number, interactive: boolean, keySuffix = '') => {
    const key = `${a.id}${keySuffix}`;
    const handleDelete = () => !readOnly && tool === 'select' && onAnnotationsChange((prev) => prev.filter((p) => p.id !== a.id));
    const pointerClassName = interactive && !readOnly ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none';

    if (a.type === 'rectangle' && a.w && a.h) {
      return (
        <rect
          key={key}
          x={a.x}
          y={a.y}
          width={a.w}
          height={a.h}
          fill={`${a.color}20`}
          stroke={a.color}
          strokeWidth={2}
          style={{ opacity }}
          className={pointerClassName}
          onClick={interactive ? handleDelete : undefined}
        />
      );
    }
    if (a.type === 'pen' && a.points) {
      const d = `M ${a.points.map((p) => `${p.x},${p.y}`).join(' L ')}`;
      return (
        <path
          key={key}
          d={d}
          fill="none"
          stroke={a.color}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity }}
          className={cn(pointerClassName, interactive && 'hover:stroke-opacity-70')}
          onClick={interactive ? handleDelete : undefined}
        />
      );
    }
    if (a.type === 'arrow' && a.points && a.points.length === 2) {
      return (
        <line
          key={key}
          x1={a.points[0].x}
          y1={a.points[0].y}
          x2={a.points[1].x}
          y2={a.points[1].y}
          stroke={a.color}
          strokeWidth={3}
          style={{ opacity }}
          markerEnd={`url(#arrowhead-${a.color.replace('#', '')})`}
          className={pointerClassName}
          onClick={interactive ? handleDelete : undefined}
        />
      );
    }
    return null;
  };

  return (
    <>
      {/* Shape overlay (pen / arrow / rectangle) */}
      <svg className="annotation-svg absolute inset-0 z-10 pointer-events-none w-full h-full">
        <defs>
          {colors.map((c) => (
            <marker key={c} id={`arrowhead-${c.replace('#', '')}`} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill={c} />
            </marker>
          ))}
        </defs>

        {/* Ghosting: shape annotations whose own window just ended keep fading
            in on the next few frames instead of vanishing, so a drawn note's
            recent presence stays visible while scrubbing forward. Mutually
            exclusive with the in-window pass below — when Ghosting is on, the
            main pass's post-end onion-skin extension is suppressed (see
            below) specifically so the two passes never render the same
            annotation on the same frame. */}
        {ghosting &&
          annotations
            .filter((a) => a.type !== 'text')
            .map((a) => {
              const end = a.endFrame ?? a.frame + 60;
              const distance = frame - end;
              if (distance < 1 || distance > GHOST_TRAIL_OPACITIES.length) return null;
              return renderShape(a, GHOST_TRAIL_OPACITIES[distance - 1], false, `-ghost-${distance}`);
            })}

        {annotations
          .filter((a) => {
            if (a.type === 'text') return false;
            const start = a.startFrame ?? a.frame;
            const end = a.endFrame ?? a.frame + 60;
            // Onion skin fades both edges of the window by 3 frames. When
            // Ghosting is also on, its post-end fade is owned entirely by the
            // ghost-trail pass above (with its own opacity curve) — extending
            // onion skin's flat post-end fade here too would render the same
            // shape twice on frames (end, end+3].
            const postEnd = onionSkin && !ghosting ? end + 3 : end;
            return onionSkin ? frame >= start - 3 && frame <= postEnd : frame >= start && frame <= end;
          })
          .map((a) => {
            const start = a.startFrame ?? a.frame;
            const end = a.endFrame ?? a.frame + 60;
            const isMainFrame = frame >= start && frame <= end;
            const opacity = isMainFrame ? 1 : 0.2;
            return renderShape(a, opacity, true);
          })}

        {/* Temp (in-progress) drawing preview */}
        {isDrawing && tool === 'pen' && currentPoints.length > 0 && (
          <path d={`M ${currentPoints.map((p) => `${p.x},${p.y}`).join(' L ')}`} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        )}
        {isDrawing && tool === 'arrow' && currentDrawStart && currentPoints.length > 0 && (
          <line
            x1={currentDrawStart.x}
            y1={currentDrawStart.y}
            x2={currentPoints[currentPoints.length - 1].x}
            y2={currentPoints[currentPoints.length - 1].y}
            stroke={color}
            strokeWidth={3}
            markerEnd={`url(#arrowhead-${color.replace('#', '')})`}
          />
        )}
        {tempRect && <rect x={tempRect.x} y={tempRect.y} width={tempRect.w} height={tempRect.h} fill={`${color}20`} stroke={color} strokeWidth={2} />}
      </svg>

      {/* Pointer-driven drawing interaction surface */}
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
              addAnnotation({ type: 'text', color, x, y, text: '', fontFamily: 'font-sans', fontSize: 14, backgroundColor: 'transparent' });
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
              setCurrentPoints((prev) => [...prev, { x, y }]);
            }
          }}
          onMouseUp={() => {
            if (tool === 'rectangle' && tempRect && tempRect.w > 5) {
              addAnnotation({ type: 'rectangle', color, ...tempRect });
            } else if (tool === 'pen' && currentPoints.length > 1) {
              addAnnotation({ type: 'pen', color, x: 0, y: 0, points: currentPoints });
            } else if (tool === 'arrow' && currentDrawStart && currentPoints.length > 1) {
              addAnnotation({ type: 'arrow', color, x: 0, y: 0, points: [currentDrawStart, currentPoints[currentPoints.length - 1]] });
            }
            resetDrawState();
          }}
          onMouseLeave={resetDrawState}
        />
      )}

      {/* Text annotations overlay */}
      <div className="absolute inset-0 z-30 pointer-events-none">
        {annotations
          .filter((a) => {
            if (a.type !== 'text') return false;
            const start = a.startFrame ?? a.frame;
            const end = a.endFrame ?? a.frame + 60;
            return onionSkin ? frame >= start - 3 && frame <= end + 3 : frame >= start && frame <= end;
          })
          .map((a) => {
            const start = a.startFrame ?? a.frame;
            const end = a.endFrame ?? a.frame + 60;
            const isMainFrame = frame >= start && frame <= end;
            const opacity = isMainFrame ? 1 : 0.2;

            return (
              <div
                key={a.id}
                className={cn(
                  'absolute rounded border-2 transition-colors',
                  readOnly ? 'pointer-events-none' : 'pointer-events-auto',
                  selectedAnnotationId === a.id ? selectionRingClassName : 'border-transparent',
                  tool === 'select' && !readOnly && 'cursor-move',
                )}
                style={{ left: a.x, top: a.y, opacity, backgroundColor: a.backgroundColor !== 'transparent' ? a.backgroundColor : undefined }}
                onMouseDown={(e) => {
                  if (readOnly) return;
                  if (tool === 'select') {
                    e.stopPropagation();
                    onSelectedAnnotationIdChange(a.id);
                    onDraggingElementChange({ id: a.id, type: 'annotation', startX: e.clientX, startY: e.clientY, initialX: a.x, initialY: a.y });
                  }
                }}
                onClick={() => !readOnly && onSelectedAnnotationIdChange(a.id)}
              >
                <input
                  type="text"
                  // Marker hook for handleScreenshot's querySelectorAll (see
                  // src/pages/review.tsx). Deliberately a data-attribute, not
                  // a plain class name: a class like `text-annotation-input`
                  // gets misread by tailwind-merge as a conflicting `text-*`
                  // utility and silently dropped from the final className,
                  // which made these inputs invisible to the selector.
                  data-annotation-marker="text"
                  className={cn(
                    'bg-transparent text-white font-medium focus:outline-none min-w-[120px] px-2 py-1',
                    a.backgroundColor !== 'transparent' ? 'drop-shadow-none' : 'drop-shadow-md',
                  )}
                  style={{
                    color: a.color,
                    fontFamily: a.fontFamily === 'font-sans' ? 'Inter, sans-serif' : a.fontFamily === 'font-serif' ? 'Georgia, serif' : 'monospace',
                    fontSize: `${a.fontSize}px`,
                  }}
                  readOnly={readOnly}
                  autoFocus={!readOnly}
                  defaultValue={a.text}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                  onBlur={(e) => {
                    if (readOnly) return;
                    const val = e.target.value.trim();
                    if (!val) {
                      onAnnotationsChange((prev) => prev.filter((p) => p.id !== a.id));
                      if (selectedAnnotationId === a.id) onSelectedAnnotationIdChange(null);
                    } else {
                      onAnnotationsChange((prev) => prev.map((p) => (p.id === a.id ? { ...p, text: val } : p)));
                    }
                  }}
                />
              </div>
            );
          })}
      </div>
    </>
  );
}
