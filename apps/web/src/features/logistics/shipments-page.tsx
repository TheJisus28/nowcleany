import { CircleCheck, FilePlus2, PackageOpen, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useOrders, useShipments } from '../../api/hooks';
import type { SalesOrder, Shipment } from '../../api/types';
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
import { Chip, ShipmentStatusChip } from '../../components/status';
import { QueryView } from '../../components/ui';
import { formatDateTime, isZero } from '../../lib/format';
import {
  DateCell,
  inRange,
  INPUT,
  localDay,
  QtyTotal,
  QueryPanel,
  ScreenTitle,
  SELECT,
  useUrlFilters,
} from '../inventory/erp-kit';
import { Plate } from './plate';

/** The order goes without part of what is still pending (plant handed over only what existed). */
export function isPartialReady(order: SalesOrder): boolean {
  return order.lines.some((line) => line.ready.quantity !== line.pending.quantity);
}

const byPriority = (a: SalesOrder, b: SalesOrder) =>
  (a.priority ?? 9999) - (b.priority ?? 9999) ||
  (a.estimatedDeliveryDate ?? '9').localeCompare(b.estimatedDeliveryDate ?? '9');

const FILTERS = { estado: 'PLANNED,IN_TRANSIT', desde: '', hasta: '', q: '' };

/**
 * Logistics' consultations: orders handed over by plant waiting for a vehicle (select them and press
 * F9 to build the shipping guide) and the guides by status.
 */
