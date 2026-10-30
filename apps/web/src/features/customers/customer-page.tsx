import { CircleCheck, FilePlus2, MapPinPlus, Pencil, Printer, X } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useCustomer, useCustomers, useOrderCoverage, useOrders, useVisits } from '../../api/hooks';
import type { Branch, Customer, SalesOrder, Visit } from '../../api/types';
import { useAccess } from '../../app/access';
import { useSession } from '../../auth/session';
import {
  DocumentScreen,
  DocumentSection,
  DocumentToolbar,
  HeaderField,
  HeaderGrid,
  type QueryColumn,
  QueryGrid,
  useWorkTab,
} from '../../components/erp';
import { EntityLink, pathTo } from '../../components/links';
import { MapView } from '../../components/map/map-view';
import type { MapMarker } from '../../components/map/types';
import { Chip, COVERAGE, CoverageChip, OrderStatusChip } from '../../components/status';
import { QueryView } from '../../components/ui';
import { formatDate, todayIso } from '../../lib/format';
import {
  colombiaDateTime,
  colombiaDay,
  formatUnits,
  sumQuantities,
} from '../billing/billing-format';
import { DocTable, GridTitle } from '../billing/erp-kit';
import { formatDistance, VisitPlaceChip } from '../visits/visit-place';
import { BranchDialog } from './branch-dialog';
import { CustomerFormDialog } from './customer-form-dialog';

export function CustomerPage() {
  const { id } = useParams();
  const customer = useCustomer(id);
  return <QueryView query={customer}>{(data) => <CustomerRecord customer={data} />}</QueryView>;
}

function Value({ children }: { children: ReactNode }) {
  return <span className="block py-1">{children}</span>;
}

