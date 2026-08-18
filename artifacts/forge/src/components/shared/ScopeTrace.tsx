import { useId, useMemo } from 'react';

interface ScopeTraceProps {
  /** Ordered numeric series, oldest -> newest. Fewer than 2 points renders nothing. */
  data: number[];
  className?: string;
  strokeWidth?: number;
  /** Wash a soft gradient under the trace — off by default, a bare line reads cleanest on small KPI cards. */
  area?: boolean;
}

/**
 * Renders a numeric series as the studio's signature "scope-trace" sparkline —
 * a thin, live-drawing waveform line — in place of a flat progress bar or
 * donut chart. Uses the `.scope-trace` / `@keyframes scope-draw` CSS already
 * defined in src/index.css, which relies on `pathLength={1}` to normalize
 * `stroke-dasharray`/`stroke-dashoffset` so the draw-in animation works
 * regardless of the path's actual geometry.
 *
 * Sized via a normalized 0-100 viewBox that fills its container — wrap it in
 * an element with an explicit height (e.g. `h-8 w-full`).
 */
export function ScopeTrace({ data, className = '', strokeWidth = 2, area = false }: ScopeTraceProps) {
  const gradientId = useId();

  const { linePath, areaPath } = useMemo(() => {
    if (!data || data.length < 2) return { linePath: '', areaPath: '' };

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    // Vertical padding so peaks/troughs don't clip against the stroke edge.
    const pad = 12;

    const points = data.map((v, i) => {
      const x = (i / (data.length - 1)) * 100;
      const norm = (v - min) / range;
      const y = pad + (1 - norm) * (100 - pad * 2);
      return [x, y] as const;
    });

    const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
    const areaP = `${line} L 100 100 L 0 100 Z`;
    return { linePath: line, areaPath: areaP };
  }, [data]);

  if (!linePath) return null;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={`w-full h-full overflow-visible ${className}`}
      aria-hidden="true"
    >
      {area && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" className="text-accent-scope" />
        </>
      )}
      <g className="scope-trace text-accent-scope">
        <path
          d={linePath}
          pathLength={1}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          className="stroke-current"
        />
      </g>
    </svg>
  );
}
