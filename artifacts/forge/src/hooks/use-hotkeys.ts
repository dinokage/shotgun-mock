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
    
    // Try exact match first, then just the key
    if (shortcuts[combo]) {
      e.preventDefault();
      e.stopPropagation();
      shortcuts[combo](e);
    } else if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && shortcuts[key]) {
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
