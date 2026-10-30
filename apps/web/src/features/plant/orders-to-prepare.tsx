import {
  CalendarPlus,
  CircleCheck,
  ClipboardList,
  Factory,
  Lock,
  type LucideIcon,
  PackageCheck,
  PackageOpen,
  ShoppingCart,
  TriangleAlert,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useAction, useOrderCoverage } from '../../api/hooks';
import type { OrderCoverage, PackagingNeed, Q, Ref, SalesOrder } from '../../api/types';
import { useSession } from '../../auth/session';
import { Dialog } from '../../components/dialog';
import { Kpi } from '../../components/kpi';
import { EntityLink } from '../../components/links';
import { Qty } from '../../components/qty';
import { Chip, DueDate, OrderStatusChip } from '../../components/status';
import { Button, cn, EmptyState, Field, Input, Panel, QueryView } from '../../components/ui';
import { formatDecimal, parseDecimalInput, plural, unitLabel } from '../../lib/format';
import { compareDecimals, isPositive, minDecimal, subtractDecimals } from './decimal';

export interface ScheduleTarget {
  product: Ref;
  kind: 'BULK' | 'FINISHED_GOOD';
  suggested: Q;
}

interface PrepLine {
  productId: string;
  code: string;
  name: string;
  pending: Q;
  /** What today's stock covers, following the consolidator's priority. */
  available: Q;
  missing: Q;
  coverage: OrderCoverage['lines'][number] | undefined;
}

interface PrepOrder {
  order: SalesOrder;
  lines: PrepLine[];
  complete: boolean;
  someAvailable: boolean;
  rank: number;
}

type Readiness = 'complete' | 'partial' | 'waiting';

const readiness = (row: PrepOrder): Readiness =>
  row.complete ? 'complete' : row.order.allowPartial && row.someAvailable ? 'partial' : 'waiting';

function buildRows(orders: SalesOrder[], coverage: OrderCoverage[]): PrepOrder[] {
  const byOrder = new Map(coverage.map((entry) => [entry.orderId, entry]));
  return orders
    .map((order) => {
      const covered = byOrder.get(order.id);
      const lines = order.lines
        .filter((line) => isPositive(line.pending.quantity))
        .map((line) => {
          const coverageLine = covered?.lines.find((item) => item.product.id === line.productId);
          const available = minDecimal(
            coverageLine?.fromStock.quantity ?? '0',
            line.pending.quantity,
          );
          return {
            productId: line.productId,
            code: line.productCode,
            name: line.productName,
            pending: line.pending,
            available: { quantity: available, unit: line.pending.unit },
            missing: {
              quantity: subtractDecimals(line.pending.quantity, available),
              unit: line.pending.unit,
            },
            coverage: coverageLine,
          };
        });
      return {
        order,
        lines,
        complete:
          lines.length > 0 &&
          lines.every(
            (line) => compareDecimals(line.available.quantity, line.pending.quantity) >= 0,
          ),
        someAvailable: lines.some((line) => isPositive(line.available.quantity)),
        rank: covered?.priority ?? 9999,
      };
    })
    .filter((row) => row.lines.length > 0)
    .sort(
      (a, b) =>
        (a.order.priority ?? 9999) - (b.order.priority ?? 9999) ||
        a.rank - b.rank ||
        (a.order.estimatedDeliveryDate ?? '9').localeCompare(b.order.estimatedDeliveryDate ?? '9'),
    );
}

/**
 * Plant's first job: invoiced orders (and the rest of partially dispatched ones) to prepare and hand
 * over to dispatch. Per line, what is pending against what today's stock covers; what is missing is
 * tied to the packaging plan below it.
 */
export function OrdersToPrepare({
  orders,
  packaging,
  onSchedule,
}: {
  orders: SalesOrder[];
  packaging: PackagingNeed[] | undefined;
  onSchedule: (target: ScheduleTarget) => void;
}) {
  const coverage = useOrderCoverage();
  return (
    <QueryView query={coverage}>
      {(data) => (
        <PrepareList
          rows={buildRows(orders, data)}
          packaging={packaging ?? []}
          onSchedule={onSchedule}
        />
      )}
    </QueryView>
  );
}

