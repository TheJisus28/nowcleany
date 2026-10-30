import { FilePlus2, PackageCheck, Printer, TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useProductionNeeds, useProductionOrders } from '../../api/hooks';
import type { BulkNeed, PackagingNeed, ProductionOrder } from '../../api/types';
import { useAccess } from '../../app/access';
import { useSession } from '../../auth/session';
import {
  DocumentToolbar,
  FilterBar,
  FilterField,
  type QueryColumn,
  QueryGrid,
  useWorkTab,
} from '../../components/erp';
import { EntityLink } from '../../components/links';
import { Qty } from '../../components/qty';
import { ProductionStatusChip } from '../../components/status';
import { QueryView } from '../../components/ui';
import { formatDateTime, formatDecimal, isZero, roundUpDecimal, unitLabel } from '../../lib/format';
import {
  csvQty,
  DateCell,
  inRange,
  INPUT,
  QtyTotal,
  QueryPanel,
  ScreenTitle,
  SELECT,
  TabStrip,
  useUrlFilters,
} from '../inventory/erp-kit';
import { compareDecimals } from './decimal';

type View = 'ordenes' | 'envasado' | 'granel';

const FILTERS = {
  vista: 'ordenes',
  estado: 'PLANNED',
  tipo: '',
  q: '',
  desde: '',
  hasta: '',
  mostrar: 'pendiente',
};

const STATUS_SORT = { PLANNED: 0, COMPLETED: 1, CANCELLED: 2 } as const;

/** Earliest delivery among the orders that ask for it: what the plant should do first. */
const firstDelivery = (need: PackagingNeed): string | null =>
  need.orders
    .map((order) => order.estimatedDeliveryDate)
    .filter((date): date is string => Boolean(date))
    .sort()[0] ?? null;

/**
 * Production consultations: production orders (bulk and packaging) and what is still to schedule for
 * the confirmed orders. Enter on a need opens a new production order with the quantity filled in.
 */
