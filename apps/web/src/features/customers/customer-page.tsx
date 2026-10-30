import { ClipboardList, MapPin, MapPinned, Pencil, Phone, Plus, UserRound } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useCustomer, useOrderCoverage, useOrders, useVisits } from '../../api/hooks';
import type { Branch, Customer, SalesOrder } from '../../api/types';
import { useSession } from '../../auth/session';
import { DataTable } from '../../components/data-table';
import { BackLink, EntityLink, pathTo } from '../../components/links';
import { MapView } from '../../components/map/map-view';
import type { MapMarker } from '../../components/map/types';
import { CoverageChip, DueDate, OrderStatusChip } from '../../components/status';
import { Button, EmptyState, PageHeader, Panel, QueryView } from '../../components/ui';
import { formatDate, formatDecimal, todayIso, unitLabel } from '../../lib/format';
import { VisitPlaceChip } from '../visits/visit-place';
import { BranchDialog } from './branch-dialog';
import { CustomerFormDialog } from './customer-form-dialog';

export function CustomerPage() {
  const { id } = useParams();
  const customer = useCustomer(id);
  return <QueryView query={customer}>{(data) => <CustomerView customer={data} />}</QueryView>;
}

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-ink-3 [&_svg]:size-4">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[12.5px] text-ink-3">{label}</dt>
        <dd className="text-[14.5px] text-ink">{children}</dd>
      </div>
    </div>
  );
}

