/**
 * Shared deterministic mock-math primitives for "bid vs actual" style figures.
 *
 * financials.tsx and analytics.tsx each independently derive spend/burn
 * numbers from the same real project fields (budget, progress, riskScore,
 * status) using a stable per-entity hash plus a seeded pseudo-random jitter.
 * Both pages used to redeclare identical hashString/seededFraction helpers,
 * which meant they could silently drift out of sync with each other. This is
 * the one place that math lives now - nothing here is fabricated with
 * Math.random(), every output is a pure function of its inputs.
 */

/** Stable string hash, used to seed deterministic mock figures. */
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
  return Math.abs(hash);
}

/** Deterministic pseudo-random float in [0, 1), seeded by two numbers. */
export function seededFraction(a: number, b: number): number {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
