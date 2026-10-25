import { CircleAlert, LoaderCircle, RotateCcw } from 'lucide-react';
import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from 'react';
import { errorMessage } from '../api/client';

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

// --- buttons --------------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-strong disabled:bg-brand/50',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-surface-2 disabled:text-ink-3',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink disabled:text-ink-3',
  danger:
    'border border-critical/40 bg-surface text-critical hover:bg-critical-soft disabled:opacity-60',
};

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  icon?: ReactNode;
  loading?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled ?? loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed',
        size === 'md' ? 'h-10 px-4 text-sm' : 'h-8 px-3 text-[13px]',
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {loading ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

// --- form fields ----------------------------------------------------------------------------

const CONTROL =
  'w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus-visible:border-brand disabled:bg-surface-2 aria-invalid:border-critical';

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: (props: {
    id: string;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
  }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children({
        id,
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        ...(error ? { 'aria-invalid': true } : {}),
      })}
      {error ? (
        <p id={`${id}-error`} className="text-[13px] text-critical">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, 'h-10', className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CONTROL, 'h-10 pr-8', className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, 'min-h-20 py-2', className)} {...props} />;
}

// --- layout ---------------------------------------------------------------------------------

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.015em] [font-stretch:112%]">
          {title}
        </h1>
        {description ? <p className="mt-1.5 text-[15px] text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  flush = false,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Content goes edge to edge (tables). */
  flush?: boolean;
}) {
  return (
    <section className={cn('rounded-[10px] border border-line bg-surface', className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            {title ? (
              <h2 className="text-base font-semibold [font-stretch:108%]">{title}</h2>
            ) : null}
            {description ? <p className="mt-0.5 text-[13px] text-ink-2">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={flush ? '' : 'p-5'}>{children}</div>
    </section>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-md border border-line bg-surface-2 p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => {
            onChange(option.value);
          }}
          className={cn(
            'h-8 rounded-[5px] px-3 text-[13px] font-medium transition-colors',
            value === option.value
              ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(18_33_30/0.12)]'
              : 'text-ink-2 hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// --- states ---------------------------------------------------------------------------------

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-ink-3">
      <LoaderCircle aria-hidden className="size-4 animate-spin" />
      {label}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string | undefined;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon ? <div className="mb-3 text-ink-3 [&_svg]:size-6">{icon}</div> : null}
      <p className="font-medium text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-ink-2">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-10 text-center">
      <CircleAlert aria-hidden className="mb-3 size-6 text-critical" />
      <p className="font-medium">No se pudo cargar esta información</p>
      <p className="mt-1 max-w-sm text-sm text-ink-2">{errorMessage(error)}</p>
      {retry ? (
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          icon={<RotateCcw className="size-3.5" />}
          onClick={retry}
        >
          Reintentar
        </Button>
      ) : null}
    </div>
  );
}

/** Loading / error / content for a query, so every screen handles the three states the same way. */
export function QueryView<T>({
  query,
  children,
}: {
  query: { data: T | undefined; isPending: boolean; error: unknown; refetch: () => unknown };
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <Spinner />;
  if (query.error || query.data === undefined) {
    return (
      <ErrorState
        error={query.error}
        retry={() => {
          void query.refetch();
        }}
      />
    );
  }
  return <>{children(query.data)}</>;
}
