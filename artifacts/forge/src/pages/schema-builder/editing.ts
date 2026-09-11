import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/apiClient";

function shallowEqual<T extends object>(a: T, b: T): boolean {
  const keys = Object.keys(a) as (keyof T)[];
  return (
    keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k])
  );
}

/**
 * Text inputs in the builder now write to the API, so they cannot re-render
 * from the server on every keystroke. `draft` is what the input shows; the
 * accumulated patch is sent once typing pauses, and on unmount — the builder
 * pane remounts when another entity type or template is selected, so the last
 * few characters would otherwise be dropped on the way out.
 */
export function useDebouncedDraft<T extends object>(
  value: T,
  // NoInfer keeps a wider commit signature (e.g. one that also accepts
  // `icon`) from widening the draft beyond the fields this input owns.
  commit: (patch: Partial<NoInfer<T>>) => void,
  delay = 400,
) {
  const [draft, setDraft] = useState<T>(value);
  const pending = useRef<Partial<T> | null>(null);
  const inFlight = useRef<Partial<T> | null>(null);

  const flushRef = useRef(() => {});
  flushRef.current = () => {
    const patch = pending.current;
    pending.current = null;
    if (patch) {
      inFlight.current = patch;
      commit(patch);
    }
  };

  // Server state only takes over an input the user is not mid-edit on, and not
  // while a just-sent patch is still on the wire — until the round trip lands,
  // `value` is the pre-edit text and would visibly undo what was typed. The
  // shallow compare matters too: callers build `value` inline from query data,
  // so it is a fresh object on every render and a blind setDraft would loop.
  useEffect(() => {
    if (pending.current) return;
    if (inFlight.current) {
      const landed = Object.entries(inFlight.current).every(
        ([k, v]) => (value as Record<string, unknown>)[k] === v,
      );
      if (!landed) return;
      inFlight.current = null;
    }
    setDraft((prev) => (shallowEqual(prev, value) ? prev : value));
  }, [value]);

  useEffect(() => {
    if (!pending.current) return;
    const timer = setTimeout(() => flushRef.current(), delay);
    return () => clearTimeout(timer);
  }, [draft, delay]);

  useEffect(() => () => flushRef.current(), []);

  const update = (patch: Partial<T>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    pending.current = { ...(pending.current ?? {}), ...patch };
  };

  return [draft, update] as const;
}

export function describeError(err: unknown): string {
  if (err instanceof ApiError || err instanceof Error) return err.message;
  return "Unexpected error";
}
