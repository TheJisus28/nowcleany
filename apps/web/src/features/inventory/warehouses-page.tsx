import { Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useAction, useStockStatus, useWarehouses } from '../../api/hooks';
import type { Warehouse } from '../../api/types';
import { useSession } from '../../auth/session';
import { Dialog } from '../../components/dialog';
import { DocumentToolbar, type QueryColumn, QueryGrid, useWorkTab } from '../../components/erp';
import { Button, Field, Input, QueryView } from '../../components/ui';
import { ScreenTitle } from './erp-kit';

interface WarehouseRow extends Warehouse {
  /** Products with stock in this warehouse. */
  products: number;
}

/** Maestro de bodegas: the company names them and can open more. */
export function WarehousesPage() {
  useWorkTab('Bodegas');
  const { can } = useSession();
  const warehouses = useWarehouses();
  const stock = useStockStatus();
  const [editing, setEditing] = useState<Warehouse | 'new' | null>(null);
  const canWrite = can('inventory:warehouses');

  const rows = useMemo<WarehouseRow[]>(
    () =>
      (warehouses.data ?? []).map((warehouse) => ({
        ...warehouse,
        products: (stock.data ?? []).filter((row) =>
          row.byWarehouse.some(
            (entry) => entry.warehouseCode === warehouse.code && Number(entry.onHand.quantity) > 0,
          ),
        ).length,
      })),
    [warehouses.data, stock.data],
  );

  const columns: QueryColumn<WarehouseRow>[] = [
    {
      key: 'code',
      header: 'Código',
      className: 'font-medium',
      render: (row) => row.code,
      sort: (row) => row.code,
    },
    { key: 'name', header: 'Nombre', render: (row) => row.name, sort: (row) => row.name },
    {
      key: 'products',
      header: 'Productos con existencia',
      align: 'right',
      render: (row) => row.products,
      sort: (row) => row.products,
    },
  ];

  return (
    <>
      <DocumentToolbar
        actions={[
          {
            label: 'Nueva bodega',
            icon: Plus,
            primary: true,
            hidden: !canWrite,
            onClick: () => {
              setEditing('new');
            },
          },
        ]}
        closeTo="/inventario"
      />
      <ScreenTitle title="Bodegas" />
      <QueryView query={warehouses}>
        {() => (
          <QueryGrid
            title="Bodegas"
            exportName="bodegas"
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            initialSort={{ key: 'code', direction: 'asc' }}
            onOpen={(row) => {
              if (canWrite) setEditing(row);
            }}
            empty="No hay bodegas."
          />
        )}
      </QueryView>
      {editing ? (
        <WarehouseDialog
          warehouse={editing === 'new' ? null : editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
    </>
  );
}

function WarehouseDialog({
  warehouse,
  onClose,
}: {
  warehouse: Warehouse | null;
  onClose: () => void;
}) {
  const [code, setCode] = useState(warehouse?.code ?? '');
  const [name, setName] = useState(warehouse?.name ?? '');
  const save = useAction(
    () =>
      warehouse
        ? api.patch<Warehouse>(`/v1/inventory/warehouses/${warehouse.code}`, { name: name.trim() })
        : api.post<Warehouse>('/v1/inventory/warehouses', {
            code: code.trim().toUpperCase(),
            name: name.trim(),
          }),
    { success: (saved) => `Bodega ${saved.name} guardada` },
  );
  const valid =
    name.trim().length >= 2 && (warehouse !== null || /^[A-Za-z0-9-]{1,20}$/.test(code.trim()));
  return (
    <Dialog
      open
      onClose={onClose}
      title={warehouse ? `Bodega ${warehouse.code}` : 'Nueva bodega'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!valid}
            loading={save.isPending}
            onClick={() => {
              save.mutate(undefined, { onSuccess: onClose });
            }}
          >
            {warehouse ? (
              <>
                <Pencil aria-hidden className="size-4" />
                Guardar cambios
              </>
            ) : (
              'Crear bodega'
            )}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
        <Field label="Código" hint="Corto y sin espacios (p. ej. B3). No cambia después.">
          {(props) => (
            <Input
              {...props}
              value={code}
              disabled={warehouse !== null}
              maxLength={20}
              autoFocus={warehouse === null}
              onChange={(event) => {
                setCode(event.target.value.toUpperCase());
              }}
            />
          )}
        </Field>
        <Field label="Nombre">
          {(props) => (
            <Input
              {...props}
              value={name}
              maxLength={60}
              autoFocus={warehouse !== null}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
