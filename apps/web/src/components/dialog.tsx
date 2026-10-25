import { X } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { cn } from './ui';

/**
 * Native <dialog>: focus trap, Escape and the inert background come from the browser.
 * `side` opens as a panel from the right (details), the default is a centered dialog (forms).
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = 'center',
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  variant?: 'center' | 'side';
  size?: 'md' | 'lg';
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        'max-h-[100dvh] bg-transparent p-0 text-ink backdrop:bg-ink/40 backdrop:backdrop-blur-[2px]',
        variant === 'side'
          ? 'm-0 ml-auto h-[100dvh] w-full max-w-xl'
          : cn('m-auto w-[calc(100%-2rem)]', size === 'lg' ? 'max-w-3xl' : 'max-w-lg'),
      )}
    >
      {open ? (
        <div
          className={cn(
            'flex max-h-[100dvh] flex-col bg-surface',
            variant === 'side'
              ? 'h-full border-l border-line'
              : 'max-h-[90dvh] rounded-xl border border-line',
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold [font-stretch:108%]">{title}</h2>
              {description ? <p className="mt-0.5 text-sm text-ink-2">{description}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="-m-1.5 rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink"
            >
              <X className="size-5" />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer ? (
            <footer className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface-2/60 px-5 py-3">
              {footer}
            </footer>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
