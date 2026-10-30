import { CircleCheck, Factory, PackageOpen, Printer } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useOrderCoverage, useOrders } from '../../api/hooks';
import { useAccess } from '../../app/access';
import {
  DocumentToolbar,
  FilterBar,
  FilterField,
  type QueryColumn,
  QueryGrid,
  useWorkTab,
} from '../../components/erp';
import { EntityLink } from '../../components/links';
import { Chip, OrderStatusChip } from '../../components/status';
import { QueryView } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import {
  combineQueries,
  DateCell,
  INPUT,
  QtyTotal,
  QueryPanel,
  ScreenTitle,
  SELECT,
  useUrlFilters,
} from '../inventory/erp-kit';
import { buildPrepOrders, type PrepOrder, readiness, READINESS_LABEL } from './preparation';

const FILTERS = { q: '', estado: '', disponible: '' };

const READINESS_CHIP = {
  complete: { tone: 'good', icon: CircleCheck },
  partial: { tone: 'warning', icon: PackageOpen },
  waiting: { tone: 'critical', icon: Factory },
} as const;

/**
 * Plant's consultation: invoiced orders (and the rest of partially dispatched ones) to prepare, in the
 * consolidator's priority, with what today's stock covers. Enter opens the preparation document.
 */
export function PlantPage() {
  useWorkTab('Alistamiento de pedidos');
  const navigate = useNavigate();
  const { has } = useAccess();
  const orders = useOrders({ status: 'INVOICED,PARTIAL', limit: '500' });
  const coverage = useOrderCoverage();
  const filters = useUrlFilters(FILTERS);
  const { q, estado, disponible } = filters.applied;

  const all = useMemo(
    () => (orders.data && coverage.data ? buildPrepOrders(orders.data, coverage.data) : []),
    [orders.data, coverage.data],
  );
  const rows = useMemo(() => {
    const text = q.trim().toLowerCase();
    return all.filter(
      (row) =>
        (!estado || row.order.status === estado) &&
        (!disponible || readiness(row) === disponible) &&
        (!text ||
          `${row.order.label} ${row.order.customer.name} ${row.order.branch.city ?? ''} ${row.order.branch.name}`
            .toLowerCase()
            .includes(text)),
    );
  }, [all, q, estado, disponible]);
  const count = (kind: string) => all.filter((row) => readiness(row) === kind).length;

  const columns: QueryColumn<PrepOrder>[] = [
    {
      key: 'priority',
      header: 'Prior.',
      align: 'center',
      sort: (row) => row.order.priority ?? 9999,
      csv: (row) => row.order.priority ?? '',
      render: (row) =>
        row.order.priority !== null ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[12px] font-semibold text-white tabular-nums">
            {row.order.priority}
          </span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      key: 'order',
      header: 'Pedido',
      sort: (row) => row.order.label,
      csv: (row) => row.order.label,
      render: (row) => (
        <EntityLink to="order" id={row.order.id} className="font-medium">
          {row.order.label}
        </EntityLink>
      ),
    },
    {
      key: 'customer',
      header: 'Cliente',
      sort: (row) => row.order.customer.name,
      csv: (row) => row.order.customer.name,
      render: (row) => (
        <span className="block max-w-56 truncate" title={row.order.customer.name}>
          {row.order.customer.name}
        </span>
      ),
    },
    {
      key: 'branch',
      header: 'Entrega en',
      hideOnMobile: true,
      sort: (row) => row.order.branch.city ?? '',
      csv: (row) =>
        `${row.order.branch.name}${row.order.branch.city ? `, ${row.order.branch.city}` : ''}`,
      render: (row) => (
        <span className="block max-w-48 truncate text-ink-2">
          {row.order.branch.city ?? 'Sin ciudad'} · {row.order.branch.name}
        </span>
      ),
    },
    {
      key: 'promised',
      header: 'Prometido',
      sort: (row) => row.order.estimatedDeliveryDate ?? '9999',
      csv: (row) => row.order.estimatedDeliveryDate ?? '',
      render: (row) => (
        <DateCell date={row.order.estimatedDeliveryDate} pending lateLabel="Atrasado" />
      ),
    },
    {
      key: 'lines',
      header: 'Productos',
      align: 'right',
      sort: (row) => row.lines.length,
      csv: (row) => row.lines.length,
      render: (row) => row.lines.length,
      total: (list) => list.reduce((sum, row) => sum + row.lines.length, 0),
    },
    {
      key: 'pending',
      header: 'Pendiente',
      align: 'right',
      render: (row) => <QtyTotal values={row.lines.map((line) => line.pending)} />,
      total: (list) => (
        <QtyTotal values={list.flatMap((row) => row.lines.map((line) => line.pending))} />
      ),
    },
    {
      key: 'available',
      header: 'Cubierto hoy',
      align: 'right',
      render: (row) => <QtyTotal values={row.lines.map((line) => line.available)} />,
      total: (list) => (
        <QtyTotal values={list.flatMap((row) => row.lines.map((line) => line.available))} />
      ),
    },
    {
      key: 'readiness',
      header: 'Disponibilidad',
      sort: (row) => ['complete', 'partial', 'waiting'].indexOf(readiness(row)),
      csv: (row) => READINESS_LABEL[readiness(row)],
      render: (row) => {
        const kind = readiness(row);
        return (
          <Chip tone={READINESS_CHIP[kind].tone} icon={READINESS_CHIP[kind].icon}>
            {READINESS_LABEL[kind]}
          </Chip>
        );
      },
    },
    {
      key: 'partial',
      header: 'Desp. parcial',
      align: 'center',
      hideOnMobile: true,
      csv: (row) => (row.order.allowPartial ? 'Sí' : 'No'),
      render: (row) => (row.order.allowPartial ? 'Sí' : <span className="text-ink-3">No</span>),
    },
    {
      key: 'status',
      header: 'Estado',
      hideOnMobile: true,
      csv: (row) => row.order.statusLabel,
      render: (row) => <OrderStatusChip status={row.order.status} />,
    },
    {
      key: 'invoiced',
      header: 'Facturado',
      hideOnMobile: true,
      sort: (row) => row.order.invoicedAt ?? '',
      csv: (row) => row.order.invoicedAt ?? '',
      render: (row) => (
        <span className="text-ink-2">
          {formatDateTime(row.order.invoicedAt)}
          {row.order.invoicedBy ? (
            <span className="text-ink-3"> · {row.order.invoicedBy}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'seller',
      header: 'Vendedor',
      hideOnMobile: true,
      csv: (row) => row.order.seller.name,
      render: (row) => <span className="text-ink-2">{row.order.seller.name}</span>,
    },
  ];

  return (
    <>
      <DocumentToolbar
        actions={[
          {
            label: 'Órdenes de producción',
            icon: Factory,
            to: '/planta/produccion',
            hidden: !has('production'),
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
        title="Alistamiento de pedidos"
        subtitle="Pedidos facturados y saldos de despachos parciales, en el orden de prioridad del consolidado. Enter o doble clic abre el alistamiento."
      />
      <QueryPanel
        filters={
          <FilterBar
            onSubmit={() => {
              filters.apply();
            }}
          >
            <FilterField label="Pedido, cliente o ciudad" className="w-full sm:w-64">
              <input
                className={INPUT}
                value={filters.draft.q}
                onChange={(event) => {
                  filters.set('q', event.target.value);
                }}
              />
            </FilterField>
            <FilterField label="Estado">
              <select
                className={SELECT}
                value={filters.draft.estado}
                onChange={(event) => {
                  filters.set('estado', event.target.value);
                }}
              >
                <option value="">Todos</option>
                <option value="INVOICED">Facturados</option>
                <option value="PARTIAL">Despachados parcial</option>
              </select>
            </FilterField>
            <FilterField label="Disponibilidad">
              <select
                className={SELECT}
                value={filters.draft.disponible}
                onChange={(event) => {
                  filters.set('disponible', event.target.value);
                }}
              >
                <option value="">Todas ({all.length})</option>
                <option value="complete">Todo disponible ({count('complete')})</option>
                <option value="partial">Disponible una parte ({count('partial')})</option>
                <option value="waiting">Espera fabricación ({count('waiting')})</option>
              </select>
            </FilterField>
          </FilterBar>
        }
      >
        <QueryView query={combineQueries(orders, coverage)}>
          {() => (
            <QueryGrid<PrepOrder>
              title="Pedidos por alistar"
              exportName="pedidos-por-alistar"
              columns={columns}
              rows={rows}
              rowKey={(row) => row.order.id}
              onOpen={(row) => {
                void navigate(`/planta/alistar/${row.order.id}`);
              }}
              rowClassName={(row) => (readiness(row) === 'waiting' ? 'text-ink-2' : undefined)}
              empty="No hay pedidos por alistar con estos filtros. Cuando el consolidado facture un pedido, aparecerá aquí."
            />
          )}
        </QueryView>
      </QueryPanel>
    </>
  );
}
