import type { Q } from '../api/types';
import { formatDecimal, isNegative, isZero, roundUpDecimal, unitLabel } from '../lib/format';
import { cn } from './ui';

/**
 * A quantity with its unit, shown with at most two decimals rounded up (the API value stays exact).
 * Negative values (oversold, recorded out of order) are flagged.
 */
export function Qty({
  value,
  className,
  emphasis = false,
  dimZero = false,
}: {
  value: Q;
  className?: string;
  emphasis?: boolean;
  /** Show zero in muted ink (lists where zero means "nothing to do"). */
  dimZero?: boolean;
}) {
  const negative = isNegative(value.quantity);
  const zero = isZero(value.quantity);
  return (
    <span
      className={cn(
        'tabular-nums [font-stretch:94%]',
        emphasis && 'font-semibold',
        negative && 'text-critical',
        dimZero && zero && 'text-ink-3',
        className,
      )}
    >
      {formatDecimal(roundUpDecimal(value.quantity))}
      <span
        className={cn(
          'ml-1 text-[0.85em] font-normal',
          negative ? 'text-critical/80' : 'text-ink-3',
        )}
      >
        {unitLabel(value.unit)}
      </span>
    </span>
  );
}