export function ProductionPage() {
  useWorkTab('Órdenes de producción');
  const navigate = useNavigate();
  const { can } = useSession();
  const { has } = useAccess();
  const canWrite = can('production:write');
  const filters = useUrlFilters(FILTERS);
  const { applied } = filters;
  const view = (
    ['ordenes', 'envasado', 'granel'].includes(applied.vista) ? applied.vista : 'ordenes'
  ) as View;
  const orders = useProductionOrders(applied.estado === 'ALL' ? undefined : applied.estado);
  const needs = useProductionNeeds();

  const orderRows = useMemo(() => {
    const text = applied.q.trim().toLowerCase();
    return (orders.data ?? [])
      .filter(
        (order) =>
          (!applied.tipo || order.product.type === applied.tipo) &&
          inRange(order.scheduledDate, applied.desde, applied.hasta) &&
          (!text ||
            `${order.label} ${order.product.code} ${order.product.name}`
              .toLowerCase()
              .includes(text)),
      )
      .sort(
        (a, b) =>
          STATUS_SORT[a.status] - STATUS_SORT[b.status] ||
          (a.scheduledDate ?? '9').localeCompare(b.scheduledDate ?? '9'),
      );
  }, [orders.data, applied.tipo, applied.desde, applied.hasta, applied.q]);

  const packRows = useMemo(
    () =>
      (needs.data?.packaging ?? [])
        .filter((need) => applied.mostrar === 'todo' || !isZero(need.pendingToSchedule.quantity))
        .map((need) => ({ need, first: firstDelivery(need) }))
        .sort((a, b) => (a.first ?? '9999').localeCompare(b.first ?? '9999')),
    [needs.data, applied.mostrar],
  );
  const bulkRows = useMemo(() => {
    const firstByProduct = new Map(
      (needs.data?.packaging ?? []).map((need) => [need.product.id, firstDelivery(need)]),
    );
    return (needs.data?.bulk ?? [])
      .filter((need) => applied.mostrar === 'todo' || !isZero(need.pendingToSchedule.quantity))
      .map((need) => ({
        need,
        first:
          need.usedBy
            .map((product) => firstByProduct.get(product.id) ?? null)
            .filter((date): date is string => Boolean(date))
            .sort()[0] ?? null,
      }))
      .sort((a, b) => (a.first ?? '9999').localeCompare(b.first ?? '9999'));
  }, [needs.data, applied.mostrar]);

  const pendingPack = needs.data?.packaging.filter(
    (need) => !isZero(need.pendingToSchedule.quantity),
  ).length;
  const pendingBulk = needs.data?.bulk.filter(
    (need) => !isZero(need.pendingToSchedule.quantity),
  ).length;

  const schedule = (need: PackagingNeed | BulkNeed) => {
    if (!canWrite || isZero(need.pendingToSchedule.quantity)) {
      void navigate(`/productos/${need.product.id}`);
      return;
    }
    const quantity = roundUpDecimal(need.pendingToSchedule.quantity);
    void navigate(`/planta/produccion/nueva?producto=${need.product.id}&cantidad=${quantity}`);
  };

  return (
    <>
      <DocumentToolbar
        actions={[
          {
            label: 'Nueva orden de producción',
            icon: FilePlus2,
            shortcut: 'F9',
            primary: true,
            hidden: !canWrite,
            to: '/planta/produccion/nueva',
          },
          {
            label: 'Alistamiento de pedidos',
            icon: PackageCheck,
            to: '/planta',
            hidden: !has('plant'),
          },
          {
            label: 'Imprimir',
            icon: Printer,
            shortcut: 'Ctrl+P',
            onClick: () => {
              window.print();
            },
          },
        ]}
      />
      <ScreenTitle
        title="Órdenes de producción"
        subtitle="Producción de granel por baches y envasado de producto terminado. Al terminarlas, el inventario descuenta los insumos de la fórmula vigente."
      />
      <TabStrip<View>
        label="Consulta"
        value={view}
        onChange={(value) => {
          filters.applyNow('vista', value);
        }}
        tabs={[
          { value: 'ordenes', label: 'Órdenes de producción' },
          { value: 'envasado', label: 'Necesidades de envasado', count: pendingPack },
          { value: 'granel', label: 'Necesidades de granel', count: pendingBulk },
        ]}
      />

      {view === 'ordenes' ? (
        <QueryPanel
          filters={
            <FilterBar
              onSubmit={() => {
                filters.apply();
              }}
            >
              <FilterField label="Estado">
                <select
                  className={SELECT}
                  value={filters.draft.estado}
                  onChange={(event) => {
                    filters.set('estado', event.target.value);
                  }}
                >
                  <option value="PLANNED">Programadas</option>
                  <option value="COMPLETED">Terminadas</option>
                  <option value="CANCELLED">Anuladas</option>
                  <option value="ALL">Todas</option>
                </select>
              </FilterField>
              <FilterField label="Tipo">
                <select
                  className={SELECT}
                  value={filters.draft.tipo}
                  onChange={(event) => {
                    filters.set('tipo', event.target.value);
                  }}
                >
                  <option value="">Todos</option>
                  <option value="BULK">Producción de granel</option>
                  <option value="FINISHED_GOOD">Envasado</option>
                </select>
              </FilterField>
              <FilterField label="Orden o producto" className="w-full sm:w-56">
                <input
                  className={INPUT}
                  value={filters.draft.q}
                  onChange={(event) => {
                    filters.set('q', event.target.value);
                  }}
                />
              </FilterField>
              <FilterField label="Programada desde">
                <input
                  type="date"
                  className={INPUT}
                  value={filters.draft.desde}
                  onChange={(event) => {
                    filters.set('desde', event.target.value);
                  }}
                />
              </FilterField>
              <FilterField label="Hasta">
                <input
                  type="date"
                  className={INPUT}
                  value={filters.draft.hasta}
                  onChange={(event) => {
                    filters.set('hasta', event.target.value);
                  }}
                />
              </FilterField>
            </FilterBar>
          }
        >
          <QueryView query={orders}>
            {() => (
              <QueryGrid<ProductionOrder>
                title="Órdenes de producción"
                columns={ORDER_COLUMNS}
                rows={orderRows}
                rowKey={(row) => row.id}
                onOpen={(row) => {
                  void navigate(`/planta/ordenes/${row.id}`);
                }}
                rowClassName={(row) => (row.status === 'CANCELLED' ? 'text-ink-3' : undefined)}
                empty="No hay órdenes de producción con estos filtros."
              />
            )}
          </QueryView>
        </QueryPanel>
      ) : (
        <QueryPanel
          filters={
            <FilterBar>
              <FilterField label="Mostrar">
                <select
                  className={SELECT}
                  value={filters.draft.mostrar}
                  onChange={(event) => {
                    filters.applyNow('mostrar', event.target.value);
                  }}
                >
                  <option value="pendiente">Solo lo que falta programar</option>
                  <option value="todo">Todo lo que piden los pedidos</option>
                </select>
              </FilterField>
              <p className="pb-1.5 text-[12.5px] text-ink-3">
                {canWrite
                  ? 'Enter o doble clic programa una orden con la cantidad que falta.'
                  : 'Solo lectura: planta programa las órdenes.'}
              </p>
            </FilterBar>
          }
        >
          <QueryView query={needs}>
            {() =>
              view === 'envasado' ? (
                <QueryGrid<PackRow>
                  title="Necesidades de envasado"
                  columns={PACK_COLUMNS}
                  rows={packRows}
                  rowKey={(row) => row.need.product.id}
                  onOpen={(row) => {
                    schedule(row.need);
                  }}
                  empty="Nada por envasar: el stock y lo programado cubren los pedidos confirmados."
                />
              ) : (
                <QueryGrid<BulkRow>
                  title="Necesidades de granel"
                  columns={BULK_COLUMNS}
                  rows={bulkRows}
                  rowKey={(row) => row.need.product.id}
                  onOpen={(row) => {
                    schedule(row.need);
                  }}
                  empty="Nada por producir: el granel en planta y lo programado alcanzan para envasar."
                />
              )
            }
          </QueryView>
        </QueryPanel>
      )}
    </>
  );
}

