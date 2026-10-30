import { FilePlus2 } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useOrderCoverage, useOrders, useSellers } from '../../api/hooks';
import type { SalesOrder } from '../../api/types';
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
import { COVERAGE, CoverageChip, DueDate, OrderStatusChip } from '../../components/status';
import { QueryView } from '../../components/ui';
import { formatDate, todayIso } from '../../lib/format';
import { colombiaDay, formatUnits, normalizeText, sumQuantities } from '../billing/billing-format';
import { FILTER_INPUT, ScreenTitle, useQueryFilters } from '../billing/erp-kit';
import { COMMITTED, ORDER_STATUS_OPTIONS, statusesFor } from './order-shared';

const unitsOf = (order: SalesOrder) =>
  sumQuantities(order.lines.map((line) => line.quantity.quantity));

/** "Pedidos": consultation of sales orders by date, status, seller, customer and number. */
export function OrdersPage() {
  const navigate = useNavigate();
  const { can } = useSession();
  const { has } = useAccess();
  const seesAll = can('sales-orders:read-all');
  useWorkTab('Pedidos');

  const filters = useQueryFilters({
    desde: todayIso(-60),
    hasta: todayIso(),
    estado: 'open',
    vendedor: '',
    cliente: '',
    numero: '',
  });
  const { applied, draft, set } = filters;
  const sellers = useSellers(seesAll && can('customers:read'));
  const orders = useOrders({ status: statusesFor(applied.estado), limit: '500' });
  const coverage = useOrderCoverage(can('planning:read'));
  const coverageByOrder = useMemo(
    () => new Map((coverage.data ?? []).map((row) => [row.orderId, row.status])),
    [coverage.data],
  );

  const { desde, hasta, vendedor, cliente, numero } = applied;
  const rows = useMemo(() => {
    const customer = normalizeText(cliente.trim());
    const number = normalizeText(numero.trim());
    return (orders.data ?? []).filter((row) => {
      const day = colombiaDay(row.createdAt);
      return (
        (!desde || day >= desde) &&
        (!hasta || day <= hasta) &&
        (!vendedor || row.seller.id === vendedor) &&
        (!customer ||
          normalizeText(`${row.customer.name} ${row.customer.documentNumber}`).includes(
            customer,
          )) &&
        (!number || normalizeText(row.label).includes(number))
      );
    });
  }, [orders.data, desde, hasta, vendedor, cliente, numero]);

  const columns: QueryColumn<SalesOrder>[] = [
    {
      key: 'number',
      header: 'Número',
      render: (row) => (
        <EntityLink to="order" id={row.id} className="font-medium">
          {row.label}
        </EntityLink>
      ),
      sort: (row) => Number(row.number),
      csv: (row) => row.label,
    },
    {
      key: 'date',
      header: 'Fecha',
      render: (row) => (
        <span className="whitespace-nowrap">{formatDate(colombiaDay(row.createdAt))}</span>
      ),
      sort: (row) => row.createdAt,
      csv: (row) => colombiaDay(row.createdAt),
    },
    {
      key: 'customer',
      header: 'Cliente',
      render: (row) => (
        <EntityLink to="customer" id={row.customer.id}>
          {row.customer.name}
        </EntityLink>
      ),
      sort: (row) => row.customer.name,
      csv: (row) => row.customer.name,
    },
    {
      key: 'document',
      header: 'NIT / C.C.',
      className: 'tabular-nums text-ink-2',
      hideOnMobile: true,
      render: (row) => row.customer.documentNumber,
      csv: (row) => row.customer.documentNumber,
    },
    {
      key: 'branch',
      header: 'Sucursal',
      hideOnMobile: true,
      render: (row) => row.branch.name,
      sort: (row) => row.branch.name,
      csv: (row) => row.branch.name,
    },
    {
      key: 'seller',
      header: 'Vendedor',
      hideOnMobile: true,
      render: (row) => row.seller.name,
      sort: (row) => row.seller.name,
      csv: (row) => row.seller.name,
    },
    {
      key: 'promised',
      header: 'Fecha prometida',
      render: (row) =>
        COMMITTED.includes(row.status) || row.status === 'DRAFT' ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            {formatDate(row.estimatedDeliveryDate)}
            <span className="text-[12px]">
              <DueDate date={row.estimatedDeliveryDate} lateLabel="Atrasado" />
            </span>
          </span>
        ) : (
          <span className="whitespace-nowrap">{formatDate(row.estimatedDeliveryDate)}</span>
        ),
      sort: (row) => row.estimatedDeliveryDate ?? '9999-12-31',
      csv: (row) => row.estimatedDeliveryDate ?? '',
    },
    {
      key: 'status',
      header: 'Estado',
      render: (row) => <OrderStatusChip status={row.status} />,
      sort: (row) => row.statusLabel,
      csv: (row) => row.statusLabel,
    },
    {
      key: 'units',
      header: 'Unidades',
      align: 'right',
      render: (row) => formatUnits(unitsOf(row)),
      sort: unitsOf,
      csv: (row) => formatUnits(unitsOf(row)),
      total: (rows) => formatUnits(rows.reduce((sum, row) => sum + unitsOf(row), 0)),
    },
    ...(can('planning:read')
      ? [
          {
            key: 'coverage',
            header: 'Cobertura',
            hideOnMobile: true,
            render: (row: SalesOrder) => {
              const status = coverageByOrder.get(row.id);
              return status ? (
                <CoverageChip status={status} />
              ) : (
                <span className="text-ink-3">—</span>
              );
            },
            sort: (row: SalesOrder) => coverageByOrder.get(row.id) ?? '',
            csv: (row: SalesOrder) => {
              const status = coverageByOrder.get(row.id);
              return status ? COVERAGE[status].label : '';
            },
          },
        ]
      : []),
  ];

  return (
    <>
      <DocumentToolbar
        actions={[
          {
            label: 'Nuevo pedido',
            icon: FilePlus2,
            to: '/ventas/nueva',
            primary: true,
            hidden: !(can('sales-orders:write') && has('newOrder')),
          },
        ]}
      />
      <ScreenTitle
        title="Pedidos"
        description="Pedidos de venta (preventas) con su estado en el flujo y si el stock los cubre. Enter o doble clic abre el pedido."
      />
      <FilterBar onSubmit={filters.submit}>
        <FilterField label="Desde">
          <input
            type="date"
            value={draft.desde}
            onChange={(event) => {
              set('desde', event.target.value);
            }}
            className={FILTER_INPUT}
          />
        </FilterField>
        <FilterField label="Hasta">
          <input
            type="date"
            value={draft.hasta}
            onChange={(event) => {
              set('hasta', event.target.value);
            }}
            className={FILTER_INPUT}
          />
        </FilterField>
        <FilterField label="Estado">
          <select
            value={draft.estado}
            onChange={(event) => {
              set('estado', event.target.value);
            }}
            className={FILTER_INPUT}
          >
            {ORDER_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FilterField>
        {seesAll ? (
          <FilterField label="Vendedor">
            <select
              value={draft.vendedor}
              onChange={(event) => {
                set('vendedor', event.target.value);
              }}
              className={FILTER_INPUT}
            >
              <option value="">Todos</option>
              {(sellers.data ?? []).map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.name}
                </option>
              ))}
            </select>
          </FilterField>
        ) : null}
        <FilterField label="Cliente (nombre o NIT)">
          <input
            value={draft.cliente}
            onChange={(event) => {
              set('cliente', event.target.value);
            }}
            className={`${FILTER_INPUT} w-52`}
          />
        </FilterField>
        <FilterField label="Número">
          <input
            value={draft.numero}
            placeholder="PV-00031"
            onChange={(event) => {
              set('numero', event.target.value);
            }}
            className={`${FILTER_INPUT} w-28`}
          />
        </FilterField>
      </FilterBar>
      <QueryView query={orders}>
        {() => (
          <QueryGrid
            title="Pedidos"
            exportName="pedidos"
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            initialSort={{ key: 'number', direction: 'desc' }}
            onOpen={(row) => {
              void navigate(`/ventas/${row.id}`);
            }}
            empty="No hay pedidos con estos filtros. Amplía el rango de fechas o cambia el estado."
          />
        )}
      </QueryView>
    </>
  );
}
