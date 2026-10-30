import { FilePlus2, Printer } from 'lucide-react';
import { type SyntheticEvent, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useAction, useSuppliers } from '../../api/hooks';
import type { Supplier } from '../../api/types';
import { useSession } from '../../auth/session';
import { Dialog } from '../../components/dialog';
import {
  DocumentToolbar,
  FilterBar,
  FilterField,
  type QueryColumn,
  QueryGrid,
  useWorkTab,
} from '../../components/erp';
import { Button, Field, Input, QueryView } from '../../components/ui';
import { INPUT, QueryPanel, ScreenTitle, SELECT, useUrlFilters } from '../inventory/erp-kit';

const FILTERS = { q: '', estado: 'activos' };

const COLUMNS: QueryColumn<Supplier>[] = [
  {
    key: 'nit',
    header: 'NIT',
    sort: (row) => row.documentNumber ?? '',
    csv: (row) => row.documentNumber ?? '',
    render: (row) => <span className="tabular-nums">{row.documentNumber ?? '—'}</span>,
  },
  {
    key: 'name',
    header: 'Razón social',
    sort: (row) => row.name,
    csv: (row) => row.name,
    render: (row) => <span className="font-medium">{row.name}</span>,
  },
  {
    key: 'contact',
    header: 'Contacto',
    sort: (row) => row.contact ?? '',
    csv: (row) => row.contact ?? '',
    render: (row) => row.contact ?? <span className="text-ink-3">—</span>,
  },
  {
    key: 'phone',
    header: 'Teléfono',
    csv: (row) => row.phone ?? '',
    render: (row) => <span className="tabular-nums">{row.phone ?? '—'}</span>,
  },
  {
    key: 'email',
    header: 'Correo',
    hideOnMobile: true,
    csv: (row) => row.email ?? '',
    render: (row) => <span className="text-ink-2">{row.email ?? '—'}</span>,
  },
  {
    key: 'city',
    header: 'Ciudad',
    sort: (row) => row.city ?? '',
    csv: (row) => row.city ?? '',
    render: (row) => row.city ?? <span className="text-ink-3">—</span>,
  },
  {
    key: 'active',
    header: 'Estado',
    sort: (row) => (row.active ? 0 : 1),
    csv: (row) => (row.active ? 'Activo' : 'Inactivo'),
    render: (row) => (row.active ? 'Activo' : <span className="text-ink-3">Inactivo</span>),
  },
];

/** Suppliers master: consultation in a grid; Enter opens the record to edit it. */
export function SuppliersPage() {
  useWorkTab('Proveedores');
  const { can } = useSession();
  const canWrite = can('suppliers:write');
  const filters = useUrlFilters(FILTERS);
  const { q, estado } = filters.applied;
  const [editing, setEditing] = useState<{ supplier?: Supplier } | null>(null);
  const suppliers = useSuppliers(q.trim() || undefined);
  const rows = useMemo(
    () =>
      (suppliers.data ?? []).filter(
        (row) => estado === 'todos' || (estado === 'activos' ? row.active : !row.active),
      ),
    [suppliers.data, estado],
  );

  return (
    <>
      <DocumentToolbar
        actions={[
          {
            label: 'Nuevo proveedor',
            icon: FilePlus2,
            shortcut: 'F9',
            primary: true,
            hidden: !canWrite,
            onClick: () => {
              setEditing({});
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
      />
      <ScreenTitle
        title="Proveedores"
        subtitle={`A quién se le compran materias primas, envases y mercancía de reventa.${canWrite ? ' Enter o doble clic abre la ficha.' : ''}`}
      />
      <QueryPanel
        filters={
          <FilterBar
            onSubmit={() => {
              filters.apply();
            }}
          >
            <FilterField label="Nombre o NIT" className="w-full sm:w-64">
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
                <option value="activos">Activos</option>
                <option value="inactivos">Inactivos</option>
                <option value="todos">Todos</option>
              </select>
            </FilterField>
          </FilterBar>
        }
      >
        <QueryView query={suppliers}>
          {() => (
            <QueryGrid<Supplier>
              title="Proveedores"
              columns={COLUMNS}
              rows={rows}
              rowKey={(row) => row.id}
              {...(canWrite
                ? {
                    onOpen: (row: Supplier) => {
                      setEditing({ supplier: row });
                    },
                  }
                : {})}
              rowClassName={(row) => (row.active ? undefined : 'text-ink-3')}
              empty="No hay proveedores con estos filtros."
            />
          )}
        </QueryView>
      </QueryPanel>
      <Dialog
        open={editing !== null}
        onClose={() => {
          setEditing(null);
        }}
        title={editing?.supplier ? `Proveedor · ${editing.supplier.name}` : 'Nuevo proveedor'}
        description="Ficha del proveedor: sus datos aparecen en las órdenes de compra."
      >
        {editing ? (
          <SupplierForm
            {...(editing.supplier ? { supplier: editing.supplier } : {})}
            onClose={() => {
              setEditing(null);
            }}
          />
        ) : null}
      </Dialog>
    </>
  );
}

function SupplierForm({ supplier, onClose }: { supplier?: Supplier; onClose: () => void }) {
  const [form, setForm] = useState({
    name: supplier?.name ?? '',
    documentNumber: supplier?.documentNumber ?? '',
    contact: supplier?.contact ?? '',
    phone: supplier?.phone ?? '',
    email: supplier?.email ?? '',
    city: supplier?.city ?? '',
  });
  const set = (key: keyof typeof form) => (value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };
  const save = useAction(
    () => {
      const body = Object.fromEntries(
        Object.entries(form).map(([key, value]) => [key, value.trim()]),
      ) as typeof form;
      const payload = Object.fromEntries(
        Object.entries(body).filter(([key, value]) => key === 'name' || value !== ''),
      );
      return supplier
        ? api.patch<Supplier>(`/v1/suppliers/${supplier.id}`, payload)
        : api.post<Supplier>('/v1/suppliers', payload);
    },
    { success: supplier ? 'Proveedor actualizado' : 'Proveedor creado' },
  );
  const toggle = useAction(
    () => api.patch<Supplier>(`/v1/suppliers/${supplier?.id ?? ''}`, { active: !supplier?.active }),
    { success: supplier?.active ? 'Proveedor desactivado' : 'Proveedor activado' },
  );
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    save.mutate(undefined, { onSuccess: onClose });
  };

  const fields: readonly { key: keyof typeof form; label: string; required?: boolean }[] = [
    { key: 'name', label: 'Nombre o razón social', required: true },
    { key: 'documentNumber', label: 'NIT' },
    { key: 'contact', label: 'Persona de contacto' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'email', label: 'Correo' },
    { key: 'city', label: 'Ciudad' },
  ];
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <Field
            key={field.key}
            label={field.label}
            className={field.key === 'name' ? 'sm:col-span-2' : ''}
          >
            {(props) => (
              <Input
                {...props}
                required={field.required}
                type={field.key === 'email' ? 'email' : 'text'}
                value={form[field.key]}
                onChange={(event) => {
                  set(field.key)(event.target.value);
                }}
              />
            )}
          </Field>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        {supplier ? (
          <Button
            variant={supplier.active ? 'danger' : 'secondary'}
            loading={toggle.isPending}
            onClick={() => {
              toggle.mutate(undefined, { onSuccess: onClose });
            }}
          >
            {supplier.active ? 'Desactivar' : 'Activar'}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.isPending}>
            {supplier ? 'Guardar cambios' : 'Crear proveedor'}
          </Button>
        </div>
      </div>
    </form>
  );
}
