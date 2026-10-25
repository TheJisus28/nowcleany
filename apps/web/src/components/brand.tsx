import { cn } from './ui';

/** SCIP mark: a tank with its level line — what is there versus what is needed. */
export function BrandMark({
  className,
  inverted = false,
}: {
  className?: string;
  inverted?: boolean;
}) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('size-8', className)}>
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="8"
        fill={inverted ? '#ffffff' : '#0d5b52'}
        fillOpacity={inverted ? 0.14 : 1}
      />
      <rect
        x="9"
        y="7"
        width="14"
        height="18"
        rx="3"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
      />
      <path d="M10 17.5h12V22a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2z" fill="#ffffff" fillOpacity="0.9" />
      <path d="M8 17.5h16" stroke="#d9e34f" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function BrandLockup({ inverted = false }: { inverted?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark inverted={inverted} />
      <div className="leading-none">
        <p
          className={cn(
            'text-[17px] font-bold tracking-[0.02em] [font-stretch:118%]',
            inverted ? 'text-white' : 'text-ink',
          )}
        >
          SCIP
        </p>
        <p className={cn('mt-1 text-[11px]', inverted ? 'text-white/70' : 'text-ink-3')}>
          NOW CLEANY
        </p>
      </div>
    </div>
  );
}
