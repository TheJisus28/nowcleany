import type { LucideIcon } from 'lucide-react';
import { type FocusEvent, type MouseEvent, type ReactNode, useRef, useState } from 'react';
import { cn } from './ui';

/**
 * Small HTML charts for the dashboard (no chart library): thin marks, 2px gaps between segments,
 * 4px rounded data ends, a legend always visible and a hover/focus tooltip on every mark.
 * Values ride in the tooltip and in text next to the marks, never painted on the bars.
 */

export interface Series {
  key: string;
  label: string;
  /** Tailwind background class of the series (status or categorical token). */
  fill: string;
  icon?: LucideIcon;
}

export interface Datum {
  key: string;
  label: string;
  sub?: string;
  values: Record<string, number>;
}

interface TooltipContent {
  title: string;
  sub?: string | undefined;
  lines: { label: string; value: string; fill?: string }[];
}

function useTooltip() {
  const frame = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; content: TooltipContent } | null>(null);

  const place = (clientX: number, clientY: number, content: TooltipContent) => {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect) return;
    setTip({ x: clientX - rect.left, y: clientY - rect.top, content });
  };
  const bind = (content: TooltipContent) => ({
    onMouseMove: (event: MouseEvent<HTMLElement>) => {
      place(event.clientX, event.clientY, content);
    },
    onMouseLeave: () => {
      setTip(null);
    },
    onFocus: (event: FocusEvent<HTMLElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      place(rect.left + rect.width / 2, rect.top, content);
    },
    onBlur: () => {
      setTip(null);
    },
  });

  const width = frame.current?.clientWidth ?? 0;
  const node = tip ? (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 w-max max-w-[260px] rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] shadow-lg"
      style={{
        left: Math.min(tip.x + 14, Math.max(width - 270, 0)),
        top: Math.max(tip.y - 12, 0),
        transform: 'translateY(-100%)',
      }}
    >
      <p className="font-semibold text-ink">{tip.content.title}</p>
      {tip.content.sub ? <p className="text-ink-3">{tip.content.sub}</p> : null}
      <ul className="mt-1.5 flex flex-col gap-1">
        {tip.content.lines.map((line) => (
          <li key={line.label} className="flex items-center gap-2">
            {line.fill ? (
              <span aria-hidden className={cn('size-2 rounded-[2px]', line.fill)} />
            ) : null}
            <span className="text-ink-2">{line.label}</span>
            <span className="ml-auto pl-3 font-semibold tabular-nums text-ink">{line.value}</span>
          </li>
        ))}
      </ul>
    </div>
  ) : null;

  return { frame, bind, node };
}

const total = (datum: Datum, series: readonly Series[]) =>
  series.reduce((sum, s) => sum + (datum.values[s.key] ?? 0), 0);

/** Smallest "nice" axis maximum at or above the value (1, 2, 5 × 10^n). */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 5, 10].map((step) => step * power).find((step) => step >= value) ?? value;
}

