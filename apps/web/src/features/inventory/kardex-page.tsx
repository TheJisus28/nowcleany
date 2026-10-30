import { useQuery } from '@tanstack/react-query';
import { Printer, Warehouse } from 'lucide-react';
import { useMemo } from 'react';
import { api } from '../../api/client';
import { useProducts, useWarehouses } from '../../api/hooks';
import type { Movement } from '../../api/types';
import { type Entity, useAccess } from '../../app/access';
import {
  DocumentToolbar,
  FilterBar,
  FilterField,
  type LookupItem,
  LookupField,
  type QueryColumn,
  QueryGrid,
  useWorkTab,
} from '../../components/erp';
import { EntityLink } from '../../components/links';
import { QueryView } from '../../components/ui';
import { formatDateTime, formatDecimal, roundUpDecimal, unitLabel } from '../../lib/format';
import { csvQty, INPUT, QtyTotal, QueryPanel, ScreenTitle, SELECT, useUrlFilters } from './erp-kit';

const FILTERS = { producto: '', bodega: '', tipo: '', desde: '', hasta: '' };

const MOVEMENT_TYPES: readonly { value: string; label: string }[] = [
  { value: 'INITIAL_LOAD', label: 'Carga inicial' },
  { value: 'RECEIPT', label: 'Entrada de almacén' },
  { value: 'PRODUCTION_OUTPUT', label: 'Entrada de producción' },
  { value: 'PRODUCTION_CONSUMPTION', label: 'Consumo de producción' },
  { value: 'TRANSFER_OUT', label: 'Traslado (salida)' },
  { value: 'TRANSFER_IN', label: 'Traslado (entrada)' },
  { value: 'DISPATCH', label: 'Despacho' },
  { value: 'ADJUSTMENT', label: 'Ajuste por conteo' },
  { value: 'WASTE', label: 'Merma' },
];

/** Documents a movement can point to, so the kardex links back to what caused each entry. */
const REFERENCE_PAGES: Record<string, Entity> = {
  sales_order: 'order',
  production_order: 'production-order',
  purchase_order: 'purchase-order',
  shipment: 'shipment',
};

const PAGE = 200;
const MAX_PAGES = 5;

/** The API pages the kardex by the last movement id; the consultation brings up to 1.000 rows. */
function useKardex(filter: {
  productId: string;
  warehouse: string;
  type: string;
  from: string;
  to: string;
}) {
  return useQuery({
    queryKey: ['inventory', 'kardex', filter],
    queryFn: async () => {
      const rows: Movement[] = [];
      let before: string | undefined;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const params = new URLSearchParams({ limit: String(PAGE) });
        if (filter.productId) params.set('productId', filter.productId);
        if (filter.warehouse) params.set('warehouse', filter.warehouse);
        if (filter.type) params.set('type', filter.type);
        // Calendar days of the user (Montería), whole days included.
        if (filter.from) params.set('from', new Date(`${filter.from}T00:00:00`).toISOString());
        if (filter.to) params.set('to', new Date(`${filter.to}T23:59:59.999`).toISOString());
        if (before) params.set('before', before);
        const batch = await api.get<Movement[]>(`/v1/inventory/movements?${params.toString()}`);
        rows.push(...batch);
        if (batch.length < PAGE) return { rows, truncated: false };
        before = batch[batch.length - 1]?.id;
      }
      return { rows, truncated: true };
    },
  });
}

const isIn = (row: Movement) => !row.quantity.quantity.startsWith('-');
const absolute = (row: Movement) => ({
  quantity: row.quantity.quantity.replace(/^-/, ''),
  unit: row.quantity.unit,
});

