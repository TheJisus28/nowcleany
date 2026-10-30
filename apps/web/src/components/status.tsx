import {
  Banknote,
  CalendarClock,
  Clock,
  Check,
  CircleCheck,
  CircleDashed,
  Factory,
  FileText,
  type LucideIcon,
  PackageCheck,
  PackageOpen,
  Send,
  TriangleAlert,
  Truck,
  X,
} from 'lucide-react';
import type {
  CollectionStatus,
  CoverageStatus,
  OrderStatus,
  PurchaseStatus,
  ShipmentStatus,
} from '../api/types';
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
  SHORT: { tone: 'critical', icon: TriangleAlert, label: 'Falta comprar' },
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
  CONFIRMED: { tone: 'brand', icon: Send, label: 'Por facturar' },
  INVOICED: { tone: 'brand', icon: FileText, label: 'Facturada' },
  READY: { tone: 'brand', icon: PackageCheck, label: 'Lista para despacho' },
  PARTIAL: { tone: 'warning', icon: PackageOpen, label: 'Despachada parcial' },
  DISPATCHED: { tone: 'brand', icon: Truck, label: 'En ruta' },
  DELIVERED: { tone: 'good', icon: CircleCheck, label: 'Entregada' },
  CANCELLED: { tone: 'neutral', icon: X, label: 'Anulada' },
};

/** The flow every order follows; each step is done and authorized by one role. */
export const ORDER_FLOW: readonly { status: OrderStatus; label: string; role: string }[] = [
  { status: 'DRAFT', label: 'Preventa', role: 'Vendedor' },
  { status: 'CONFIRMED', label: 'Por facturar', role: 'Vendedor' },
  { status: 'INVOICED', label: 'Facturada', role: 'Facturación' },
  { status: 'READY', label: 'Alistada', role: 'Planta' },
  { status: 'DISPATCHED', label: 'En ruta', role: 'Logística' },
  { status: 'DELIVERED', label: 'Entregada', role: 'Logística' },
];

/** Position of a status in ORDER_FLOW (a partial dispatch sits between ready and on the road). */
export function flowIndex(status: OrderStatus): number {
  if (status === 'PARTIAL') return 3.5;
  if (status === 'CANCELLED') return -1;
  return ORDER_FLOW.findIndex((step) => step.status === status);
}

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

export function PurchaseStatusChip({ status }: { status: PurchaseStatus }) {
  if (status === 'PARTIAL') {
    return (
      <Chip tone="warning" icon={PackageOpen}>
        Recibida parcial
      </Chip>
    );
  }
  if (status === 'CLOSED') {
    return (
      <Chip tone="neutral" icon={Check}>
        Cerrada con lo recibido
      </Chip>
    );
  }
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
      <span
        title={`${lateLabel} · ${formatDate(date)}`}
        aria-label={`${lateLabel} ${relativeDays(date).toLowerCase()}`}
        className="inline-flex items-center gap-0.5 font-medium whitespace-nowrap text-critical"
      >
        <Clock aria-hidden className="size-3.5" strokeWidth={2.25} />
        {-days} d
      </span>
    );
  }
  return (
    <span
      title={formatDate(date)}
      className={cn('whitespace-nowrap', days !== null && days <= 2 && 'font-medium')}
    >
      {relativeDays(date)}
    </span>
  );
}

const COLLECTION: Record<CollectionStatus, { tone: Tone; icon: LucideIcon; label: string }> = {
  PAID: { tone: 'good', icon: CircleCheck, label: 'Pagada' },
  PARTIAL: { tone: 'warning', icon: Banknote, label: 'Abonada' },
  PENDING: { tone: 'brand', icon: Clock, label: 'Por cobrar' },
  OVERDUE: { tone: 'critical', icon: TriangleAlert, label: 'Vencida' },
};

export function CollectionChip({ status }: { status: CollectionStatus }) {
  const { tone, icon, label } = COLLECTION[status];
  return (
    <Chip tone={tone} icon={icon}>
      {label}
    </Chip>
  );
}

const SHIPMENT: Record<ShipmentStatus, { tone: Tone; icon: LucideIcon; label: string }> = {
  PLANNED: { tone: 'neutral', icon: CircleDashed, label: 'Por despachar' },
  IN_TRANSIT: { tone: 'brand', icon: Truck, label: 'En ruta' },
  DELIVERED: { tone: 'good', icon: CircleCheck, label: 'Entregada' },
};

export function ShipmentStatusChip({ status }: { status: ShipmentStatus }) {
  const { tone, icon, label } = SHIPMENT[status];
  return (
    <Chip tone={tone} icon={icon}>
      {label}
    </Chip>
  );
}
