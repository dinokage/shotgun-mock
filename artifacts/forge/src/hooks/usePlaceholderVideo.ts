import { useEffect, useState } from "react";
import { getPlaceholderVideoSrc } from "@/lib/placeholderArt";

/**
 * Resolves a seeded placeholder "video" (see placeholderArt.ts) as it
 * becomes available. Returns undefined until the clip is generated --
 * callers should keep showing their poster/thumbnail image in that state
 * rather than pointing <video src> at nothing.
 */
export function usePlaceholderVideoSrc(seed: number): string | undefined {
  const [src, setSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setSrc(undefined);
    getPlaceholderVideoSrc(seed).then((resolved) => {
      if (!cancelled) setSrc(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [seed]);

  return src;
}
