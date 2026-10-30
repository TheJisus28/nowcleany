import { Plus, Search, Truck } from 'lucide-react';
import { type SyntheticEvent, useState } from 'react';
import { api } from '../../api/client';
import { useAction, useSuppliers } from '../../api/hooks';
import type { Supplier } from '../../api/types';
import { useSession } from '../../auth/session';
import { DataTable } from '../../components/data-table';
import { Dialog } from '../../components/dialog';
import {
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Panel,
  QueryView,
} from '../../components/ui';

export function SuppliersPage() {
  const { can } = useSession();
  const canWrite = can('suppliers:write');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ supplier?: Supplier } | null>(null);
  const suppliers = useSuppliers(search.trim() || undefined);

  return (
    <>
      <PageHeader
        title="Proveedores"
        description="A quién se le compran las materias primas, envases y empaques."
        actions={
          canWrite ? (
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => {
                setEditing({});
              }}
            >
              Nuevo proveedor
            </Button>
          ) : null
        }
      />
      <Panel flush>
        <div className="border-b border-line px-4 py-3">
          <label className="relative block sm:w-80">
            <span className="sr-only">Buscar proveedor</span>
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
        <QueryView query={suppliers}>
          {(rows) => (
            <DataTable<Supplier>
              label="Proveedores"
              rows={rows}
              rowKey={(row) => row.id}
              {...(canWrite
                ? {
                    onRowClick: (row: Supplier) => {
                      setEditing({ supplier: row });
                    },
                  }
                : {})}
              rowClassName={(row) => (row.active ? undefined : 'opacity-60')}
              empty={<EmptyState icon={<Truck />} title="No hay proveedores con ese nombre" />}
              columns={[
                {
                  key: 'name',
                  header: 'Proveedor',
                  render: (row) => (
                    <span>
                      <span className="font-medium">{row.name}</span>
                      <span className="block text-[12.5px] text-ink-3">
                        {row.documentNumber ? `NIT ${row.documentNumber}` : 'Sin NIT'}
                        {row.active ? '' : ' (inactivo)'}
                      </span>
                    </span>
                  ),
                },
                { key: 'contact', header: 'Contacto', render: (row) => row.contact ?? '—' },
                { key: 'phone', header: 'Teléfono', render: (row) => row.phone ?? '—' },
                {
                  key: 'email',
                  header: 'Correo',
                  hideOnMobile: true,
                  render: (row) => row.email ?? '—',
                },
                { key: 'city', header: 'Ciudad', render: (row) => row.city ?? '—' },
              ]}
            />
          )}
        </QueryView>
      </Panel>
      <Dialog
        open={editing !== null}
        onClose={() => {
          setEditing(null);
        }}
        title={editing?.supplier ? editing.supplier.name : 'Nuevo proveedor'}
        description="Los datos de contacto aparecen en las órdenes de compra."
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
    <form onSubmit={submit} className="flex flex-col gap-4 p-5">
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
