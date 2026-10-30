import { FilePlus2, FileUp, PackageSearch, Printer, TriangleAlert } from 'lucide-react';
import { type ChangeEvent, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, api } from '../../api/client';
import { useAction, useStockStatus, useWarehouses } from '../../api/hooks';
import type { StockStatus } from '../../api/types';
import { useAccess } from '../../app/access';
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
import { EntityLink } from '../../components/links';
import { Qty } from '../../components/qty';
import { Chip } from '../../components/status';
import { Button, QueryView } from '../../components/ui';
import { unitLabel } from '../../lib/format';
import { csvQty, INPUT, QtyTotal, QueryPanel, ScreenTitle, SELECT, useUrlFilters } from './erp-kit';

const FILTERS = { tipo: '', bodega: '', q: '', alertas: '' };

const ZERO = (unit: string) => ({ quantity: '0', unit });

/** Stock of one warehouse for a product (zero when it never moved there). */
const inWarehouse = (row: StockStatus, code: string) =>
  row.byWarehouse.find((warehouse) => warehouse.warehouseCode === code)?.onHand ?? ZERO(row.unit);

/**
 * Stock consultation: physical stock per warehouse, what confirmed orders committed and the projected
 * balance. Enter opens the product's kardex.
 */
export function InventoryPage() {
  useWorkTab('Existencias');
  const navigate = useNavigate();
  const { can } = useSession();
  const { has } = useAccess();
  const warehouses = useWarehouses();
  const filters = useUrlFilters(FILTERS);
  const { tipo, bodega, q, alertas } = filters.applied;
  const status = useStockStatus({ type: tipo || undefined, q: q.trim() || undefined });
  const [loading, setLoading] = useState(false);

  const rows = useMemo(
    () =>
      (status.data ?? []).filter(
        (row) =>
          (!alertas || row.oversold || row.negativeOnHand) &&
          (!bodega || row.byWarehouse.some((warehouse) => warehouse.warehouseCode === bodega)),
      ),
    [status.data, alertas, bodega],
  );
  const codes = useMemo(
    () =>
      (warehouses.data ?? []).map((warehouse) => ({ code: warehouse.code, name: warehouse.name })),
    [warehouses.data],
  );

  const columns: QueryColumn<StockStatus>[] = [
    {
      key: 'code',
      header: 'Código',
      sort: (row) => row.code,
      csv: (row) => row.code,
      render: (row) => <span className="tabular-nums">{row.code}</span>,
    },
    {
      key: 'name',
      header: 'Descripción',
      sort: (row) => row.name,
      csv: (row) => row.name,
      render: (row) => (
        <EntityLink to="product" id={row.productId}>
          {row.name}
        </EntityLink>
      ),
    },
    {
      key: 'type',
      header: 'Tipo',
      hideOnMobile: true,
      sort: (row) => row.typeLabel,
      csv: (row) => row.typeLabel,
      render: (row) => <span className="text-ink-2">{row.typeLabel}</span>,
    },
    {
      key: 'unit',
      header: 'Und',
      hideOnMobile: true,
      csv: (row) => unitLabel(row.unit),
      render: (row) => <span className="text-ink-2">{unitLabel(row.unit)}</span>,
    },
    ...(codes.length > 0
      ? codes
      : [
          { code: 'PLANTA', name: 'Planta' },
          { code: 'DESPACHO', name: 'Despacho' },
        ]
    ).map((warehouse): QueryColumn<StockStatus> => ({
      key: `w-${warehouse.code}`,
      header: warehouse.name,
      align: 'right',
      sort: (row) => Number(inWarehouse(row, warehouse.code).quantity),
      csv: (row) => csvQty(inWarehouse(row, warehouse.code)),
      render: (row) => <Qty value={inWarehouse(row, warehouse.code)} dimZero />,
      total: (list) => <QtyTotal values={list.map((row) => inWarehouse(row, warehouse.code))} />,
    })),
    {
      key: 'onHand',
      header: 'Físico',
      align: 'right',
      sort: (row) => Number(row.onHand.quantity),
      csv: (row) => csvQty(row.onHand),
      render: (row) => <Qty value={row.onHand} emphasis />,
      total: (list) => <QtyTotal values={list.map((row) => row.onHand)} />,
    },
    {
      key: 'committed',
      header: 'Comprometido',
      align: 'right',
      sort: (row) => Number(row.committed.quantity),
      csv: (row) => csvQty(row.committed),
      render: (row) => <Qty value={row.committed} dimZero />,
      total: (list) => <QtyTotal values={list.map((row) => row.committed)} />,
    },
    {
      key: 'projected',
      header: 'Proyectado',
      align: 'right',
      sort: (row) => Number(row.projected.quantity),
      csv: (row) => csvQty(row.projected),
      render: (row) => <Qty value={row.projected} emphasis />,
      total: (list) => <QtyTotal values={list.map((row) => row.projected)} />,
    },
    {
      key: 'alerts',
      header: 'Alertas',
      sort: (row) => (row.oversold ? 0 : row.negativeOnHand ? 1 : 2),
      csv: (row) =>
        [row.oversold ? 'Sobrevendido' : '', row.negativeOnHand ? 'Físico negativo' : '']
          .filter(Boolean)
          .join(', '),
      render: (row) =>
        row.oversold || row.negativeOnHand ? (
          <span className="flex flex-wrap gap-1">
            {row.oversold ? (
              <Chip tone="critical" icon={TriangleAlert}>
                Sobrevendido
              </Chip>
            ) : null}
            {row.negativeOnHand ? (
              <Chip tone="warning" icon={TriangleAlert}>
                Físico negativo
              </Chip>
            ) : null}
          </span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
      total: (list) => {
        const flagged = list.filter((row) => row.oversold || row.negativeOnHand).length;
        return flagged > 0 ? `${String(flagged)} con alerta` : null;
      },
    },
  ];

  return (
    <>
      <DocumentToolbar
        actions={[
          {
            label: 'Ajustes, traslados y mermas',
            icon: FilePlus2,
            to: '/inventario/documentos',
            hidden: !has('inventoryDocs'),
          },
          {
            label: 'Kárdex',
            icon: PackageSearch,
            to: '/inventario/kardex',
            hidden: !has('kardex'),
          },
          {
            label: 'Carga inicial',
            icon: FileUp,
            hidden: !can('inventory:initial-load'),
            onClick: () => {
              setLoading(true);
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
        title="Existencias"
        subtitle="Físico por bodega, lo comprometido en pedidos sin despachar y el proyectado (físico − comprometido). Enter abre el kárdex del producto."
      />
      <QueryPanel
        filters={
          <FilterBar
            onSubmit={() => {
              filters.apply();
            }}
          >
            <FilterField label="Tipo">
              <select
                className={SELECT}
                value={filters.draft.tipo}
                onChange={(event) => {
                  filters.set('tipo', event.target.value);
                }}
              >
                <option value="">Todos</option>
                <option value="RAW_MATERIAL">Materias primas</option>
                <option value="BULK">Granel</option>
                <option value="FINISHED_GOOD">Terminados</option>
                <option value="RESALE">Reventa</option>
              </select>
            </FilterField>
            <FilterField label="Bodega">
              <select
                className={SELECT}
                value={filters.draft.bodega}
                onChange={(event) => {
                  filters.set('bodega', event.target.value);
                }}
              >
                <option value="">Todas</option>
                {codes.map((warehouse) => (
                  <option key={warehouse.code} value={warehouse.code}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Código o descripción" className="w-full sm:w-60">
              <input
                className={INPUT}
                value={filters.draft.q}
                onChange={(event) => {
                  filters.set('q', event.target.value);
                }}
              />
            </FilterField>
            <label className="flex h-8 items-center gap-2 self-end text-[13px] text-ink-2">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-brand)]"
                checked={filters.draft.alertas === '1'}
                onChange={(event) => {
                  filters.set('alertas', event.target.checked ? '1' : '');
                }}
              />
              Solo con alertas
            </label>
          </FilterBar>
        }
      >
        <QueryView query={status}>
          {() => (
            <QueryGrid<StockStatus>
              title="Existencias"
              columns={columns}
              rows={rows}
              rowKey={(row) => row.productId}
              {...(has('kardex')
                ? {
                    onOpen: (row: StockStatus) => {
                      void navigate(`/inventario/kardex?producto=${row.productId}`);
                    },
                  }
                : {})}
              rowClassName={(row) => (row.oversold ? 'bg-critical-soft/30' : undefined)}
              empty="No hay productos con estos filtros."
              pageSize={100}
            />
          )}
        </QueryView>
      </QueryPanel>
      <p className="no-print -mt-3 text-[12px] text-ink-3">
        Las compras entran con la entrada de almacén (Compras › Entradas de almacén) y el producto
        sale cuando logística despacha la remisión.
      </p>

      {loading ? (
        <InitialLoadDialog
          onClose={() => {
            setLoading(false);
          }}
        />
      ) : null}
    </>
  );
}

/** Short task: pick the CSV file exported from Excel; every balance is set to its quantity. */
function InitialLoadDialog({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const load = useAction(
    (csv: string) =>
      api.post<{ rows: number; movements: number }>('/v1/inventory/initial-load', csv),
    {
      success: (result) =>
        `Carga inicial lista: ${String(result.rows)} filas, ${String(result.movements)} saldos actualizados`,
    },
  );
  const lineErrors = load.error instanceof ApiError ? (load.error.problem.errors ?? []) : [];
  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    if (!picked) return;
    setFile({ name: picked.name, text: await picked.text() });
    load.reset();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Carga inicial de inventario"
      description="Archivo CSV con columnas codigo; cantidad; bodega (opcional, PLANTA por defecto). Cada saldo queda en la cantidad indicada."
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Volver
          </Button>
          <Button
            size="sm"
            icon={<FileUp className="size-4" />}
            loading={load.isPending}
            disabled={!file}
            onClick={() => {
              if (file) load.mutate(file.text, { onSuccess: onClose });
            }}
          >
            Cargar archivo
          </Button>
        </>
      }
    >
      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-medium text-ink-3">Archivo .csv</span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="text-[13.5px] file:mr-3 file:h-8 file:rounded-[5px] file:border file:border-line-strong file:bg-surface file:px-3 file:text-[13px]"
          onChange={(event) => {
            void pick(event);
          }}
        />
        <span className="text-[12px] text-ink-3">
          {file ? file.name : 'Separador ; o , — decimales con coma si el separador es ;'}
        </span>
      </label>
      {lineErrors.length > 0 ? (
        <div className="mt-4 rounded-md bg-critical-soft px-4 py-3 text-sm">
          <p className="font-medium">No se cargó nada. Corrige estas filas:</p>
          <ul className="mt-1.5 list-disc pl-5">
            {lineErrors.map((error) => (
              <li key={`${String(error.line)}-${error.message}`}>
                Fila {error.line}: {error.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Dialog>
  );
}