function PrepareList({
  rows,
  packaging,
  onSchedule,
}: {
  rows: PrepOrder[];
  packaging: PackagingNeed[];
  onSchedule: (target: ScheduleTarget) => void;
}) {
  const [partial, setPartial] = useState<PrepOrder | null>(null);
  const needs = useMemo(
    () => new Map(packaging.map((need) => [need.product.id, need])),
    [packaging],
  );
  const count = (kind: Readiness) => rows.filter((row) => readiness(row) === kind).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Pedidos por alistar"
          value={rows.length}
          icon={ClipboardList}
          tone="brand"
          hint="Facturados y restos de despachos parciales"
        />
        <Kpi
          label="Listos para alistar completos"
          value={count('complete')}
          icon={PackageCheck}
          tone={count('complete') > 0 ? 'good' : 'neutral'}
          hint="Todo lo pendiente está en stock"
        />
        <Kpi
          label="Se puede alistar una parte"
          value={count('partial')}
          icon={PackageOpen}
          tone={count('partial') > 0 ? 'warning' : 'neutral'}
          hint="El consolidado autorizó despacho parcial"
        />
        <Kpi
          label="Esperan fabricación"
          value={count('waiting')}
          icon={Factory}
          tone={count('waiting') > 0 ? 'critical' : 'good'}
          hint="Falta producto y no se despachan por partes"
        />
      </div>

      {rows.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<CircleCheck />}
            title="No hay pedidos por alistar"
            description="Cuando el consolidado facture un pedido, aparecerá aquí para alistarlo y entregarlo a despacho."
          />
        </Panel>
      ) : (
        <ol className="flex flex-col gap-4">
          {rows.map((row) => (
            <OrderCard
              key={row.order.id}
              row={row}
              needs={needs}
              onSchedule={onSchedule}
              onPartial={() => {
                setPartial(row);
              }}
            />
          ))}
        </ol>
      )}

      {partial ? (
        <PartialDialog
          row={partial}
          onClose={() => {
            setPartial(null);
          }}
        />
      ) : null}
    </div>
  );
}

const READINESS: Record<
  Readiness,
  { tone: 'good' | 'warning' | 'critical'; icon: LucideIcon; label: string }
> = {
  complete: { tone: 'good', icon: CircleCheck, label: 'Todo disponible' },
  partial: { tone: 'warning', icon: PackageOpen, label: 'Disponible una parte' },
  waiting: { tone: 'critical', icon: Factory, label: 'Espera fabricación' },
};

