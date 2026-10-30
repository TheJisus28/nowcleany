import { ChevronLeft, ChevronRight, LoaderCircle, type LucideIcon, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { cn } from '../ui';
import { useShortcuts } from './shortcuts';

export interface ToolbarAction {
  label: string;
  icon?: LucideIcon;
  /** Shown on the button and bound to the keyboard: "Ctrl+S", "F2", "F9"… */
  shortcut?: string;
  onClick?: () => void;
  /** Navigates instead of running an action. */
  to?: string;
  /** The role's step (send, invoice, prepare, dispatch…): only one per screen. */
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  loading?: boolean;
  /** Not shown (the user cannot do it or it does not apply). */
  hidden?: boolean;
  title?: string;
}

const BASE =
  'inline-flex h-8 items-center gap-1.5 rounded-[5px] px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50';

function ActionButton({ action }: { action: ToolbarAction }) {
  const Icon = action.loading ? LoaderCircle : action.icon;
  const className = cn(
    BASE,
    action.primary
      ? 'bg-brand text-white hover:bg-brand-strong'
      : action.danger
        ? 'text-critical hover:bg-critical-soft'
        : 'text-ink hover:bg-surface-2',
  );
  const content = (
    <>
      {Icon ? (
        <Icon aria-hidden className={cn('size-4', action.loading && 'animate-spin')} />
      ) : null}
      {action.label}
      {action.shortcut ? (
        <kbd
          className={cn(
            'rounded border px-1 text-[10.5px] font-normal',
            action.primary ? 'border-white/30 text-white/80' : 'border-line text-ink-3',
          )}
        >
          {action.shortcut}
        </kbd>
      ) : null}
    </>
  );
  if (action.to && !action.disabled) {
    return (
      <Link to={action.to} className={className} title={action.title}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={className}
      disabled={action.disabled ?? action.loading}
      onClick={action.onClick}
      title={action.title}
    >
      {content}
    </button>
  );
}

/**
 * The fixed button bar of a document or a consultation, as in traditional systems: text plus shortcut,
 * previous / next document and close (Esc).
 */
export function DocumentToolbar({
  actions,
  previous,
  next,
  closeTo,
}: {
  actions: readonly ToolbarAction[];
  /** Link to the previous / next document of the same kind. */
  previous?: string | null | undefined;
  next?: string | null | undefined;
  /** Where Esc and "Cerrar" go. */
  closeTo?: string;
}) {
  const navigate = useNavigate();
  const visible = actions.filter((action) => !action.hidden);
  useShortcuts({
    ...Object.fromEntries(
      visible
        .filter((action) => action.shortcut && !action.disabled && !action.loading)
        .map((action) => [
          action.shortcut ?? '',
          () => {
            if (action.to) void navigate(action.to);
            else action.onClick?.();
          },
        ]),
    ),
    ...(closeTo
      ? {
          Esc: () => {
            void navigate(closeTo);
          },
        }
      : {}),
  });
  return (
    <div className="no-print sticky top-[100px] z-20 -mx-3 mb-3 flex flex-wrap items-center gap-1 border-y border-line bg-surface/95 px-3 py-1.5 backdrop-blur sm:-mx-4 lg:top-11 lg:-mx-5 lg:px-4">
      {visible.map((action) => (
        <ActionButton key={action.label} action={action} />
      ))}
      <span className="flex-1" />
      {previous !== undefined || next !== undefined ? (
        <span className="flex items-center gap-0.5">
          <Link
            to={previous ?? '#'}
            aria-disabled={!previous}
            className={cn(
              BASE,
              'px-1.5 text-ink-2 hover:bg-surface-2',
              !previous && 'pointer-events-none opacity-40',
            )}
            title="Documento anterior"
          >
            <ChevronLeft aria-hidden className="size-4" />
            <span className="sr-only">Anterior</span>
          </Link>
          <Link
            to={next ?? '#'}
            aria-disabled={!next}
            className={cn(
              BASE,
              'px-1.5 text-ink-2 hover:bg-surface-2',
              !next && 'pointer-events-none opacity-40',
            )}
            title="Documento siguiente"
          >
            <ChevronRight aria-hidden className="size-4" />
            <span className="sr-only">Siguiente</span>
          </Link>
        </span>
      ) : null}
      {closeTo ? (
        <Link
          to={closeTo}
          className={cn(BASE, 'text-ink-2 hover:bg-surface-2')}
          title="Cerrar (Esc)"
        >
          <X aria-hidden className="size-4" />
          Cerrar
          <kbd className="rounded border border-line px-1 text-[10.5px] font-normal text-ink-3">
            Esc
          </kbd>
        </Link>
      ) : null}
    </div>
  );
}