const ORDER_COLUMNS: QueryColumn<ProductionOrder>[] = [
  {
    key: 'label',
    header: 'Orden',
    sort: (row) => row.label,
    csv: (row) => row.label,
    render: (row) => (
      <EntityLink to="production-order" id={row.id} className="font-medium">
        {row.label}
      </EntityLink>
    ),
  },
  {
    key: 'kind',
    header: 'Tipo',
    sort: (row) => row.kind,
    csv: (row) => row.kind,
    render: (row) => row.kind,
  },
  {
    key: 'code',
    header: 'Código',
    sort: (row) => row.product.code,
    csv: (row) => row.product.code,
    render: (row) => <span className="tabular-nums">{row.product.code}</span>,
  },
  {
    key: 'product',
    header: 'Producto',
    sort: (row) => row.product.name,
    csv: (row) => row.product.name,
    render: (row) => (
      <EntityLink to="product" id={row.product.id}>
        {row.product.name}
      </EntityLink>
    ),
  },
  {
    key: 'planned',
    header: 'Planeado',
    align: 'right',
    sort: (row) => Number(row.plannedQuantity.quantity),
    csv: (row) => csvQty(row.plannedQuantity),
    render: (row) => <Qty value={row.plannedQuantity} />,
    total: (rows) => <QtyTotal values={rows.map((row) => row.plannedQuantity)} />,
  },
  {
    key: 'batches',
    header: 'Baches',
    align: 'right',
    hideOnMobile: true,
    csv: (row) => row.batches ?? '',
    render: (row) => row.batches ?? <span className="text-ink-3">—</span>,
  },
  {
    key: 'produced',
    header: 'Producido',
    align: 'right',
    csv: (row) => csvQty(row.producedQuantity),
    render: (row) =>
      row.producedQuantity ? (
        <Qty value={row.producedQuantity} />
      ) : (
        <span className="text-ink-3">—</span>
      ),
    total: (rows) => (
      <QtyTotal
        values={rows.flatMap((row) => (row.producedQuantity ? [row.producedQuantity] : []))}
      />
    ),
  },
  {
    key: 'scheduled',
    header: 'Programada',
    sort: (row) => row.scheduledDate ?? '9999',
    csv: (row) => row.scheduledDate ?? '',
    render: (row) => (
      <DateCell date={row.scheduledDate} pending={row.status === 'PLANNED'} lateLabel="Atrasada" />
    ),
  },
  {
    key: 'status',
    header: 'Estado',
    sort: (row) => STATUS_SORT[row.status],
    csv: (row) => row.statusLabel,
    render: (row) => <ProductionStatusChip status={row.status} />,
  },
  {
    key: 'createdBy',
    header: 'Elaboró',
    hideOnMobile: true,
    csv: (row) => row.createdBy,
    render: (row) => <span className="text-ink-2">{row.createdBy}</span>,
  },
  {
    key: 'completed',
    header: 'Terminada',
    hideOnMobile: true,
    sort: (row) => row.completedAt ?? '',
    csv: (row) => row.completedAt ?? '',
    render: (row) =>
      row.completedAt ? (
        <span className="text-ink-2">
          {formatDateTime(row.completedAt)}
          {row.completedBy ? <span className="text-ink-3"> · {row.completedBy}</span> : null}
        </span>
      ) : (
        <span className="text-ink-3">—</span>
      ),
  },
];

