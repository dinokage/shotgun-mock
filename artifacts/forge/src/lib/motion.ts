/**
 * Shared motion vocabulary for Forge.
 *
 * Timing is derived from footage handling (a cut, a dissolve) rather than
 * consumer-app bounce/spring defaults — this is the one place that choice
 * lives, so every component reaches for the same easing instead of each
 * screen inventing its own. Mirrors the --ease-cut / --ease-dissolve CSS
 * custom properties in src/index.css; keep both in sync if either changes.
 */

export const EASE_CUT = [0.65, 0, 0.35, 1] as const;
export const EASE_DISSOLVE = [0.22, 1, 0.36, 1] as const;

export const DURATION = {
  instant: 0.12,
  fast: 0.2,
  base: 0.32,
  slow: 0.5,
} as const;

/** A hard, deliberate state change — status flips, claims, toggles. */
export const cut = {
  transition: { duration: DURATION.fast, ease: EASE_CUT },
};

/** A softer reveal — panels, drawers, cards entering. */
export const dissolve = {
  transition: { duration: DURATION.base, ease: EASE_DISSOLVE },
};

/** Fade + rise, for list items and cards appearing. */
export const fadeInUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: DURATION.base, ease: EASE_DISSOLVE },
};

/** For staggered lists (insight cards, comment threads, palette results). */
export function stagger(index: number, step = 0.05) {
  return {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: DURATION.base,
      ease: EASE_DISSOLVE,
      delay: index * step,
    },
  };
}

/** Drawers/panels sliding in from an edge. */
export const slideInRight = {
  initial: { x: "100%" },
  animate: { x: 0 },
  exit: { x: "100%" },
  transition: { duration: DURATION.slow, ease: EASE_CUT },
};

/** A quick confirm pulse — claimed a task, saved a form, toggled a check. */
export const confirmPulse = {
  initial: { scale: 1 },
  animate: { scale: [1, 1.06, 1] },
  transition: { duration: DURATION.fast, ease: EASE_CUT },
};
