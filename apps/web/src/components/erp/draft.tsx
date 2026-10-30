import { History } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface Stored<T> {
  value: T;
  savedAt: string;
}

function read<T>(key: string): Stored<T> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Stored<T>) : null;
  } catch {
    return null;
  }
}

/**
 * Keeps what the user has typed in an unsaved document, so closing the tab or the session loses nothing.
 * `pending` is a draft left from before (offer to restore it); call `clear` once the document is saved.
 */
export function useDraft<T>(
  key: string,
  value: T,
  options: { enabled?: boolean; isEmpty?: (value: T) => boolean } = {},
): { pending: Stored<T> | null; restore: () => T | null; discard: () => void; clear: () => void } {
  const storageKey = `scip.draft.${key}`;
  const enabled = options.enabled ?? true;
  const [pending, setPending] = useState<Stored<T> | null>(() =>
    enabled ? read<T>(storageKey) : null,
  );
  const started = useRef(false);
  const isEmpty = useRef(options.isEmpty);
  isEmpty.current = options.isEmpty;

  useEffect(() => {
    if (!enabled) return;
    // The first render is the blank (or loaded) document: only what the user changes afterwards is a draft.
    if (!started.current) {
      started.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      try {
        if (isEmpty.current?.(value)) localStorage.removeItem(storageKey);
        else
          localStorage.setItem(
            storageKey,
            JSON.stringify({ value, savedAt: new Date().toISOString() } satisfies Stored<T>),
          );
      } catch {
        // Private mode: no drafts.
      }
    }, 600);
    return () => {
      window.clearTimeout(timer);
    };
  }, [value, storageKey, enabled]);

  const clear = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Nothing to clear.
    }
    setPending(null);
  };
  return {
    pending,
    restore: () => {
      const draft = pending?.value ?? null;
      setPending(null);
      return draft;
    },
    discard: clear,
    clear,
  };
}

/** "Hay un borrador sin guardar…" with Recuperar / Descartar. */
export function DraftBanner({
  savedAt,
  onRestore,
  onDiscard,
}: {
  savedAt: string;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="no-print mb-3 flex flex-wrap items-center gap-3 rounded-md border border-warning/50 bg-warning-soft px-4 py-2 text-[13.5px]">
      <History aria-hidden className="size-4 text-[#b67d00]" />
      <span className="flex-1">
        Hay un borrador sin guardar de este documento ({new Date(savedAt).toLocaleString('es-CO')}).
      </span>
      <button type="button" onClick={onRestore} className="font-medium text-brand hover:underline">
        Recuperar
      </button>
      <button type="button" onClick={onDiscard} className="text-ink-2 hover:underline">
        Descartar
      </button>
    </div>
  );
}
