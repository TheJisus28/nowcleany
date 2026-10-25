import type { Q } from '../api/types';
import { formatDecimal, isNegative, isZero, unitLabel } from '../lib/format';
import { cn } from './ui';

/** An exact quantity with its unit. Negative values (oversold, recorded out of order) are flagged. */
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
      {formatDecimal(value.quantity)}
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
