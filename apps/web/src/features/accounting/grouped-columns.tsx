import { useState } from 'react';
import type { Series } from '../../components/charts';
import { cn } from '../../components/ui';

export interface ColumnGroup {
  key: string;
  label: string;
  /** Long name for the tooltip ("octubre de 2026"). */
  title: string;
  values: Record<string, number>;
}

/** Smallest "nice" axis maximum at or above the value (1, 2, 5 × 10^n). */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 5, 10].map((step) => step * power).find((step) => step >= value) ?? value;
}

/**
 * Side-by-side columns per period for measures that are not parts of a whole (invoiced vs
 * collected). One scale, passed in so sibling charts can share it; thin marks with 2px gaps and
 * 4px rounded tops; a tooltip per group on hover or focus; values never painted on the bars.
 */
export function GroupedColumns({
  data,
  series,
  max,
  label,
  format,
  axis,
  height = 180,
}: {
  data: readonly ColumnGroup[];
  series: readonly Series[];
  max: number;
  label: string;
  /** Exact value for the tooltip. */
  format: (value: number) => string;
  /** Short value for the axis. */
  axis: (value: number) => string;
  height?: number;
}) {
  const [active, setActive] = useState<string | null>(null);
  const ticks = [max, max / 2, 0];
  return (
    <div role="group" aria-label={label}>
      <div className="relative" style={{ height }}>
        {ticks.map((tick) => (
          <div
            key={tick}
            className="absolute right-0 left-0 flex items-center gap-2"
            style={{ bottom: `${String((tick / max) * 100)}%` }}
          >
            <span className="w-14 -translate-y-1/2 text-right text-[11px] whitespace-nowrap text-ink-3 tabular-nums">
              {axis(tick)}
            </span>
            <span
              className={cn(
                'h-px flex-1 -translate-y-1/2',
                tick === 0 ? 'bg-line-strong' : 'bg-line',
              )}
            />
          </div>
        ))}
        <div className="absolute inset-y-0 right-0 left-16 flex items-end">
          {data.map((group, index) => {
            const top = Math.max(...series.map((s) => group.values[s.key] ?? 0), 0);
            const isActive = active === group.key;
            return (
              <div key={group.key} className="relative flex h-full flex-1 justify-center">
                <button
                  type="button"
                  aria-label={`${group.title}: ${series
                    .map((s) => `${s.label} ${format(group.values[s.key] ?? 0)}`)
                    .join(', ')}`}
                  onMouseEnter={() => {
                    setActive(group.key);
                  }}
                  onMouseLeave={() => {
                    setActive(null);
                  }}
                  onFocus={() => {
                    setActive(group.key);
                  }}
                  onBlur={() => {
                    setActive(null);
                  }}
                  className={cn(
                    'flex h-full w-full max-w-20 items-end justify-center gap-[2px] rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
                    isActive && 'bg-surface-2/70',
                  )}
                >
                  {series.map((s) => {
                    const value = group.values[s.key] ?? 0;
                    return (
                      <span
                        key={s.key}
                        className={cn('w-3 rounded-t-[4px] sm:w-4', s.fill)}
                        style={{
                          height: `${String((value / max) * 100)}%`,
                          minHeight: value > 0 ? 2 : 0,
                        }}
                      />
                    );
                  })}
                </button>
                {isActive ? (
                  <div
                    role="tooltip"
                    className={cn(
                      'pointer-events-none absolute z-20 w-max max-w-[240px] rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] shadow-lg',
                      index === 0
                        ? 'left-0'
                        : index === data.length - 1
                          ? 'right-0'
                          : 'left-1/2 -translate-x-1/2',
                    )}
                    style={{ bottom: `calc(${String((top / max) * 100)}% + 10px)` }}
                  >
                    <p className="font-semibold text-ink first-letter:uppercase">{group.title}</p>
                    <ul className="mt-1.5 flex flex-col gap-1">
                      {series.map((s) => (
                        <li key={s.key} className="flex items-center gap-2">
                          <span aria-hidden className={cn('size-2 rounded-[2px]', s.fill)} />
                          <span className="text-ink-2">{s.label}</span>
                          <span className="ml-auto pl-3 font-semibold text-ink tabular-nums">
                            {format(group.values[s.key] ?? 0)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex pl-16">
        {data.map((group) => (
          <p
            key={group.key}
            className={cn(
              'flex-1 text-center text-[12px] first-letter:uppercase',
              active === group.key ? 'font-semibold text-ink' : 'text-ink-2',
            )}
          >
            {group.label}
          </p>
        ))}
      </div>
    </div>
  );
}
