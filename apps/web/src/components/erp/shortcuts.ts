import { useEffect, useRef } from 'react';

/** "Ctrl+S", "Ctrl+P", "F2", "F3", "Esc"… as the user reads them on the buttons. */
function keyName(event: KeyboardEvent): string {
  const key =
    event.key === 'Escape' ? 'Esc' : event.key.length === 1 ? event.key.toUpperCase() : event.key;
  return `${event.ctrlKey || event.metaKey ? 'Ctrl+' : ''}${event.shiftKey && key.length > 1 ? 'Shift+' : ''}${key}`;
}

/**
 * Keyboard shortcuts of a screen, the way traditional systems work (Ctrl+S saves, Esc closes…).
 * They are ignored while a dialog is open, so the dialog keeps its own keys.
 */
export function useShortcuts(map: Readonly<Record<string, (() => void) | undefined>>): void {
  const current = useRef(map);
  current.current = map;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      const handler = current.current[keyName(event)];
      if (!handler) return;
      event.preventDefault();
      handler();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}
