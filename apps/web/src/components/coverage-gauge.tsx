import type { Q } from '../api/types';
import { formatDecimal, unitLabel } from '../lib/format';
import { cn } from './ui';

interface Segment {
  key: 'stock' | 'production' | 'uncovered';
  label: string;
  value: number;
  quantity: string;
  fill: string;
}

/**
 * The coverage meter: of what was sold, how much is covered by finished stock, how much can still be
 * produced with the materials on hand, and how much is uncovered (needs purchases). The track is the
 * larger of sold and capacity, so spare capacity shows as unfilled track. Values ride in the legend
 * and the tooltip, never painted on the bar.
 */
export function CoverageGauge({
  sold,
  onHand,
  producible,
  uncovered,
  compact = false,
}: {
  sold: Q;
  onHand: Q;
  producible: Q;
  uncovered: Q;
  compact?: boolean;
}) {
  const soldN = Number(sold.quantity);
  const stockN = Math.max(0, Number(onHand.quantity));
  const producibleN = Math.max(0, Number(producible.quantity));
  const fromStock = Math.min(stockN, soldN);
  const fromProduction = Math.min(producibleN, soldN - fromStock);
  const uncoveredN = Math.max(0, Number(uncovered.quantity));
  const track = Math.max(soldN, stockN + producibleN, 1);
  const unit = sold.unit;

  const segments: Segment[] = [
    {
      key: 'stock',
      label: 'Desde stock',
      value: fromStock,
      quantity: String(fromStock),
      fill: 'bg-good',
    },
    {
      key: 'production',
      label: 'Por producir',
      value: fromProduction,
      quantity: String(fromProduction),
      fill: 'bg-warning',
    },
    {
      key: 'uncovered',
      label: 'Sin cobertura',
      value: uncoveredN,
      quantity: uncovered.quantity,
      fill: 'bg-critical',
    },
  ];
  const visible = segments.filter((segment) => segment.value > 0);

  return (
    <div>
      <div
        className={cn(
          'relative flex w-full gap-[2px] rounded-r-[4px] bg-surface-2',
          compact ? 'h-3' : 'h-6',
        )}
        role="img"
        aria-label={`Vendido ${formatDecimal(sold.quantity)} ${unitLabel(unit)}: ${visible
          .map((s) => `${s.label.toLowerCase()} ${formatDecimal(s.quantity)}`)
          .join(', ')}`}
      >
        {visible.map((segment, index) => (
          <div
            key={segment.key}
            tabIndex={0}
            className={cn(
              'group relative h-full outline-offset-2',
              segment.fill,
              index === visible.length - 1 && 'rounded-r-[4px]',
            )}
            style={{ width: `${String((segment.value / track) * 100)}%`, minWidth: 3 }}
          >
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 rounded-md bg-ink px-2.5 py-1.5 text-xs whitespace-nowrap text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            >
              {segment.label}: {formatDecimal(segment.quantity)} {unitLabel(unit)}
            </span>
          </div>
        ))}
      </div>
      {!compact ? (
        <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-2">
          {segments.map((segment) => (
            <li key={segment.key} className="flex items-center gap-1.5">
              <span aria-hidden className={cn('size-2.5 rounded-[2px]', segment.fill)} />
              {segment.label}
              <span className="font-medium text-ink tabular-nums">
                {formatDecimal(segment.quantity)} {unitLabel(unit)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
