import { Contact, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useCustomers, useOrders } from '../../api/hooks';
import type { Customer } from '../../api/types';
import { DataTable } from '../../components/data-table';
import { EntityLink, pathTo } from '../../components/links';
import { EmptyState, Input, PageHeader, Panel, QueryView } from '../../components/ui';

export function CustomersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const customers = useCustomers(search.trim() || undefined);
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
        description="A quién se le vende y qué tiene pendiente cada uno."
      />
      <Panel flush>
        <div className="border-b border-line px-4 py-3">
          <label className="relative block md:w-80">
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
              placeholder="Nombre o NIT"
              className="pl-9"
            />
          </label>
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
              empty={<EmptyState icon={<Contact />} title="No hay clientes con ese nombre" />}
              columns={[
                {
                  key: 'name',
                  header: 'Cliente',
                  render: (row) => (
                    <span>
                      <EntityLink to="customer" id={row.id} className="font-medium">
                        {row.name}
                      </EntityLink>
                      {row.taxId ? (
                        <span className="block text-[12.5px] text-ink-3">NIT {row.taxId}</span>
                      ) : null}
                    </span>
                  ),
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
    </>
  );
}
