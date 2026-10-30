import { Contact, MapPin, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useCustomers, useOrders, useSellers } from '../../api/hooks';
import type { Customer } from '../../api/types';
import { useSession } from '../../auth/session';
import { DataTable } from '../../components/data-table';
import { EntityLink, pathTo } from '../../components/links';
import {
  Button,
  EmptyState,
  Input,
  PageHeader,
  Panel,
  QueryView,
  Select,
} from '../../components/ui';
import { plural } from '../../lib/format';
import { CustomerFormDialog } from './customer-form-dialog';

export function CustomersPage() {
  const navigate = useNavigate();
  const { can } = useSession();
  const seesAll = can('customers:read-all');
  const [search, setSearch] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [creating, setCreating] = useState(false);
  const sellers = useSellers(seesAll);
  const customers = useCustomers({
    q: search.trim() || undefined,
    sellerId: sellerId || undefined,
  });
  const open = useOrders({ status: 'DRAFT,CONFIRMED', limit: '500' });
  const openByCustomer = useMemo(() => {
    const counts = new Map<string, number>();
    for (const order of open.data ?? [])
      counts.set(order.customer.id, (counts.get(order.customer.id) ?? 0) + 1);
    return counts;
  }, [open.data]);

  return (
    <>
      <PageHeader
        title="Clientes"
        description={
          seesAll
            ? 'Las carteras de todos los vendedores, con sus sucursales.'
            : 'Tu cartera: los clientes que atiendes y sus sucursales.'
        }
        actions={
          can('customers:write') ? (
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => {
                setCreating(true);
              }}
            >
              Nuevo cliente
            </Button>
          ) : null
        }
      />
      <Panel flush>
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row">
          <label className="relative block sm:w-80">
            <span className="sr-only">Buscar cliente</span>
            <Search
              aria-hidden
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
            />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
              placeholder="Nombre, razón social o documento"
              className="pl-9"
            />
          </label>
          {seesAll ? (
            <div className="sm:w-56">
              <Select
                aria-label="Vendedor"
                value={sellerId}
                onChange={(event) => {
                  setSellerId(event.target.value);
                }}
              >
                <option value="">Todos los vendedores</option>
                {(sellers.data ?? []).map((seller) => (
                  <option key={seller.id} value={seller.id}>
                    {seller.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
        </div>
        <QueryView query={customers}>
          {(rows) => (
            <DataTable<Customer>
              label="Clientes"
              rows={rows}
              rowKey={(row) => row.id}
              onRowClick={(row) => {
                void navigate(pathTo('customer', row.id));
              }}
              rowClassName={(row) => (row.active ? undefined : 'opacity-60')}
              empty={
                <EmptyState
                  icon={<Contact />}
                  title={search ? 'Ningún cliente coincide con la búsqueda' : 'Aún no hay clientes'}
                  description={search ? 'Prueba con parte del nombre o del documento.' : undefined}
                />
              }
              columns={[
                {
                  key: 'name',
                  header: 'Cliente',
                  render: (row) => (
                    <span>
                      <EntityLink to="customer" id={row.id} className="font-medium">
                        {row.name}
                      </EntityLink>
                      <span className="block text-[12.5px] text-ink-3">
                        {row.documentTypeLabel} {row.documentNumber}
                        {row.active ? '' : ' (inactivo)'}
                      </span>
                    </span>
                  ),
                },
                ...(seesAll
                  ? [
                      {
                        key: 'seller',
                        header: 'Vendedor',
                        render: (row: Customer) =>
                          row.seller?.name ?? <span className="text-ink-3">Sin asignar</span>,
                      },
                    ]
                  : []),
                {
                  key: 'branches',
                  header: 'Sucursales',
                  hideOnMobile: true,
                  render: (row) => {
                    const active = row.branches.filter((branch) => branch.active);
                    const unplaced = active.filter((branch) => branch.latitude === null).length;
                    return (
                      <span className="flex items-center gap-1.5 text-ink-2">
                        <MapPin aria-hidden className="size-3.5 text-ink-3" />
                        {plural(active.length, 'sucursal', 'sucursales')}
                        {unplaced > 0 ? (
                          <span className="text-[12.5px] text-ink-3">({unplaced} sin ubicar)</span>
                        ) : null}
                      </span>
                    );
                  },
                },
                { key: 'city', header: 'Ciudad', render: (row) => row.city ?? '—' },
                {
                  key: 'phone',
                  header: 'Teléfono',
                  hideOnMobile: true,
                  render: (row) => row.phone ?? '—',
                },
                {
                  key: 'open',
                  header: 'Preventas abiertas',
                  align: 'right',
                  render: (row) => {
                    const count = openByCustomer.get(row.id) ?? 0;
                    return count === 0 ? (
                      <span className="text-ink-3">0</span>
                    ) : (
                      <span className="font-semibold tabular-nums">{count}</span>
                    );
                  },
                },
              ]}
            />
          )}
        </QueryView>
      </Panel>
      <CustomerFormDialog
        open={creating}
        onClose={() => {
          setCreating(false);
        }}
      />
    </>
  );
}
