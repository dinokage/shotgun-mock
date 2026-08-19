/**
 * Deterministic "render preview" placeholder art.
 *
 * This mock has no real render/transcode pipeline behind it, so shot/version
 * thumbnails have nowhere to come from. Rather than leave review cards and
 * the player blank, we generate an abstract gradient + shape composition
 * seeded by `Version.thumbnailSeed` / `Shot.thumbnailSeed` — the same seed
 * always produces the same image, and different seeds produce visibly
 * different compositions, so a grid of review cards actually reads as
 * distinct deliverables rather than a wall of empty rectangles.
 *
 * Deliberately not photographic — it should read as a design choice (a
 * stand-in "preview" frame), not as an attempt to fake real footage.
 */

/** Small, fast, deterministic PRNG (mulberry32) — same seed, same sequence. */
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hsl(h: number, s: number, l: number, a = 1) {
  return `hsla(${Math.round(h % 360)}, ${Math.round(s)}%, ${Math.round(l)}%, ${a})`;
}

/**
 * Builds the raw SVG markup for a seeded placeholder frame. Exposed
 * separately from the data-URI wrapper so it can be inlined directly when
 * that's preferable (e.g. avoiding a data-URI size hit for many cards).
 */
export function buildPlaceholderSvg(seed: number, width = 640, height = 360): string {
  const rand = mulberry32(seed);

  // A muted base hue per seed, plus two related accent hues so the palette
  // stays cohesive rather than random-looking.
  const baseHue = rand() * 360;
  const accentHue1 = (baseHue + 30 + rand() * 60) % 360;
  const accentHue2 = (baseHue + 200 + rand() * 80) % 360;

  const blobs = Array.from({ length: 3 }, (_, i) => {
    const hue = i === 0 ? baseHue : i === 1 ? accentHue1 : accentHue2;
    const cx = width * (0.15 + rand() * 0.7);
    const cy = height * (0.15 + rand() * 0.7);
    const r = width * (0.18 + rand() * 0.22);
    const sat = 45 + rand() * 25;
    const light = 30 + rand() * 20;
    const opacity = 0.35 + rand() * 0.25;
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${hsl(hue, sat, light, opacity)}" />`;
  }).join('');

  // A low-poly silhouette band along the bottom — evokes an environment/set
  // piece without depicting anything specific.
  const points: string[] = [`0,${height}`];
  const segments = 6;
  for (let i = 0; i <= segments; i++) {
    const x = (width / segments) * i;
    const y = height * (0.62 + rand() * 0.22);
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  points.push(`${width},${height}`);
  const silhouetteFill = hsl(baseHue, 20, 8, 0.85);

  // Faint scanline / grain texture for a "processed render" feel.
  const grainSeed = Math.round(rand() * 1000);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${hsl(baseHue, 30, 10)}" />
      <stop offset="100%" stop-color="${hsl(accentHue2, 25, 5)}" />
    </linearGradient>
    <radialGradient id="vignette" cx="50%" cy="45%" r="75%">
      <stop offset="55%" stop-color="#000000" stop-opacity="0" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0.55" />
    </radialGradient>
    <filter id="soften" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="${(width * 0.06).toFixed(1)}" />
    </filter>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${grainSeed}" result="noise" />
      <feColorMatrix in="noise" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.03 0" />
    </filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)" />
  <g filter="url(#soften)">${blobs}</g>
  <polygon points="${points.join(' ')}" fill="${silhouetteFill}" />
  <rect width="${width}" height="${height}" filter="url(#grain)" />
  <rect width="${width}" height="${height}" fill="url(#vignette)" />
</svg>`;
}

const dataUriCache = new Map<string, string>();

/**
 * Returns a `data:image/svg+xml;base64,...` URI for the given seed —
 * usable directly as an `<img src>`, a CSS `background-image`, or a
 * `<video poster>`. Cached per seed+size so repeated renders (e.g. the same
 * card re-rendering) don't rebuild/re-encode the SVG each time.
 */
export function getPlaceholderThumbnail(seed: number, width = 640, height = 360): string {
  const key = `${seed}:${width}x${height}`;
  const cached = dataUriCache.get(key);
  if (cached) return cached;

  const svg = buildPlaceholderSvg(seed, width, height);
  const uri = `data:image/svg+xml;base64,${btoa(svg)}`;
  dataUriCache.set(key, uri);
  return uri;
}

// This mock has no real render/transcode pipeline, so there's no actual
// per-shot media file to stream. Rather than play the same stock clip for
// every shot (which makes any player look broken — click any shot, get the
// same footage), deterministically pick from a small pool of distinct public
// sample videos keyed off the shot's own seed, so each shot at least
// consistently maps to its own "preview" playback source. Shared between
// the client review portal and the delivery viewer so both play the same
// clip for the same shot.
const SAMPLE_VIDEO_POOL = [
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
];

export function getPlaceholderVideoSrc(seed: number): string {
  const index = Math.abs(seed) % SAMPLE_VIDEO_POOL.length;
  return SAMPLE_VIDEO_POOL[index];
}