function CustomerView({ customer }: { customer: Customer }) {
  const navigate = useNavigate();
  const { can } = useSession();
  const [editing, setEditing] = useState(false);
  const [branchDialog, setBranchDialog] = useState<{ branch?: Branch } | null>(null);
  const orders = useOrders({ customerId: customer.id, limit: '200' });
  const coverage = useOrderCoverage(can('planning:read'));
  const visits = useVisits({ customerId: customer.id, from: todayIso(-60) }, can('visits:read'));
  const coverageByOrder = useMemo(
    () => new Map((coverage.data ?? []).map((row) => [row.orderId, row.status])),
    [coverage.data],
  );
  const canEdit = can('customers:write');
  const branches = customer.branches;
  const markers = useMemo<MapMarker[]>(
    () =>
      branches
        .filter((branch) => branch.active && branch.latitude !== null && branch.longitude !== null)
        .map((branch) => ({
          id: branch.id,
          tone: 'brand',
          title: branch.name,
          lines: [branch.address, branch.city].filter((line): line is string => Boolean(line)),
          latitude: branch.latitude ?? 0,
          longitude: branch.longitude ?? 0,
          ...(canEdit
            ? {
                onClick: () => {
                  setBranchDialog({ branch });
                },
              }
            : {}),
        })),
    [branches, canEdit],
  );

  return (
    <>
      <BackLink fallback="/clientes" label="Clientes" />
      <PageHeader
        title={customer.name}
        description={`${customer.documentTypeLabel} ${customer.documentNumber}${customer.active ? '' : ' · inactivo'}`}
        actions={
          <>
            {canEdit ? (
              <Button
                variant="secondary"
                icon={<Pencil className="size-4" />}
                onClick={() => {
                  setEditing(true);
                }}
              >
                Editar
              </Button>
            ) : null}
            {can('sales-orders:write') ? (
              <Link
                to={`/ventas/nueva?cliente=${customer.id}`}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand-strong"
              >
                <Plus aria-hidden className="size-4" />
                Nueva preventa
              </Link>
            ) : null}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <Panel title="Datos del cliente">
          <dl className="flex flex-col gap-4">
            <Fact icon={<MapPin />} label="Dirección">
              {[customer.address, customer.city].filter(Boolean).join(', ') || '—'}
            </Fact>
            <Fact icon={<Phone />} label="Teléfono">
              {customer.phone ?? '—'}
            </Fact>
            <Fact icon={<UserRound />} label="Vendedor de la cartera">
              {customer.seller?.name ?? 'Sin asignar'}
            </Fact>
          </dl>
        </Panel>

        <Panel
          title="Sucursales"
          description="Adónde se despachan las preventas y dónde se verifican las visitas."
          flush
          actions={
            canEdit ? (
              <Button
                size="sm"
                variant="secondary"
                icon={<Plus className="size-3.5" />}
                onClick={() => {
                  setBranchDialog({});
                }}
              >
                Agregar sucursal
              </Button>
            ) : null
          }
        >
          <div className="grid md:grid-cols-[1fr_minmax(0,1.1fr)]">
            <ul className="divide-y divide-line">
              {branches.map((branch) => (
                <li key={branch.id} className="flex items-start gap-3 px-5 py-3.5">
                  <MapPin
                    aria-hidden
                    className={`mt-0.5 size-4 shrink-0 ${branch.latitude === null ? 'text-ink-3' : 'text-brand'}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {branch.name}
                      {branch.isMain ? (
                        <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-[11.5px] font-medium text-brand">
                          Principal
                        </span>
                      ) : null}
                      {branch.active ? null : (
                        <span className="ml-2 text-[12.5px] font-normal text-ink-3">
                          (inactiva)
                        </span>
                      )}
                    </p>
                    <p className="text-[13px] text-ink-2">
                      {[branch.address, branch.city].filter(Boolean).join(', ') || 'Sin dirección'}
                    </p>
                    {branch.latitude === null ? (
                      <p className="text-[12.5px] text-ink-3">Sin ubicar en el mapa</p>
                    ) : null}
                  </div>
                  {canEdit ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Editar sucursal ${branch.name}`}
                      icon={<Pencil className="size-3.5" />}
                      onClick={() => {
                        setBranchDialog({ branch });
                      }}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="border-t border-line md:border-t-0 md:border-l">
              {markers.length > 0 ? (
                <MapView
                  label={`Sucursales de ${customer.name}`}
                  className="h-72 w-full md:h-full md:min-h-72"
                  markers={markers}
                />
              ) : (
                <EmptyState
                  icon={<MapPinned />}
                  title="Ninguna sucursal está ubicada"
                  description="Ubícalas para ver en el mapa si las visitas se hicieron en el sitio."
                />
              )}
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Preventas" description="Las más recientes primero." flush className="mt-5">
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
                { key: 'branch', header: 'Sucursal', render: (row) => row.branch.name },
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

      {can('visits:read') ? (
        <Panel
          title="Visitas de los últimos 60 días"
          description="Dónde marcó el vendedor su llegada, comparado con la sucursal."
          flush
          className="mt-5"
        >
          <QueryView query={visits}>
            {(rows) =>
              rows.length === 0 ? (
                <EmptyState icon={<MapPinned />} title="Sin visitas registradas" />
              ) : (
                <ul className="divide-y divide-line">
                  {rows.slice(0, 12).map((visit) => (
                    <li
                      key={visit.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm"
                    >
                      <span className="w-40 text-ink-2 tabular-nums">
                        {new Date(visit.visitedAt).toLocaleString('es-CO', {
                          day: 'numeric',
                          month: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                      <span className="min-w-32 flex-1">
                        {visit.branch.name}
                        <span className="text-ink-3"> · {visit.seller.name}</span>
                      </span>
                      <VisitPlaceChip visit={visit} />
                      {visit.order ? (
                        <EntityLink to="order" id={visit.order.id} className="text-[13px]">
                          {visit.order.label}
                        </EntityLink>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )
            }
          </QueryView>
        </Panel>
      ) : null}

      <CustomerFormDialog
        open={editing}
        onClose={() => {
          setEditing(false);
        }}
        customer={customer}
      />
      <BranchDialog
        open={branchDialog !== null}
        onClose={() => {
          setBranchDialog(null);
        }}
        customer={customer}
        branch={branchDialog?.branch}
      />
    </>
  );
}
