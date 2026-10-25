import { ClipboardList, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useCustomer, useOrderCoverage, useOrders } from '../../api/hooks';
import type { Customer, SalesOrder } from '../../api/types';
import { useSession } from '../../auth/session';
import { DataTable } from '../../components/data-table';
import { BackLink, EntityLink, pathTo } from '../../components/links';
import { CoverageChip, DueDate, OrderStatusChip } from '../../components/status';
import { EmptyState, PageHeader, Panel, QueryView } from '../../components/ui';
import { formatDate, formatDecimal, unitLabel } from '../../lib/format';

export function CustomerPage() {
  const { id } = useParams();
  const customer = useCustomer(id);
  return <QueryView query={customer}>{(data) => <CustomerView customer={data} />}</QueryView>;
}

function CustomerView({ customer }: { customer: Customer }) {
  const navigate = useNavigate();
  const { can } = useSession();
  const orders = useOrders({ customerId: customer.id, limit: '200' });
  const coverage = useOrderCoverage(can('planning:read'));
  const coverageByOrder = useMemo(
    () => new Map((coverage.data ?? []).map((row) => [row.orderId, row.status])),
    [coverage.data],
  );
  const details = [
    customer.taxId ? `NIT ${customer.taxId}` : null,
    customer.city,
    customer.phone,
  ].filter(Boolean);

  return (
    <>
      <BackLink fallback="/clientes" label="Clientes" />
      <PageHeader
        title={customer.name}
        description={details.join(' · ') || undefined}
        actions={
          can('sales-orders:write') ? (
            <Link
              to={`/ventas/nueva?cliente=${customer.id}`}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand-strong"
            >
              <Plus aria-hidden className="size-4" />
              Nueva preventa
            </Link>
          ) : null
        }
      />
      <Panel title="Preventas" description="Las más recientes primero." flush>
        <QueryView query={orders}>
          {(rows) => (
            <DataTable<SalesOrder>
              label="Preventas del cliente"
              rows={rows}
              rowKey={(row) => row.id}
              onRowClick={(row) => {
                void navigate(pathTo('order', row.id));
              }}
              empty={
                <EmptyState icon={<ClipboardList />} title="Este cliente no tiene preventas" />
              }
              columns={[
                {
                  key: 'order',
                  header: 'Preventa',
                  render: (row) => (
                    <EntityLink to="order" id={row.id} className="font-medium">
                      {row.label}
                    </EntityLink>
                  ),
                },
                {
                  key: 'seller',
                  header: 'Vendedor',
                  hideOnMobile: true,
                  render: (row) => row.seller.name,
                },
                {
                  key: 'delivery',
                  header: 'Entrega',
                  render: (row) =>
                    row.status === 'CONFIRMED' || row.status === 'DRAFT' ? (
                      <DueDate date={row.estimatedDeliveryDate} />
                    ) : (
                      formatDate(row.dispatchedAt ?? row.estimatedDeliveryDate)
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
                  render: (row) => {
                    const status = coverageByOrder.get(row.id);
                    return status ? (
                      <CoverageChip status={status} />
                    ) : (
                      <OrderStatusChip status={row.status} />
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