/** Kardex consultation: every movement with its running balance, filtered and paginated. */
export function KardexPage() {
  const { canOpen } = useAccess();
  const products = useProducts({});
  const warehouses = useWarehouses();
  const filters = useUrlFilters(FILTERS);
  const { producto, bodega, tipo, desde, hasta } = filters.applied;
  const kardex = useKardex({
    productId: producto,
    warehouse: bodega,
    type: tipo,
    from: desde,
    to: hasta,
  });
  const product = products.data?.find((item) => item.id === producto);
  useWorkTab(product ? `Kárdex · ${product.code}` : 'Kárdex');

  const items = useMemo<LookupItem[]>(
    () =>
      (products.data ?? []).map((item) => ({
        id: item.id,
        code: item.code,
        label: item.name,
        detail: `${item.typeLabel} · ${unitLabel(item.stockUnit)}`,
      })),
    [products.data],
  );
  const rows = useMemo(() => kardex.data?.rows ?? [], [kardex.data]);

  const columns: QueryColumn<Movement>[] = [
    {
      key: 'when',
      header: 'Fecha',
      sort: (row) => `${row.occurredAt}#${row.id.padStart(19, '0')}`,
      csv: (row) => row.occurredAt,
      render: (row) => <span className="whitespace-nowrap">{formatDateTime(row.occurredAt)}</span>,
    },
    {
      key: 'type',
      header: 'Movimiento',
      sort: (row) => row.typeLabel,
      csv: (row) => row.typeLabel,
      render: (row) => row.typeLabel,
    },
    {
      key: 'reference',
      header: 'Documento',
      csv: (row) => row.reference?.label ?? '',
      render: (row) => {
        const page = row.reference ? REFERENCE_PAGES[row.reference.type] : undefined;
        if (!row.reference) return <span className="text-ink-3">—</span>;
        return page && canOpen(page) ? (
          <EntityLink to={page} id={row.reference.id}>
            {row.reference.label}
          </EntityLink>
        ) : (
          <span className="text-ink-2">{row.reference.label}</span>
        );
      },
    },
    {
      key: 'code',
      header: 'Código',
      sort: (row) => row.product.code,
      csv: (row) => row.product.code,
      render: (row) => <span className="tabular-nums">{row.product.code}</span>,
    },
    {
      key: 'product',
      header: 'Producto',
      sort: (row) => row.product.name,
      csv: (row) => row.product.name,
      render: (row) => (
        <EntityLink to="product" id={row.product.id}>
          {row.product.name}
        </EntityLink>
      ),
    },
    {
      key: 'warehouse',
      header: 'Bodega',
      sort: (row) => row.warehouse.name,
      csv: (row) => row.warehouse.name,
      render: (row) => <span className="text-ink-2">{row.warehouse.name}</span>,
    },
    {
      key: 'unit',
      header: 'Und',
      hideOnMobile: true,
      csv: (row) => unitLabel(row.quantity.unit),
      render: (row) => <span className="text-ink-2">{unitLabel(row.quantity.unit)}</span>,
    },
    {
      key: 'in',
      header: 'Entrada',
      align: 'right',
      csv: (row) => (isIn(row) ? csvQty(row.quantity) : ''),
      render: (row) =>
        isIn(row) ? (
          <span className="text-good">{formatDecimal(roundUpDecimal(row.quantity.quantity))}</span>
        ) : null,
      total: (list) => <QtyTotal values={list.filter(isIn).map(absolute)} />,
    },
    {
      key: 'out',
      header: 'Salida',
      align: 'right',
      csv: (row) => (isIn(row) ? '' : csvQty(absolute(row))),
      render: (row) =>
        isIn(row) ? null : (
          <span className="text-critical">
            {formatDecimal(roundUpDecimal(absolute(row).quantity))}
          </span>
        ),
      total: (list) => <QtyTotal values={list.filter((row) => !isIn(row)).map(absolute)} />,
    },
    {
      key: 'balance',
      header: 'Saldo',
      align: 'right',
      csv: (row) => csvQty(row.balanceAfter),
      render: (row) => (
        <span
          className={
            row.balanceAfter.quantity.startsWith('-')
              ? 'font-semibold text-critical'
              : 'font-semibold'
          }
        >
          {formatDecimal(roundUpDecimal(row.balanceAfter.quantity))}
        </span>
      ),
    },
    {
      key: 'actor',
      header: 'Usuario',
      hideOnMobile: true,
      sort: (row) => row.actor.name,
      csv: (row) => row.actor.name,
      render: (row) => <span className="text-ink-2">{row.actor.name}</span>,
    },
    {
      key: 'note',
      header: 'Nota',
      hideOnMobile: true,
      csv: (row) => row.note ?? '',
      render: (row) =>
        row.note ? (
          <span className="block max-w-64 truncate text-ink-2" title={row.note}>
            {row.note}
          </span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
  ];

  return (
    <>
      <DocumentToolbar
        actions={[
          { label: 'Existencias', icon: Warehouse, to: '/inventario' },
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
        title={product ? `Kárdex de ${product.code} · ${product.name}` : 'Kárdex'}
        subtitle="Cada entrada y salida con el saldo que dejó en su bodega. El kárdex no se modifica: los errores se corrigen con un ajuste."
      />
      <QueryPanel
        filters={
          <FilterBar
            onSubmit={() => {
              filters.apply();
            }}
          >
            <FilterField label="Producto (F2)" className="min-w-0 sm:min-w-80">
              <LookupField
                title="Buscar producto"
                items={items}
                value={filters.draft.producto || null}
                placeholder="Código (F2)"
                onChange={(id) => {
                  filters.set('producto', id);
                }}
              />
            </FilterField>
            {filters.draft.producto ? (
              <button
                type="button"
                onClick={() => {
                  filters.set('producto', '');
                }}
                className="h-8 self-end text-[12.5px] text-ink-2 hover:text-ink"
              >
                Todos los productos
              </button>
            ) : null}
            <FilterField label="Bodega">
              <select
                className={SELECT}
                value={filters.draft.bodega}
                onChange={(event) => {
                  filters.set('bodega', event.target.value);
                }}
              >
                <option value="">Todas</option>
                {(warehouses.data ?? []).map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.code}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Movimiento">
              <select
                className={SELECT}
                value={filters.draft.tipo}
                onChange={(event) => {
                  filters.set('tipo', event.target.value);
                }}
              >
                <option value="">Todos</option>
                {MOVEMENT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Desde">
              <input
                type="date"
                className={INPUT}
                value={filters.draft.desde}
                onChange={(event) => {
                  filters.set('desde', event.target.value);
                }}
              />
            </FilterField>
            <FilterField label="Hasta">
              <input
                type="date"
                className={INPUT}
                value={filters.draft.hasta}
                onChange={(event) => {
                  filters.set('hasta', event.target.value);
                }}
              />
            </FilterField>
          </FilterBar>
        }
      >
        <QueryView query={kardex}>
          {(data) => (
            <>
              {data.truncated ? (
                <p className="no-print border-b border-line bg-warning-soft px-4 py-2 text-[12.5px]">
                  Se muestran los {rows.length.toLocaleString('es-CO')} movimientos más recientes.
                  Acota con producto o fechas para ver los anteriores.
                </p>
              ) : null}
              <QueryGrid<Movement>
                title="Kárdex"
                exportName="kardex"
                columns={columns}
                rows={rows}
                rowKey={(row) => row.id}
                initialSort={{ key: 'when', direction: 'desc' }}
                empty="No hay movimientos con estos filtros."
              />
            </>
          )}
        </QueryView>
      </QueryPanel>
    </>
  );
}