interface PackRow {
  need: PackagingNeed;
  first: string | null;
}

interface BulkRow {
  need: BulkNeed;
  first: string | null;
}

function CanMake({ need }: { need: PackagingNeed | BulkNeed }) {
  const blocked =
    !isZero(need.pendingToSchedule.quantity) &&
    compareDecimals(need.canMakeNow.quantity, need.pendingToSchedule.quantity) < 0;
  return (
    <span className={blocked ? 'text-[#9a6a00]' : undefined}>
      {blocked ? <TriangleAlert aria-hidden className="mr-1 inline size-3.5 align-[-2px]" /> : null}
      <Qty value={need.canMakeNow} dimZero />
    </span>
  );
}

function Limiting({ need }: { need: PackagingNeed | BulkNeed }) {
  const blocked =
    !isZero(need.pendingToSchedule.quantity) &&
    compareDecimals(need.canMakeNow.quantity, need.pendingToSchedule.quantity) < 0;
  return blocked && need.limitingMaterial ? (
    <EntityLink to="product" id={need.limitingMaterial.id}>
      {need.limitingMaterial.name}
    </EntityLink>
  ) : (
    <span className="text-ink-3">—</span>
  );
}

const PACK_COLUMNS: QueryColumn<PackRow>[] = [
  {
    key: 'code',
    header: 'Código',
    sort: (row) => row.need.product.code,
    csv: (row) => row.need.product.code,
    render: (row) => <span className="tabular-nums">{row.need.product.code}</span>,
  },
  {
    key: 'product',
    header: 'Producto terminado',
    sort: (row) => row.need.product.name,
    csv: (row) => row.need.product.name,
    render: (row) => (
      <EntityLink to="product" id={row.need.product.id}>
        {row.need.product.name}
      </EntityLink>
    ),
  },
  {
    key: 'first',
    header: 'Primera entrega',
    sort: (row) => row.first ?? '9999',
    csv: (row) => row.first ?? '',
    render: (row) => <DateCell date={row.first} pending lateLabel="Atrasada" />,
  },
  {
    key: 'orders',
    header: 'Pedidos',
    align: 'right',
    hideOnMobile: true,
    sort: (row) => row.need.orders.length,
    csv: (row) => row.need.orders.length,
    render: (row) => row.need.orders.length,
  },
  {
    key: 'demand',
    header: 'Demanda',
    align: 'right',
    hideOnMobile: true,
    csv: (row) => csvQty(row.need.demand),
    render: (row) => <Qty value={row.need.demand} />,
  },
  {
    key: 'onHand',
    header: 'En bodega',
    align: 'right',
    hideOnMobile: true,
    csv: (row) => csvQty(row.need.onHand),
    render: (row) => <Qty value={row.need.onHand} />,
  },
  {
    key: 'toPack',
    header: 'A envasar',
    align: 'right',
    csv: (row) => csvQty(row.need.toPack),
    render: (row) => <Qty value={row.need.toPack} />,
    total: (rows) => <QtyTotal values={rows.map((row) => row.need.toPack)} />,
  },
  {
    key: 'planned',
    header: 'Programado',
    align: 'right',
    csv: (row) => csvQty(row.need.planned),
    render: (row) => <Qty value={row.need.planned} dimZero />,
    total: (rows) => <QtyTotal values={rows.map((row) => row.need.planned)} />,
  },
  {
    key: 'pending',
    header: 'Falta programar',
    align: 'right',
    sort: (row) => Number(row.need.pendingToSchedule.quantity),
    csv: (row) => csvQty(row.need.pendingToSchedule),
    render: (row) => <Qty value={row.need.pendingToSchedule} emphasis dimZero />,
    total: (rows) => <QtyTotal values={rows.map((row) => row.need.pendingToSchedule)} />,
  },
  {
    key: 'canMake',
    header: 'Se puede hoy',
    align: 'right',
    csv: (row) => csvQty(row.need.canMakeNow),
    render: (row) => <CanMake need={row.need} />,
  },
  {
    key: 'limiting',
    header: 'Lo limita',
    hideOnMobile: true,
    csv: (row) => row.need.limitingMaterial?.name ?? '',
    render: (row) => <Limiting need={row.need} />,
  },
];