function OrderCard({
  row,
  needs,
  onSchedule,
  onPartial,
}: {
  row: PrepOrder;
  needs: Map<string, PackagingNeed>;
  onSchedule: (target: ScheduleTarget) => void;
  onPartial: () => void;
}) {
  const { can } = useSession();
  const canPrepare = can('sales-orders:prepare');
  const { order } = row;
  const state = READINESS[readiness(row)];
  const prepare = useAction(() => api.post<SalesOrder>(`/v1/sales-orders/${order.id}/prepare`), {
    success: (result) => `${result.label} alistado y entregado a despacho`,
  });

  return (
    <li className="overflow-hidden rounded-[10px] border border-line bg-surface">
      <header className="flex flex-col gap-3 border-b border-line px-5 py-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {order.priority !== null ? (
              <span
                className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-brand px-1.5 text-[12.5px] font-semibold text-white tabular-nums"
                title="Prioridad que puso el consolidado"
              >
                {order.priority}
              </span>
            ) : null}
            <EntityLink to="order" id={order.id} className="text-[17px] font-semibold">
              {order.label}
            </EntityLink>
            <EntityLink to="customer" id={order.customer.id} className="font-medium">
              {order.customer.name}
            </EntityLink>
          </p>
          <p className="mt-1 text-[13px] text-ink-2">
            {order.branch.name}
            {order.branch.city ? `, ${order.branch.city}` : ''} · prometido{' '}
            <DueDate date={order.estimatedDeliveryDate} /> · {order.seller.name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone={state.tone} icon={state.icon}>
            {state.label}
          </Chip>
          {order.allowPartial ? (
            <Chip tone="neutral" icon={PackageOpen}>
              Permite parcial
            </Chip>
          ) : (
            <Chip tone="neutral" icon={Lock}>
              Solo completo
            </Chip>
          )}
          {order.status === 'PARTIAL' ? <OrderStatusChip status="PARTIAL" /> : null}
          {order.priority === null ? (
            <span className="text-[12.5px] text-ink-3">Sin prioridad</span>
          ) : null}
        </div>
      </header>

      <div className="hidden grid-cols-[minmax(0,1.5fr)_110px_120px_minmax(0,1.6fr)] gap-4 border-b border-line bg-surface-2/60 px-5 py-2 text-[12.5px] font-medium text-ink-2 md:grid">
        <span>Producto</span>
        <span className="text-right">Pendiente</span>
        <span className="text-right">Cubre el stock hoy</span>
        <span>Lo que falta</span>
      </div>
      <ul className="divide-y divide-line">
        {row.lines.map((line) => (
          <li
            key={line.productId}
            className="grid grid-cols-2 gap-x-4 gap-y-2 px-5 py-3 text-sm md:grid-cols-[minmax(0,1.5fr)_110px_120px_minmax(0,1.6fr)] md:items-start"
          >
            <span className="col-span-2 min-w-0 md:col-span-1">
              <EntityLink to="product" id={line.productId} className="font-medium">
                {line.name}
              </EntityLink>
              <span className="block text-[12.5px] text-ink-3">{line.code}</span>
            </span>
            <span className="md:text-right">
              <span className="block text-[12px] text-ink-3 md:hidden">Pendiente</span>
              <Qty value={line.pending} emphasis />
            </span>
            <span className="md:text-right">
              <span className="block text-[12px] text-ink-3 md:hidden">Cubre el stock hoy</span>
              <Qty
                value={line.available}
                dimZero
                className={cn(
                  compareDecimals(line.available.quantity, line.pending.quantity) >= 0 &&
                    'text-good',
                )}
              />
            </span>
            <span className="col-span-2 md:col-span-1">
              <Missing line={line} need={needs.get(line.productId)} onSchedule={onSchedule} />
            </span>
          </li>
        ))}
      </ul>

      {canPrepare ? (
        <footer className="flex flex-col gap-3 border-t border-line bg-surface-2/40 px-5 py-3 sm:flex-row sm:items-center sm:justify-end">
          {!row.complete ? (
            <p className="text-[13px] text-ink-2 sm:mr-auto">
              {order.allowPartial
                ? row.someAvailable
                  ? 'Puedes adelantar lo disponible; el resto sale cuando se fabrique.'
                  : 'Todavía no hay nada en stock para este pedido.'
                : 'Se despacha completo: espera a que se fabrique lo que falta.'}
            </p>
          ) : null}
          {order.allowPartial && row.someAvailable && !row.complete ? (
            <Button
              variant="secondary"
              icon={<PackageOpen className="size-4" />}
              onClick={onPartial}
            >
              Alistar lo disponible
            </Button>
          ) : null}
          <Button
            icon={<PackageCheck className="size-4" />}
            disabled={!row.complete}
            loading={prepare.isPending}
            onClick={() => {
              prepare.mutate(undefined);
            }}
          >
            Alistar y entregar a despacho
          </Button>
        </footer>
      ) : null}
    </li>
  );
}

/** The missing part of a line, tied to what plant is packaging (or to purchasing for resale goods). */
function Missing({
  line,
  need,
  onSchedule,
}: {
  line: PrepLine;
  need: PackagingNeed | undefined;
  onSchedule: (target: ScheduleTarget) => void;
}) {
  const { can } = useSession();
  if (!isPositive(line.missing.quantity)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-good">
        <CircleCheck aria-hidden className="size-3.5" />
        Completo en stock
      </span>
    );
  }
  const head = (
    <span className="block font-medium text-critical">
      Faltan <Qty value={line.missing} className="text-critical" />
    </span>
  );
  if (!need) {
    return (
      <span className="block text-[13px]">
        {head}
        <span className="mt-0.5 flex items-center gap-1 text-ink-2">
          <ShoppingCart aria-hidden className="size-3.5 text-ink-3" />
          {line.coverage?.status === 'SHORT'
            ? 'Compras debe conseguirlo'
            : 'Llega con lo que está en producción'}
        </span>
      </span>
    );
  }
  const toSchedule = isPositive(need.pendingToSchedule.quantity);
  const blocked =
    toSchedule && compareDecimals(need.canMakeNow.quantity, need.pendingToSchedule.quantity) < 0;
  return (
    <span className="block text-[13px]">
      {head}
      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-2">
        <span className="inline-flex items-center gap-1">
          <Factory aria-hidden className="size-3.5 text-ink-3" />
          Envasado programado <Qty value={need.planned} dimZero />
        </span>
        {toSchedule ? (
          <span className="inline-flex items-center gap-1 text-[#9a6a00]">
            Falta programar <Qty value={need.pendingToSchedule} />
          </span>
        ) : null}
        {toSchedule && can('production:write') ? (
          <Button
            size="sm"
            variant="secondary"
            icon={<CalendarPlus className="size-3.5" />}
            onClick={() => {
              onSchedule({
                product: need.product,
                kind: 'FINISHED_GOOD',
                suggested: need.pendingToSchedule,
              });
            }}
          >
            Programar envasado
          </Button>
        ) : null}
      </span>
      {blocked && need.limitingMaterial ? (
        <span className="mt-1 flex items-center gap-1 text-[12px] text-[#9a6a00]">
          <TriangleAlert aria-hidden className="size-3" />
          Lo limita{' '}
          <EntityLink to="product" id={need.limitingMaterial.id}>
            {need.limitingMaterial.name}
          </EntityLink>
        </span>
      ) : null}
    </span>
  );
}

