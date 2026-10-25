import { ClipboardList, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useOrderCoverage, useOrders } from '../../api/hooks';
import type { SalesOrder } from '../../api/types';
import { useProfile, useSession } from '../../auth/session';
import { DataTable } from '../../components/data-table';
import { CoverageChip, OrderStatusChip } from '../../components/status';
import { EmptyState, Input, PageHeader, Panel, QueryView, Segmented } from '../../components/ui';
import { formatDate, formatDecimal, relativeDays, unitLabel } from '../../lib/format';

const STATUS_FILTERS = [
  { value: 'open', label: 'Abiertas', status: 'DRAFT,CONFIRMED' },
  { value: 'dispatched', label: 'Despachadas', status: 'DISPATCHED' },
  { value: 'cancelled', label: 'Anuladas', status: 'CANCELLED' },
  { value: 'all', label: 'Todas', status: undefined },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]['value'];

export function OrdersPage() {
  const profile = useProfile();
  const { can } = useSession();
  const navigate = useNavigate();
  const [scope, setScope] = useState<'mine' | 'team'>(
    profile.roles.includes('sales') ? 'mine' : 'team',
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [search, setSearch] = useState('');

  const orders = useOrders({
    mine: scope === 'mine' ? true : undefined,
    status: STATUS_FILTERS.find((filter) => filter.value === statusFilter)?.status,
    q: search.trim() || undefined,
  });
  const coverage = useOrderCoverage(can('planning:read'));
  const coverageByOrder = useMemo(
    () => new Map((coverage.data ?? []).map((row) => [row.orderId, row.status])),
    [coverage.data],
  );

  return (
    <>
      <PageHeader
        title="Ventas"
        description="Preventas del equipo y si se pueden cumplir con lo que hay o se puede fabricar."
        actions={
          can('sales-orders:write') ? (
            <Link
              to="/ventas/nueva"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand-strong"
            >
              <Plus aria-hidden className="size-4" />
              Nueva preventa
            </Link>
          ) : null
        }
      />

      <Panel flush>
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <Segmented
              label="Vendedor"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'mine', label: 'Mis preventas' },
                { value: 'team', label: 'Todo el equipo' },
              ]}
            />
            <Segmented
              label="Estado"
              value={statusFilter}
              onChange={setStatusFilter}
              options={STATUS_FILTERS}
            />
          </div>
          <label className="relative block md:w-72">
            <span className="sr-only">Buscar preventa o cliente</span>
            <Search
              aria-hidden
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
            />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
              placeholder="PV-00012 o cliente"
              className="pl-9"
            />
          </label>
        </div>

        <QueryView query={orders}>
          {(rows) => (
            <DataTable<SalesOrder>
              label="Preventas"
              rows={rows}
              rowKey={(row) => row.id}
              onRowClick={(row) => {
                void navigate(`/ventas/${row.id}`);
              }}
              empty={
                <EmptyState
                  icon={<ClipboardList />}
                  title="No hay preventas con estos filtros"
                  description={
                    can('sales-orders:write')
                      ? 'Registra una preventa nueva para empezar.'
                      : undefined
                  }
                />
              }
              columns={[
                {
                  key: 'label',
                  header: 'Preventa',
                  render: (row) => (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{row.label}</span>
                      <span className="md:hidden">
                        <OrderStatusChip status={row.status} />
                      </span>
                    </span>
                  ),
                },
                { key: 'customer', header: 'Cliente', render: (row) => row.customer.name },
                {
                  key: 'seller',
                  header: 'Vendedor',
                  render: (row) => row.seller.name,
                  hideOnMobile: true,
                },
                {
                  key: 'delivery',
                  header: 'Entrega',
                  render: (row) => (
                    <span title={formatDate(row.estimatedDeliveryDate)}>
                      {row.status === 'DRAFT' || row.status === 'CONFIRMED'
                        ? relativeDays(row.estimatedDeliveryDate)
                        : formatDate(row.estimatedDeliveryDate)}
                    </span>
                  ),
                },
                {
                  key: 'products',
                  header: 'Productos',
                  hideOnMobile: true,
                  render: (row) => (
                    <span className="text-ink-2">
                      {row.lines
                        .map(
                          (line) =>
                            `${line.productCode} × ${formatDecimal(line.quantity.quantity)} ${unitLabel(line.quantity.unit)}`,
                        )
                        .join(', ')}
                    </span>
                  ),
                },
                {
                  key: 'status',
                  header: 'Estado',
                  hideOnMobile: true,
                  render: (row) => <OrderStatusChip status={row.status} />,
                },
                {
                  key: 'coverage',
                  header: 'Cobertura',
                  render: (row) => {
                    const status = coverageByOrder.get(row.id);
                    return status ? (
                      <CoverageChip status={status} />
                    ) : (
                      <span className="text-ink-3">—</span>
                    );
                  },
                },
              ]}
            />
          )}
        </QueryView>
      </Panel>
    </>
  );
}
