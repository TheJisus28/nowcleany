import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { Tone } from './status';
import { cn } from './ui';

const ICON_TONE: Record<Tone, string> = {
  good: 'text-good',
  warning: 'text-[#b67d00]',
  critical: 'text-critical',
  brand: 'text-brand',
  neutral: 'text-ink-3',
};

/** Stat tile: label, value (proportional figures), one line of context. Optionally links to its panel. */
export function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  to,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  to?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-ink-2">{label}</p>
        <Icon aria-hidden className={cn('size-4', ICON_TONE[tone])} strokeWidth={2.25} />
      </div>
      <p className="mt-2 text-[28px] leading-none font-semibold tracking-tight">{value}</p>
      {hint ? <p className="mt-2 text-[13px] text-ink-3">{hint}</p> : null}
    </>
  );
  const className = 'block rounded-[10px] border border-line bg-surface p-4';
  return to ? (
    <Link
      to={to}
      className={cn(className, 'transition-colors hover:border-brand/40 hover:bg-brand-soft/30')}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
