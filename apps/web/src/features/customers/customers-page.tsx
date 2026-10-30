import { UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useCustomers, useOrders, useSellers } from '../../api/hooks';
import type { Customer } from '../../api/types';
import { useSession } from '../../auth/session';
import {
  DocumentToolbar,
  FilterBar,
  FilterField,
  type QueryColumn,
  QueryGrid,
  useWorkTab,
} from '../../components/erp';
import { EntityLink, pathTo } from '../../components/links';
import { QueryView } from '../../components/ui';
import { normalizeText } from '../billing/billing-format';
import { FILTER_INPUT, ScreenTitle, useQueryFilters } from '../billing/erp-kit';
import { CustomerFormDialog } from './customer-form-dialog';

const activeBranches = (customer: Customer) => customer.branches.filter((branch) => branch.active);
const unplaced = (customer: Customer) =>
  activeBranches(customer).filter((branch) => branch.latitude === null).length;

/** "Clientes": the customer master as a consultation; Enter or double click opens the record. */
export function CustomersPage() {
  const navigate = useNavigate();
  const { can } = useSession();
  const seesAll = can('customers:read-all');
  const [creating, setCreating] = useState(false);
  useWorkTab('Clientes');

  const filters = useQueryFilters({ buscar: '', vendedor: '', ciudad: '', estado: 'active' });
  const { draft, set } = filters;
  const { buscar, vendedor, ciudad, estado } = filters.applied;
  const sellers = useSellers(seesAll);
  const customers = useCustomers({
    q: buscar.trim() || undefined,
    sellerId: vendedor || undefined,
  });
  const open = useOrders({ status: 'DRAFT,CONFIRMED,INVOICED,READY,PARTIAL', limit: '500' });
  const openByCustomer = useMemo(() => {
    const counts = new Map<string, number>();
    for (const order of open.data ?? [])
      counts.set(order.customer.id, (counts.get(order.customer.id) ?? 0) + 1);
    return counts;
  }, [open.data]);

  const cities = useMemo(
    () =>
      [
        ...new Set((customers.data ?? []).map((customer) => customer.city ?? '').filter(Boolean)),
      ].sort((a, b) => a.localeCompare(b, 'es')),
    [customers.data],
  );
  const rows = useMemo(() => {
    const city = normalizeText(ciudad);
    return (customers.data ?? []).filter(
      (customer) =>
        (estado === 'all' || (estado === 'active' ? customer.active : !customer.active)) &&
        (!city || normalizeText(customer.city ?? '') === city),
    );
  }, [customers.data, ciudad, estado]);

  const columns: QueryColumn<Customer>[] = [
    {
      key: 'document',
      header: 'NIT / C.C.',
      className: 'tabular-nums whitespace-nowrap',
      render: (row) => `${row.documentTypeLabel} ${row.documentNumber}`,
      sort: (row) => row.documentNumber,
      csv: (row) => `${row.documentTypeLabel} ${row.documentNumber}`,
    },
    {
      key: 'name',
      header: 'Nombre o razón social',
      render: (row) => (
        <EntityLink to="customer" id={row.id} className="font-medium">
          {row.name}
        </EntityLink>
      ),
      sort: (row) => row.name,
      csv: (row) => row.name,
    },
    {
      key: 'city',
      header: 'Ciudad',
      render: (row) => row.city ?? '—',
      sort: (row) => row.city ?? '',
      csv: (row) => row.city ?? '',
    },
    {
      key: 'address',
      header: 'Dirección',
      hideOnMobile: true,
      render: (row) => row.address ?? <span className="text-ink-3">—</span>,
      csv: (row) => row.address ?? '',
    },
    {
      key: 'phone',
      header: 'Teléfono',
      hideOnMobile: true,
      className: 'tabular-nums whitespace-nowrap',
      render: (row) => row.phone ?? '—',
      csv: (row) => row.phone ?? '',
    },
    ...(seesAll
      ? [
          {
            key: 'seller',
            header: 'Vendedor',
            render: (row: Customer) =>
              row.seller?.name ?? <span className="text-ink-3">Sin asignar</span>,
            sort: (row: Customer) => row.seller?.name ?? '',
            csv: (row: Customer) => row.seller?.name ?? '',
          },
        ]
      : []),
    {
      key: 'branches',
      header: 'Sucursales',
      align: 'right',
      render: (row) => activeBranches(row).length,
      sort: (row) => activeBranches(row).length,
      csv: (row) => activeBranches(row).length,
      total: (list) => list.reduce((sum, row) => sum + activeBranches(row).length, 0),
    },
    {
      key: 'unplaced',
      header: 'Sin ubicar',
      align: 'right',
      hideOnMobile: true,
      render: (row) =>
        unplaced(row) > 0 ? (
          <span className="font-medium text-[#b67d00]">{unplaced(row)}</span>
        ) : (
          <span className="text-ink-3">0</span>
        ),
      sort: unplaced,
      csv: unplaced,
    },
    {
      key: 'open',
      header: 'Pedidos en curso',
      align: 'right',
      render: (row) => {
        const count = openByCustomer.get(row.id) ?? 0;
        return count === 0 ? (
          <span className="text-ink-3">0</span>
        ) : (
          <span className="font-semibold">{count}</span>
        );
      },
      sort: (row) => openByCustomer.get(row.id) ?? 0,
      csv: (row) => openByCustomer.get(row.id) ?? 0,
      total: (list) => list.reduce((sum, row) => sum + (openByCustomer.get(row.id) ?? 0), 0),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (row) => (row.active ? 'Activo' : <span className="text-ink-3">Inactivo</span>),
      csv: (row) => (row.active ? 'Activo' : 'Inactivo'),
    },
  ];

  return (
    <>
      <DocumentToolbar
        actions={[
          {
            label: 'Nuevo cliente',
            icon: UserPlus,
            primary: true,
            hidden: !can('customers:write'),
            onClick: () => {
              setCreating(true);
            },
          },
        ]}
      />
      <ScreenTitle
        title="Clientes"
        description={
          seesAll
            ? 'Maestro de clientes de todos los vendedores, con sus sucursales. Enter o doble clic abre la ficha.'
            : 'Tus clientes asignados y sus sucursales. Enter o doble clic abre la ficha.'
        }
      />
      <FilterBar onSubmit={filters.submit}>
        <FilterField label="Nombre o NIT">
          <input
            value={draft.buscar}
            onChange={(event) => {
              set('buscar', event.target.value);
            }}
            className={`${FILTER_INPUT} w-56`}
          />
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
        <FilterField label="Ciudad">
          <select
            value={draft.ciudad}
            onChange={(event) => {
              set('ciudad', event.target.value);
            }}
            className={FILTER_INPUT}
          >
            <option value="">Todas</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Estado">
          <select
            value={draft.estado}
            onChange={(event) => {
              set('estado', event.target.value);
            }}
            className={FILTER_INPUT}
          >
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
            <option value="all">Todos</option>
          </select>
        </FilterField>
      </FilterBar>
      <QueryView query={customers}>
        {() => (
          <QueryGrid
            title="Clientes"
            exportName="clientes"
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            initialSort={{ key: 'name', direction: 'asc' }}
            onOpen={(row) => {
              void navigate(pathTo('customer', row.id));
            }}
            rowClassName={(row) => (row.active ? undefined : 'text-ink-3')}
            empty="Ningún cliente coincide con estos filtros."
          />
        )}
      </QueryView>
      <CustomerFormDialog
        open={creating}
        onClose={() => {
          setCreating(false);
        }}
      />
    </>
  );
}
