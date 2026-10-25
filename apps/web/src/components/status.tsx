import {
  CalendarClock,
  Clock,
  Check,
  CircleCheck,
  CircleDashed,
  Factory,
  type LucideIcon,
  PackageCheck,
  TriangleAlert,
  Truck,
  X,
} from 'lucide-react';
import type { CoverageStatus, OrderStatus } from '../api/types';
import { daysUntil, formatDate, relativeDays } from '../lib/format';
import { cn } from './ui';

export type Tone = 'good' | 'warning' | 'critical' | 'brand' | 'neutral';

const TONES: Record<Tone, { chip: string; icon: string }> = {
  good: { chip: 'bg-good-soft', icon: 'text-good' },
  warning: { chip: 'bg-warning-soft', icon: 'text-[#b67d00]' },
  critical: { chip: 'bg-critical-soft', icon: 'text-critical' },
  brand: { chip: 'bg-brand-soft', icon: 'text-brand' },
  neutral: { chip: 'bg-surface-2', icon: 'text-ink-3' },
};

/** Status is never color alone: every chip carries an icon and a label (text stays in ink). */
export function Chip({
  tone,
  icon: Icon,
  children,
}: {
  tone: Tone;
  icon: LucideIcon;
  children: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-2 text-[12.5px] font-medium whitespace-nowrap text-ink',
        TONES[tone].chip,
      )}
    >
      <Icon aria-hidden className={cn('size-3.5', TONES[tone].icon)} strokeWidth={2.25} />
      {children}
    </span>
  );
}

export const COVERAGE: Record<CoverageStatus, { tone: Tone; icon: LucideIcon; label: string }> = {
  COVERED: { tone: 'good', icon: CircleCheck, label: 'Cubierto con stock' },
  NEEDS_PRODUCTION: { tone: 'warning', icon: Factory, label: 'Requiere producción' },
  SHORT: { tone: 'critical', icon: TriangleAlert, label: 'Faltan insumos' },
};

export function CoverageChip({ status }: { status: CoverageStatus }) {
  const { tone, icon, label } = COVERAGE[status];
  return (
    <Chip tone={tone} icon={icon}>
      {label}
    </Chip>
  );
}

const ORDER: Record<OrderStatus, { tone: Tone; icon: LucideIcon; label: string }> = {
  DRAFT: { tone: 'neutral', icon: CircleDashed, label: 'Borrador' },
  CONFIRMED: { tone: 'brand', icon: Check, label: 'Confirmada' },
  DISPATCHED: { tone: 'good', icon: Truck, label: 'Despachada' },
  CANCELLED: { tone: 'neutral', icon: X, label: 'Anulada' },
};

export function OrderStatusChip({ status }: { status: OrderStatus }) {
  const { tone, icon, label } = ORDER[status];
  return (
    <Chip tone={tone} icon={icon}>
      {label}
    </Chip>
  );
}

export function ProductionStatusChip({
  status,
}: {
  status: 'PLANNED' | 'COMPLETED' | 'CANCELLED';
}) {
  if (status === 'PLANNED') {
    return (
      <Chip tone="brand" icon={CalendarClock}>
        Programada
      </Chip>
    );
  }
  if (status === 'COMPLETED') {
    return (
      <Chip tone="good" icon={CircleCheck}>
        Terminada
      </Chip>
    );
  }
  return (
    <Chip tone="neutral" icon={X}>
      Anulada
    </Chip>
  );
}

export function PurchaseStatusChip({ status }: { status: 'OPEN' | 'RECEIVED' | 'CANCELLED' }) {
  if (status === 'OPEN') {
    return (
      <Chip tone="brand" icon={Truck}>
        En tránsito
      </Chip>
    );
  }
  if (status === 'RECEIVED') {
    return (
      <Chip tone="good" icon={PackageCheck}>
        Recibida
      </Chip>
    );
  }
  return (
    <Chip tone="neutral" icon={X}>
      Anulada
    </Chip>
  );
}

/**
 * A due date for something still pending ("En 3 días"). Past dates are late: flagged with an icon and
 * a label, not only color.
 */
export function DueDate({
  date,
  lateLabel = 'Atrasada',
}: {
  date: string | null;
  lateLabel?: string;
}) {
  const days = daysUntil(date);
  if (days !== null && days < 0) {
    return (
      <span title={formatDate(date)} className="inline-flex items-center gap-1 text-critical">
        <Clock aria-hidden className="size-3.5" strokeWidth={2.25} />
        <span className="font-medium">{lateLabel}</span>
        <span className="text-critical/80">· {relativeDays(date).toLowerCase()}</span>
      </span>
    );
  }
  return (
    <span title={formatDate(date)} className={cn(days !== null && days <= 2 && 'font-medium')}>
      {relativeDays(date)}
    </span>
  );
}
