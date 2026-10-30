import { CircleCheck, FilePlus2, MapPinPlus, Pencil, Printer, ReceiptText, X } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { useCustomer, useCustomers } from '../../api/hooks';
import type { Branch, Customer } from '../../api/types';
import { useAccess } from '../../app/access';
import { useSession } from '../../auth/session';
import {
  DocumentScreen,
  DocumentSection,
  DocumentToolbar,
  HeaderField,
  HeaderGrid,
  useWorkTab,
} from '../../components/erp';
import { pathTo } from '../../components/links';
import { MapView } from '../../components/map/map-view';
import type { MapMarker } from '../../components/map/types';
import { Chip } from '../../components/status';
import { QueryView } from '../../components/ui';
import { DocTable } from '../billing/erp-kit';
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

/** The customer's record (master data): header fields and branches with their map. */
function CustomerRecord({ customer }: { customer: Customer }) {
  const { can } = useSession();
  const { has } = useAccess();
  const [editing, setEditing] = useState(false);
  const [branchDialog, setBranchDialog] = useState<{ branch?: Branch } | null>(null);
  const neighbors = useCustomerNeighbors(customer);
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
            label: 'Pedidos',
            icon: ReceiptText,
            to: `/ventas?cliente=${encodeURIComponent(customer.name)}`,
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
