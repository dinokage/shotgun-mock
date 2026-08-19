import { useEffect, useCallback } from 'react';

type KeyHandler = (e: KeyboardEvent) => void;
type ShortcutMap = Record<string, KeyHandler>;

/**
 * Global keyboard shortcut hook.
 * 
 * Usage:
 *   useHotkeys({
 *     'Space': () => togglePlay(),
 *     'ArrowLeft': () => prevFrame(),
 *     'ArrowRight': () => nextFrame(),
 *     'ctrl+z': () => undo(),
 *   });
 */
export function useHotkeys(shortcuts: ShortcutMap, deps: any[] = []) {
  const handler = useCallback((e: KeyboardEvent) => {
    // Don't fire when user is typing in an input/textarea
    const tag = (e.target as HTMLElement).tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if ((e.target as HTMLElement).isContentEditable) return;

    // Build key string
    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push('ctrl');
    if (e.shiftKey) parts.push('shift');
    if (e.altKey) parts.push('alt');
    
    let key = e.key;
    // Normalize common keys
    if (key === ' ') key = 'Space';
    parts.push(key);
    
    const combo = parts.join('+');
    
    // Try exact match first, then just the key. The fallback intentionally
    // ignores Shift alone: for printable keys (e.g. '?' is Shift+/) the
    // Shift is already baked into `e.key`, so gating the fallback on
    // `!e.shiftKey` made it unreachable — `combo` only differs from `key` by
    // holding some modifier, and the fallback required holding none, i.e.
    // combo === key already, which the first branch had already handled.
    // Ctrl/Meta/Alt still gate the fallback since those don't change `key`.
    if (shortcuts[combo]) {
      e.preventDefault();
      e.stopPropagation();
      shortcuts[combo](e);
    } else if (!e.ctrlKey && !e.metaKey && !e.altKey && shortcuts[key]) {
      e.preventDefault();
      e.stopPropagation();
      shortcuts[key](e);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcuts, ...deps]);

  useEffect(() => {
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handler]);
}