const BULK_COLUMNS: QueryColumn<BulkRow>[] = [
  {
    key: 'code',
    header: 'Código',
    sort: (row) => row.need.product.code,
    csv: (row) => row.need.product.code,
    render: (row) => <span className="tabular-nums">{row.need.product.code}</span>,
  },
  {
    key: 'product',
    header: 'Granel',
    sort: (row) => row.need.product.name,
    csv: (row) => row.need.product.name,
    render: (row) => (
      <EntityLink to="product" id={row.need.product.id}>
        {row.need.product.name}
      </EntityLink>
    ),
  },
  {
    key: 'first',
    header: 'Primera entrega',
    sort: (row) => row.first ?? '9999',
    csv: (row) => row.first ?? '',
    render: (row) => <DateCell date={row.first} pending lateLabel="Atrasada" />,
  },
  {
    key: 'required',
    header: 'Requerido',
    align: 'right',
    hideOnMobile: true,
    csv: (row) => csvQty(row.need.required),
    render: (row) => <Qty value={row.need.required} />,
  },
  {
    key: 'onHand',
    header: 'En bodega',
    align: 'right',
    hideOnMobile: true,
    csv: (row) => csvQty(row.need.onHand),
    render: (row) => <Qty value={row.need.onHand} />,
  },
  {
    key: 'toProduce',
    header: 'A producir',
    align: 'right',
    csv: (row) => csvQty(row.need.toProduce),
    render: (row) => <Qty value={row.need.toProduce} />,
    total: (rows) => <QtyTotal values={rows.map((row) => row.need.toProduce)} />,
  },
  {
    key: 'planned',
    header: 'Programado',
    align: 'right',
    csv: (row) => csvQty(row.need.planned),
    render: (row) => <Qty value={row.need.planned} dimZero />,
    total: (rows) => <QtyTotal values={rows.map((row) => row.need.planned)} />,
  },
  {
    key: 'pending',
    header: 'Falta programar',
    align: 'right',
    sort: (row) => Number(row.need.pendingToSchedule.quantity),
    csv: (row) => csvQty(row.need.pendingToSchedule),
    render: (row) => <Qty value={row.need.pendingToSchedule} emphasis dimZero />,
    total: (rows) => <QtyTotal values={rows.map((row) => row.need.pendingToSchedule)} />,
  },
  {
    key: 'batches',
    header: 'Baches',
    align: 'right',
    csv: (row) => row.need.batchesPending ?? '',
    render: (row) =>
      row.need.batchesPending ? (
        <span
          title={
            row.need.batchCapacity
              ? `Bache de ${formatDecimal(row.need.batchCapacity.quantity)} ${unitLabel(row.need.batchCapacity.unit)}`
              : undefined
          }
        >
          {row.need.batchesPending}
        </span>
      ) : (
        <span className="text-ink-3">—</span>
      ),
    total: (rows) => rows.reduce((sum, row) => sum + (row.need.batchesPending ?? 0), 0),
  },
  {
    key: 'canMake',
    header: 'Se puede hoy',
    align: 'right',
    csv: (row) => csvQty(row.need.canMakeNow),
    render: (row) => <CanMake need={row.need} />,
  },
  {
    key: 'limiting',
    header: 'Lo limita',
    hideOnMobile: true,
    csv: (row) => row.need.limitingMaterial?.name ?? '',
    render: (row) => <Limiting need={row.need} />,
  },
  {
    key: 'usedBy',
    header: 'Para envasar',
    hideOnMobile: true,
    csv: (row) => row.need.usedBy.map((product) => product.code).join(', '),
    render: (row) => (
      <span className="flex flex-wrap gap-x-2 text-[12.5px] text-ink-2">
        {row.need.usedBy.slice(0, 4).map((product) => (
          <EntityLink key={product.id} to="product" id={product.id}>
            <span title={product.name}>{product.code}</span>
          </EntityLink>
        ))}
        {row.need.usedBy.length > 4 ? (
          <span className="text-ink-3">+{row.need.usedBy.length - 4}</span>
        ) : null}
      </span>
    ),
  },
];
