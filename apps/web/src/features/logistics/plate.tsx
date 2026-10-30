import { cn } from '../../components/ui';

/** Colombian plate as typed or stored ("abc-123", "ABC123") → "ABC123"; null when it is not valid. */
export function normalizePlate(raw: string): string | null {
  const plate = raw.replace(/[\s-]/g, '').toUpperCase();
  return /^[A-Z]{3}\d{2}[A-Z0-9]$/.test(plate) ? plate : null;
}

/**
 * The vehicle plate drawn like the real one (yellow, black letters, "ABC 123"), so the guide reads at
 * a glance the way the dispatcher sees the truck at the gate.
 */
export function Plate({ plate, size = 'sm' }: { plate: string; size?: 'sm' | 'lg' }) {
  const text = plate.length === 6 ? `${plate.slice(0, 3)} ${plate.slice(3)}` : plate;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[4px] border-[1.5px] border-[#1d1d1b] bg-[#f6c500] font-bold tracking-[0.08em] whitespace-nowrap text-[#1d1d1b] tabular-nums shadow-[inset_0_0_0_1px_rgb(255_255_255/0.35)] [font-stretch:88%]',
        size === 'lg' ? 'px-3 py-1 text-xl' : 'px-1.5 py-px text-[12.5px]',
      )}
      aria-label={`Placa ${plate}`}
    >
      {text}
    </span>
  );
}