export function Legend({
  series,
  counts,
  className,
}: {
  series: readonly Series[];
  counts?: Record<string, number | string>;
  className?: string;
}) {
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px]', className)}>
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5 whitespace-nowrap">
          <span aria-hidden className={cn('size-2.5 rounded-[2px]', s.fill)} />
          {s.icon ? <s.icon aria-hidden className="size-3.5 text-ink-3" /> : null}
          <span className="text-ink-2">{s.label}</span>
          {counts?.[s.key] !== undefined ? (
            <span className="font-semibold tabular-nums text-ink">{counts[s.key]}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Stacked columns over a few categories (e.g. delivery weeks). Clicking a column selects it. */
export function StackedColumns({
  data,
  series,
  label,
  height = 190,
  selected,
  onSelect,
  unit,
}: {
  data: readonly Datum[];
  series: readonly Series[];
  label: string;
  height?: number;
  selected?: string | null | undefined;
  onSelect?: ((key: string | null) => void) | undefined;
  unit: (value: number) => string;
}) {
  const { frame, bind, node } = useTooltip();
  const max = niceMax(Math.max(...data.map((d) => total(d, series)), 0));
  const ticks = [max, max / 2, 0];
  return (
    <div ref={frame} className="relative" role="group" aria-label={label}>
      <div className="relative" style={{ height }}>
        {ticks.map((tick) => (
          <div
            key={tick}
            className="absolute right-0 left-0 flex items-center gap-2"
            style={{ bottom: `${String((tick / max) * 100)}%` }}
          >
            <span className="w-7 -translate-y-1/2 text-right text-[11px] text-ink-3 tabular-nums">
              {Number.isInteger(tick) ? tick : ''}
            </span>
            <span
              className={cn(
                'h-px flex-1 -translate-y-1/2',
                tick === 0 ? 'bg-line-strong' : 'bg-line',
              )}
            />
          </div>
        ))}
        <div className="absolute inset-y-0 right-0 left-9 flex items-end justify-around">
          {data.map((datum) => {
            const sum = total(datum, series);
            const visible = series.filter((s) => (datum.values[s.key] ?? 0) > 0);
            const dimmed = selected && selected !== datum.key;
            return (
              <button
                key={datum.key}
                type="button"
                aria-pressed={selected === datum.key}
                aria-label={`${datum.label}: ${unit(sum)}`}
                onClick={() => {
                  onSelect?.(selected === datum.key ? null : datum.key);
                }}
                className={cn(
                  'flex h-full w-full max-w-16 cursor-pointer flex-col items-center justify-end rounded-md outline-none hover:bg-surface-2/70 focus-visible:ring-2 focus-visible:ring-brand/40',
                  dimmed && 'opacity-35',
                )}
                {...bind({
                  title: datum.label,
                  sub: datum.sub,
                  lines: [
                    ...series.map((s) => ({
                      label: s.label,
                      value: unit(datum.values[s.key] ?? 0),
                      fill: s.fill,
                    })),
                    { label: 'Total', value: unit(sum) },
                  ],
                })}
              >
                <span
                  className="flex w-6 flex-col-reverse gap-[2px]"
                  style={{ height: `${String((sum / max) * 100)}%` }}
                >
                  {visible.map((s, index) => (
                    <span
                      key={s.key}
                      className={cn(
                        s.fill,
                        'min-h-[2px]',
                        index === visible.length - 1 && 'rounded-t-[4px]',
                      )}
                      style={{ flexGrow: datum.values[s.key] ?? 0 }}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex justify-around pl-9">
        {data.map((datum) => (
          <div key={datum.key} className="w-full max-w-24 text-center leading-tight">
            <p
              className={cn(
                'text-[12px]',
                selected === datum.key ? 'font-semibold text-ink' : 'text-ink-2',
              )}
            >
              {datum.label}
            </p>
            {datum.sub ? (
              <p className="hidden text-[11px] text-ink-3 sm:block">{datum.sub}</p>
            ) : null}
          </div>
        ))}
      </div>
      {node}
    </div>
  );
}

/**
 * Horizontal stacked bars, one row per item. `normalize` makes every row 100% (for items whose
 * units cannot be compared); otherwise rows share one scale.
 */
export function StackedBars({
  data,
  series,
  label,
  selected,
  onSelect,
  normalize = false,
  unit,
  aside,
}: {
  data: readonly Datum[];
  series: readonly Series[];
  label: string;
  selected?: string | null | undefined;
  onSelect?: ((key: string | null) => void) | undefined;
  normalize?: boolean;
  unit: (value: number, datum: Datum) => string;
  /** Text at the end of each row. */
  aside?: (datum: Datum) => ReactNode;
}) {
  const { frame, bind, node } = useTooltip();
  const max = Math.max(...data.map((d) => total(d, series)), 1);
  return (
    <div ref={frame} className="relative" role="group" aria-label={label}>
      <ul className="flex flex-col gap-1">
        {data.map((datum) => {
          const sum = total(datum, series);
          const visible = series.filter((s) => (datum.values[s.key] ?? 0) > 0);
          const dimmed = selected && selected !== datum.key;
          return (
            <li key={datum.key}>
              <button
                type="button"
                aria-pressed={selected === datum.key}
                onClick={() => {
                  onSelect?.(selected === datum.key ? null : datum.key);
                }}
                className={cn(
                  'grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5 text-left outline-none hover:bg-surface-2/70 focus-visible:ring-2 focus-visible:ring-brand/40 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto]',
                  dimmed && 'opacity-35',
                  selected === datum.key && 'bg-brand-soft/60',
                )}
                {...bind({
                  title: datum.label,
                  sub: datum.sub,
                  lines: series.map((s) => ({
                    label: s.label,
                    value: unit(datum.values[s.key] ?? 0, datum),
                    fill: s.fill,
                  })),
                })}
              >
                <span className="col-span-2 min-w-0 sm:col-span-1">
                  <span className="block truncate text-[13px] font-medium text-ink">
                    {datum.label}
                  </span>
                  {datum.sub ? (
                    <span className="block truncate text-[11.5px] text-ink-3">{datum.sub}</span>
                  ) : null}
                </span>
                <span className="flex h-3 overflow-hidden rounded-[4px] bg-surface-2">
                  <span
                    className="flex h-full gap-[2px]"
                    style={{ width: normalize ? '100%' : `${String((sum / max) * 100)}%` }}
                  >
                    {visible.map((s, index) => (
                      <span
                        key={s.key}
                        className={cn(
                          s.fill,
                          'h-full min-w-[2px]',
                          index === 0 && 'rounded-l-[4px]',
                          index === visible.length - 1 && 'rounded-r-[4px]',
                        )}
                        style={{ flexGrow: datum.values[s.key] ?? 0 }}
                      />
                    ))}
                  </span>
                </span>
                <span className="text-right text-[12.5px] whitespace-nowrap text-ink-2 tabular-nums">
                  {aside?.(datum)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {node}
    </div>
  );
}