/** Previous / next customer in alphabetical order. */
function useCustomerNeighbors(customer: Customer) {
  const customers = useCustomers();
  return useMemo(() => {
    const sorted = [...(customers.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const index = sorted.findIndex((item) => item.id === customer.id);
    const previous = index > 0 ? sorted[index - 1] : undefined;
    const next = index >= 0 ? sorted[index + 1] : undefined;
    return {
      previous: previous ? pathTo('customer', previous.id) : null,
      next: next ? pathTo('customer', next.id) : null,
    };
  }, [customers.data, customer.id]);
}

const unitsOf = (order: SalesOrder) =>
  sumQuantities(order.lines.map((line) => line.quantity.quantity));

/** The customer's record (master data): header fields, branches with their map, orders and visits. */
function CustomerRecord({ customer }: { customer: Customer }) {
  const navigate = useNavigate();
  const { can } = useSession();
  const { has } = useAccess();
  const [editing, setEditing] = useState(false);
  const [branchDialog, setBranchDialog] = useState<{ branch?: Branch } | null>(null);
  const neighbors = useCustomerNeighbors(customer);
  const orders = useOrders({ customerId: customer.id, limit: '200' });
  const coverage = useOrderCoverage(can('planning:read'));
  const visits = useVisits({ customerId: customer.id, from: todayIso(-60) }, can('visits:read'));
  const coverageByOrder = useMemo(
    () => new Map((coverage.data ?? []).map((row) => [row.orderId, row.status])),
    [coverage.data],
  );
  useWorkTab(`${customer.documentNumber} · ${customer.name}`);

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

  const orderColumns: QueryColumn<SalesOrder>[] = [
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
      key: 'branch',
      header: 'Sucursal',
      render: (row) => row.branch.name,
      csv: (row) => row.branch.name,
    },
    {
      key: 'seller',
      header: 'Vendedor',
      hideOnMobile: true,
      render: (row) => row.seller.name,
      csv: (row) => row.seller.name,
    },
    {
      key: 'promised',
      header: 'Fecha prometida',
      render: (row) => (
        <span className="whitespace-nowrap">{formatDate(row.estimatedDeliveryDate)}</span>
      ),
      sort: (row) => row.estimatedDeliveryDate ?? '',
      csv: (row) => row.estimatedDeliveryDate ?? '',
    },
    {
      key: 'status',
      header: 'Estado',
      render: (row) => <OrderStatusChip status={row.status} />,
      csv: (row) => row.statusLabel,
    },
    {
      key: 'coverage',
      header: 'Cobertura',
      hideOnMobile: true,
      render: (row) => {
        const status = coverageByOrder.get(row.id);
        return status ? <CoverageChip status={status} /> : <span className="text-ink-3">—</span>;
      },
      csv: (row) => {
        const status = coverageByOrder.get(row.id);
        return status ? COVERAGE[status].label : '';
      },
    },
    {
      key: 'units',
      header: 'Unidades',
      align: 'right',
      render: (row) => formatUnits(unitsOf(row)),
      sort: unitsOf,
      csv: (row) => formatUnits(unitsOf(row)),
      total: (list) => formatUnits(list.reduce((sum, row) => sum + unitsOf(row), 0)),
    },
  ];

  const visitColumns: QueryColumn<Visit>[] = [
    {
      key: 'at',
      header: 'Fecha y hora',
      className: 'whitespace-nowrap tabular-nums text-ink-2',
      render: (row) => colombiaDateTime(row.visitedAt),
      sort: (row) => row.visitedAt,
      csv: (row) => colombiaDateTime(row.visitedAt),
    },
    {
      key: 'branch',
      header: 'Sucursal',
      render: (row) => row.branch.name,
      csv: (row) => row.branch.name,
    },
    {
      key: 'seller',
      header: 'Vendedor',
      render: (row) => row.seller.name,
      csv: (row) => row.seller.name,
    },
    {
      key: 'place',
      header: 'Lugar',
      render: (row) => <VisitPlaceChip visit={row} />,
      csv: (row) =>
        row.onSite === null ? 'Sucursal sin ubicar' : row.onSite ? 'En sitio' : 'Lejos',
    },
    {
      key: 'distance',
      header: 'Distancia',
      align: 'right',
      render: (row) => (row.distanceM === null ? '—' : formatDistance(row.distanceM)),
      sort: (row) => row.distanceM ?? 0,
      csv: (row) => (row.distanceM === null ? '' : Math.round(row.distanceM)),
    },
    {
      key: 'order',
      header: 'Pedido',
      render: (row) =>
        row.order ? (
          <EntityLink to="order" id={row.order.id}>
            {row.order.label}
          </EntityLink>
        ) : (
          <span className="text-ink-3">—</span>
        ),
      csv: (row) => row.order?.label ?? '',
    },
    {
      key: 'notes',
      header: 'Observaciones',
      hideOnMobile: true,
      render: (row) => row.notes ?? <span className="text-ink-3">—</span>,
      csv: (row) => row.notes ?? '',
    },
  ];

  return (
    <>
      <DocumentToolbar
        actions={[
          {
            label: 'Nuevo pedido',
            icon: FilePlus2,
            primary: true,
            to: `/ventas/nueva?cliente=${customer.id}`,
            hidden: !(can('sales-orders:write') && has('newOrder')),
          },
          {
            label: 'Modificar',
            icon: Pencil,
            hidden: !canEdit,
            onClick: () => {
              setEditing(true);
            },
          },
          {
            label: 'Agregar sucursal',
            icon: MapPinPlus,
            hidden: !canEdit,
            onClick: () => {
              setBranchDialog({});
            },
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
        previous={neighbors.previous}
        next={neighbors.next}
        closeTo={has('customers') ? '/clientes' : '/'}
      />
      <DocumentScreen
        kind={`Ficha de cliente · ${customer.documentTypeLabel} ${customer.documentNumber}`}
        number={customer.name}
        status={
          customer.active ? (
            <Chip tone="good" icon={CircleCheck}>
              Activo
            </Chip>
          ) : (
            <Chip tone="neutral" icon={X}>
              Inactivo
            </Chip>
          )
        }
      >
        <HeaderGrid>
          <HeaderField label="Tipo de documento">
            <Value>{customer.documentTypeLabel}</Value>
          </HeaderField>
          <HeaderField label="Número de documento">
            <Value>
              <span className="tabular-nums">{customer.documentNumber}</span>
            </Value>
          </HeaderField>
          <HeaderField label="Ciudad">
            <Value>{customer.city ?? '—'}</Value>
          </HeaderField>
          <HeaderField label="Teléfono">
            <Value>{customer.phone ?? '—'}</Value>
          </HeaderField>
          <HeaderField label="Dirección" span={2}>
            <Value>{customer.address ?? '—'}</Value>
          </HeaderField>
          <HeaderField label="Vendedor asignado">
            <Value>{customer.seller?.name ?? 'Sin asignar'}</Value>
          </HeaderField>
          <HeaderField label="Sucursales activas">
            <Value>{branches.filter((branch) => branch.active).length}</Value>
          </HeaderField>
        </HeaderGrid>
        <DocumentSection
          title="Sucursales (adónde se despacha y dónde se verifican las visitas)"
          flush
        >
          <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <DocTable
              label={`Sucursales de ${customer.name}`}
              rows={branches}
              rowKey={(branch) => branch.id}
              minWidth={560}
              {...(canEdit
                ? {
                    onOpen: (branch: Branch) => {
                      setBranchDialog({ branch });
                    },
                  }
                : {})}
              rowClassName={(branch) => (branch.active ? undefined : 'text-ink-3')}
              columns={[
                {
                  key: 'name',
                  header: 'Sucursal',
                  render: (branch) => (
                    <span className="font-medium">
                      {branch.name}
                      {branch.isMain ? (
                        <span className="ml-1.5 text-[12px] font-normal text-ink-3">
                          (principal)
                        </span>
                      ) : null}
                    </span>
                  ),
                },
                {
                  key: 'address',
                  header: 'Dirección',
                  render: (branch) => branch.address ?? '—',
                },
                { key: 'city', header: 'Ciudad', render: (branch) => branch.city ?? '—' },
                {
                  key: 'phone',
                  header: 'Teléfono',
                  className: 'whitespace-nowrap',
                  render: (branch) => branch.phone ?? '—',
                },
                {
                  key: 'located',
                  header: 'Mapa',
                  render: (branch) =>
                    branch.latitude === null ? (
                      <span className="text-[#b67d00]">Sin ubicar</span>
                    ) : (
                      'Ubicada'
                    ),
                },
                {
                  key: 'active',
                  header: 'Estado',
                  render: (branch) => (branch.active ? 'Activa' : 'Inactiva'),
                },
              ]}
            />
            <div className="no-print border-t border-line lg:border-t-0 lg:border-l">
              {markers.length > 0 ? (
                <MapView
                  label={`Sucursales de ${customer.name}`}
                  className="h-64 w-full lg:h-full lg:min-h-64"
                  markers={markers}
                />
              ) : null}
            </div>
          </div>
        </DocumentSection>
      </DocumentScreen>

      <GridTitle aside="Enter o doble clic abre el pedido">Pedidos del cliente</GridTitle>
      <QueryView query={orders}>
        {(rows) => (
          <QueryGrid
            title={`Pedidos de ${customer.name}`}
            exportName="pedidos-del-cliente"
            columns={orderColumns}
            rows={rows}
            rowKey={(row) => row.id}
            initialSort={{ key: 'number', direction: 'desc' }}
            pageSize={25}
            onOpen={(row) => {
              void navigate(pathTo('order', row.id));
            }}
            empty="Este cliente no tiene pedidos."
          />
        )}
      </QueryView>

      {can('visits:read') ? (
        <>
          <GridTitle aside="Posición GPS del vendedor comparada con la sucursal">
            Visitas de los últimos 60 días
          </GridTitle>
          <QueryView query={visits}>
            {(rows) => (
              <QueryGrid
                title={`Visitas a ${customer.name}`}
                exportName="visitas-del-cliente"
                columns={visitColumns}
                rows={rows}
                rowKey={(row) => row.id}
                initialSort={{ key: 'at', direction: 'desc' }}
                pageSize={25}
                empty="Sin visitas registradas en los últimos 60 días."
              />
            )}
          </QueryView>
        </>
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