export function ShipmentsPage() {
  useWorkTab('Remisiones y guías');
  const navigate = useNavigate();
  const { can } = useSession();
  const { canOpen } = useAccess();
  const canWrite = can('shipments:write');
  const ready = useOrders({ status: 'READY', limit: '500' });
  const shipments = useShipments({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const filters = useUrlFilters(FILTERS);
  const { estado, desde, hasta, q } = filters.applied;

  const readyRows = useMemo(() => [...(ready.data ?? [])].sort(byPriority), [ready.data]);
  const chosen = readyRows.filter((order) => selected.has(order.id));
  const guideRows = useMemo(() => {
    const statuses = estado ? estado.split(',') : [];
    const text = q.trim().toLowerCase();
    return (shipments.data ?? [])
      .filter(
        (row) =>
          (statuses.length === 0 || statuses.includes(row.status)) &&
          inRange(row.scheduledDate, desde, hasta) &&
          (!text ||
            [
              row.label,
              row.vehiclePlate,
              row.driverName,
              row.carrier,
              row.route ?? '',
              ...row.orders.map((order) => `${order.orderLabel} ${order.customer.name}`),
            ]
              .join(' ')
              .toLowerCase()
              .includes(text)),
      )
      .sort((a, b) => b.label.localeCompare(a.label));
  }, [shipments.data, estado, desde, hasta, q]);

  const newGuide = () => {
    void navigate(
      chosen.length > 0
        ? `/logistica/nueva?pedidos=${chosen.map((order) => order.id).join(',')}`
        : '/logistica/nueva',
    );
  };

  const readyColumns: QueryColumn<SalesOrder>[] = [
    {
      key: 'priority',
      header: 'Prior.',
      align: 'center',
      sort: (row) => row.priority ?? 9999,
      csv: (row) => row.priority ?? '',
      render: (row) => row.priority ?? <span className="text-ink-3">—</span>,
    },
    {
      key: 'order',
      header: 'Pedido',
      sort: (row) => row.label,
      csv: (row) => row.label,
      render: (row) => (
        <EntityLink to="order" id={row.id} className="font-medium">
          {row.label}
        </EntityLink>
      ),
    },
    {
      key: 'customer',
      header: 'Cliente',
      sort: (row) => row.customer.name,
      csv: (row) => row.customer.name,
      render: (row) => (
        <span className="block max-w-56 truncate" title={row.customer.name}>
          {row.customer.name}
        </span>
      ),
    },
    {
      key: 'city',
      header: 'Ciudad',
      sort: (row) => row.branch.city ?? '',
      csv: (row) => row.branch.city ?? '',
      render: (row) => row.branch.city ?? <span className="text-ink-3">Sin ciudad</span>,
    },
    {
      key: 'branch',
      header: 'Sucursal / dirección',
      hideOnMobile: true,
      csv: (row) => `${row.branch.name}${row.branch.address ? ` · ${row.branch.address}` : ''}`,
      render: (row) => (
        <span
          className="block max-w-64 truncate text-ink-2"
          title={row.branch.address ?? undefined}
        >
          {row.branch.name}
          {row.branch.address ? ` · ${row.branch.address}` : ''}
        </span>
      ),
    },
    {
      key: 'products',
      optional: true,
      header: 'Productos',
      align: 'right',
      csv: (row) => row.lines.filter((line) => !isZero(line.ready.quantity)).length,
      render: (row) => row.lines.filter((line) => !isZero(line.ready.quantity)).length,
    },
    {
      key: 'ready',
      header: 'Cantidad lista',
      align: 'right',
      render: (row) => (
        <QtyTotal
          values={row.lines
            .filter((line) => !isZero(line.ready.quantity))
            .map((line) => line.ready)}
        />
      ),
      total: (rows) => (
        <QtyTotal
          values={rows.flatMap((row) =>
            row.lines.filter((line) => !isZero(line.ready.quantity)).map((line) => line.ready),
          )}
        />
      ),
    },
    {
      key: 'kind',
      header: 'Despacho',
      csv: (row) => (isPartialReady(row) ? 'Parcial' : 'Completo'),
      render: (row) =>
        isPartialReady(row) ? (
          <Chip tone="warning" icon={PackageOpen}>
            Parcial
          </Chip>
        ) : (
          <Chip tone="good" icon={CircleCheck}>
            Completo
          </Chip>
        ),
    },
    {
      key: 'promised',
      header: 'Prometido',
      sort: (row) => row.estimatedDeliveryDate ?? '9999',
      csv: (row) => row.estimatedDeliveryDate ?? '',
      render: (row) => <DateCell date={row.estimatedDeliveryDate} pending lateLabel="Atrasado" />,
    },
    {
      key: 'readyAt',
      header: 'Alistado',
      hideOnMobile: true,
      sort: (row) => row.readyAt ?? '',
      csv: (row) => row.readyAt ?? '',
      render: (row) => (
        <span className="text-ink-2">
          {formatDateTime(row.readyAt)}
          {row.readyBy ? <span className="text-ink-3"> · {row.readyBy}</span> : null}
        </span>
      ),
    },
  ];

  return (
    <>
      <DocumentToolbar
        actions={[
          {
            label:
              chosen.length > 0
                ? `Nueva remisión con ${String(chosen.length)} pedido${chosen.length === 1 ? '' : 's'}`
                : 'Nueva remisión',
            icon: FilePlus2,
            shortcut: 'F9',
            primary: true,
            hidden: !canWrite,
            onClick: newGuide,
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
        title="Remisiones y guías de despacho"
        subtitle="Marca los pedidos que van en el mismo vehículo y pulsa F9 para armar la remisión. El stock baja cuando se despacha."
      />

      <QueryPanel
        title="Pedidos por despachar"
        description="Alistados por planta y entregados a despacho, por prioridad."
      >
        <QueryView query={ready}>
          {() => (
            <QueryGrid<SalesOrder>
              title="Pedidos por despachar"
              columns={readyColumns}
              rows={readyRows}
              rowKey={(row) => row.id}
              selectable={canWrite}
              selected={selected}
              onSelectedChange={setSelected}
              {...(canOpen('order')
                ? {
                    onOpen: (row: SalesOrder) => {
                      void navigate(`/ventas/${row.id}`);
                    },
                  }
                : {})}
              empty="No hay pedidos esperando vehículo. Cuando planta entregue un pedido a despacho, aparecerá aquí."
            />
          )}
        </QueryView>
      </QueryPanel>

      <QueryPanel
        title="Remisiones"
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
                <option value="PLANNED,IN_TRANSIT">Por despachar y en ruta</option>
                <option value="PLANNED">Por despachar</option>
                <option value="IN_TRANSIT">En ruta</option>
                <option value="DELIVERED">Entregadas</option>
                <option value="">Todas</option>
              </select>
            </FilterField>
            <FilterField label="Salida desde">
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
            <FilterField label="Número, placa, conductor o cliente" className="w-full sm:w-64">
              <input
                className={INPUT}
                value={filters.draft.q}
                onChange={(event) => {
                  filters.set('q', event.target.value);
                }}
              />
            </FilterField>
          </FilterBar>
        }
      >
        <QueryView query={shipments}>
          {() => (
            <QueryGrid<Shipment>
              title="Remisiones"
              columns={GUIDE_COLUMNS}
              rows={guideRows}
              rowKey={(row) => row.id}
              onOpen={(row) => {
                void navigate(`/logistica/guias/${row.id}`);
              }}
              empty="No hay remisiones con estos filtros."
            />
          )}
        </QueryView>
      </QueryPanel>
    </>
  );
}

const GUIDE_COLUMNS: QueryColumn<Shipment>[] = [
  {
    key: 'label',
    header: 'Número',
    sort: (row) => row.label,
    csv: (row) => row.label,
    render: (row) => (
      <EntityLink to="shipment" id={row.id} className="font-medium">
        {row.label}
      </EntityLink>
    ),
  },
  {
    key: 'date',
    header: 'Salida',
    sort: (row) => row.scheduledDate,
    csv: (row) => row.scheduledDate,
    render: (row) => (
      <DateCell
        date={row.scheduledDate}
        pending={row.status === 'PLANNED'}
        lateLabel="Debió salir"
      />
    ),
  },
  {
    key: 'status',
    header: 'Estado',
    sort: (row) => ['PLANNED', 'IN_TRANSIT', 'DELIVERED'].indexOf(row.status),
    csv: (row) => row.statusLabel,
    render: (row) => <ShipmentStatusChip status={row.status} />,
  },
  {
    key: 'plate',
    header: 'Placa',
    sort: (row) => row.vehiclePlate,
    csv: (row) => row.vehiclePlate,
    render: (row) => <Plate plate={row.vehiclePlate} />,
  },
  {
    key: 'driver',
    header: 'Conductor',
    sort: (row) => row.driverName,
    csv: (row) => row.driverName,
    render: (row) => row.driverName,
  },
  {
    key: 'carrier',
    header: 'Transportador',
    hideOnMobile: true,
    csv: (row) => row.carrier,
    render: (row) => <span className="text-ink-2">{row.carrier}</span>,
  },
  {
    key: 'route',
    header: 'Ruta',
    hideOnMobile: true,
    csv: (row) => row.route ?? '',
    render: (row) => (
      <span className="block max-w-56 truncate text-ink-2" title={row.route ?? undefined}>
        {row.route ?? '—'}
      </span>
    ),
  },
  {
    key: 'orders',
    header: 'Pedidos',
    align: 'right',
    sort: (row) => row.orders.length,
    csv: (row) => row.orders.length,
    render: (row) => row.orders.length,
    total: (rows) => rows.reduce((sum, row) => sum + row.orders.length, 0),
  },
  {
    key: 'delivered',
    header: 'Entregados',
    align: 'right',
    csv: (row) => row.orders.filter((order) => order.deliveredAt).length,
    render: (row) => {
      const delivered = row.orders.filter((order) => order.deliveredAt).length;
      return (
        <span className={delivered === row.orders.length ? 'text-good' : undefined}>
          {delivered} de {row.orders.length}
        </span>
      );
    },
    total: (rows) =>
      rows.reduce((sum, row) => sum + row.orders.filter((order) => order.deliveredAt).length, 0),
  },
  {
    key: 'dispatched',
    header: 'Despachada',
    hideOnMobile: true,
    sort: (row) => row.dispatchedAt ?? '',
    csv: (row) => row.dispatchedAt ?? '',
    render: (row) => <span className="text-ink-2">{formatDateTime(row.dispatchedAt)}</span>,
  },
  {
    key: 'deliveredAt',
    header: 'Entregada',
    hideOnMobile: true,
    sort: (row) => row.deliveredAt ?? '',
    csv: (row) => (row.deliveredAt ? localDay(row.deliveredAt) : ''),
    render: (row) => <span className="text-ink-2">{formatDateTime(row.deliveredAt)}</span>,
  },
  {
    key: 'createdBy',
    optional: true,
    header: 'Elaboró',
    hideOnMobile: true,
    csv: (row) => row.createdBy,
    render: (row) => <span className="text-ink-2">{row.createdBy}</span>,
  },
];