/** Hand over part of the order: quantities prefilled with what today's stock covers. */
function PartialDialog({ row, onClose }: { row: PrepOrder; onClose: () => void }) {
  const { order } = row;
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      row.lines.map((line) => [line.productId, formatDecimal(line.available.quantity)]),
    ),
  );
  const parsed = row.lines.map((line) => {
    const raw = values[line.productId] ?? '';
    const quantity = raw.trim() === '' ? '0' : parseDecimalInput(raw);
    const tooMuch = quantity !== null && compareDecimals(quantity, line.pending.quantity) > 0;
    return { line, quantity, tooMuch };
  });
  const valid =
    parsed.every((item) => item.quantity !== null && !item.tooMuch) &&
    parsed.some((item) => item.quantity !== null && isPositive(item.quantity));

  const prepare = useAction(
    () =>
      api.post<SalesOrder>(`/v1/sales-orders/${order.id}/prepare`, {
        // Every line goes explicitly: a line left out would be handed over complete.
        lines: order.lines
          .filter((line) => isPositive(line.pending.quantity))
          .map((line) => ({
            productId: line.productId,
            quantity:
              parsed.find((item) => item.line.productId === line.productId)?.quantity ?? '0',
          })),
      }),
    { success: (result) => `${result.label}: lo disponible quedó entregado a despacho` },
  );

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`Alistar lo disponible · ${order.label}`}
      description={`${order.customer.name}. Lo que no entregues ahora queda pendiente y sale en otra guía cuando se fabrique.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            icon={<PackageOpen className="size-4" />}
            loading={prepare.isPending}
            disabled={!valid}
            onClick={() => {
              prepare.mutate(undefined, { onSuccess: onClose });
            }}
          >
            Entregar a despacho
          </Button>
        </>
      }
    >
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
        {parsed.map(({ line, quantity, tooMuch }) => (
          <li
            key={line.productId}
            className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_150px] sm:items-start"
          >
            <div className="min-w-0">
              <p className="font-medium">{line.name}</p>
              <p className="text-[12.5px] text-ink-3">
                {line.code} · pendiente <Qty value={line.pending} /> · cubre el stock{' '}
                <Qty value={line.available} dimZero />
              </p>
            </div>
            <Field
              label={`Entregar (${unitLabel(line.pending.unit)})`}
              error={
                quantity === null
                  ? 'Cantidad no válida.'
                  : tooMuch
                    ? `Máximo ${formatDecimal(line.pending.quantity)}.`
                    : undefined
              }
            >
              {(props) => (
                <Input
                  {...props}
                  inputMode="decimal"
                  value={values[line.productId] ?? ''}
                  onChange={(event) => {
                    const value = event.target.value;
                    setValues((current) => ({ ...current, [line.productId]: value }));
                  }}
                />
              )}
            </Field>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[13px] text-ink-3">
        {plural(
          parsed.filter((item) => item.quantity !== null && isPositive(item.quantity)).length,
          'producto sale',
          'productos salen',
        )}{' '}
        a despacho. Logística lo incluye en la próxima guía.
      </p>
    </Dialog>
  );
}
