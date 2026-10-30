import { FilePlus2, Printer } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { usePurchaseOrders, useSupplierInvoices, useSuppliers } from '../../api/hooks';
import type { PurchaseOrder, SupplierInvoice } from '../../api/types';
import { useSession } from '../../auth/session';
import {
  DocumentToolbar,
  FilterBar,
  FilterField,
  type QueryColumn,
  QueryGrid,
  useWorkTab,
} from '../../components/erp';
import { EntityLink } from '../../components/links';
import { PurchaseStatusChip } from '../../components/status';
import { QueryView } from '../../components/ui';
import { formatCop, formatDate, formatDateTime, isZero } from '../../lib/format';
import {
  DateCell,
  inRange,
  INPUT,
  QtyTotal,
  QueryPanel,
  ScreenTitle,
  SELECT,
  TabStrip,
  useUrlFilters,
} from '../inventory/erp-kit';
import { pendingValue } from './money';

type View = 'pendientes' | 'entradas';

const FILTERS = { vista: 'pendientes', proveedor: '', desde: '', hasta: '', q: '' };

const sumCop = <T,>(rows: readonly T[], pick: (row: T) => string | bigint) =>
  formatCop(rows.reduce((sum, row) => sum + BigInt(pick(row)), 0n).toString());

/**
 * Receiving's consultations: purchase orders waiting for goods (Enter registers the warehouse entry
 * against the order) and the entries already registered with the supplier's invoice.
 */
export function ReceivingPage() {
  useWorkTab('Entradas de almacén');
  const navigate = useNavigate();
  const { can } = useSession();
  const canReceive = can('purchasing:receive');
  const filters = useUrlFilters(FILTERS);
  const { proveedor, desde, hasta, q } = filters.applied;
  const view: View = filters.applied.vista === 'entradas' ? 'entradas' : 'pendientes';
  const orders = usePurchaseOrders('OPEN,PARTIAL');
  const invoices = useSupplierInvoices();
  const suppliers = useSuppliers();

  const pendingRows = useMemo(() => {
    const text = q.trim().toLowerCase();
    return (orders.data ?? [])
      .filter(
        (order) =>
          (!proveedor || order.supplier.id === proveedor) &&
          inRange(order.expectedDate, desde, hasta) &&
          (!text ||
            [
              order.label,
              order.supplier.name,
              ...order.lines.map((line) => `${line.productCode} ${line.productName}`),
            ]
              .join(' ')
              .toLowerCase()
              .includes(text)),
      )
      .sort((a, b) => (a.expectedDate ?? '9').localeCompare(b.expectedDate ?? '9'));
  }, [orders.data, proveedor, desde, hasta, q]);
  const entryRows = useMemo(() => {
    const text = q.trim().toLowerCase();
    return (invoices.data ?? [])
      .filter(
        (invoice) =>
          (!proveedor || invoice.supplier.id === proveedor) &&
          inRange(invoice.invoiceDate, desde, hasta) &&
          (!text ||
            `${invoice.documentNumber} ${invoice.purchaseOrder.label} ${invoice.supplier.name}`
              .toLowerCase()
              .includes(text)),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [invoices.data, proveedor, desde, hasta, q]);

  return (
    <>
      <DocumentToolbar
        actions={[
          {
            label: 'Nueva entrada de almacén',
            icon: FilePlus2,
            shortcut: 'F9',
            primary: true,
            hidden: !canReceive,
            to: '/recepcion/nueva',
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
        title="Entradas de almacén"
        subtitle="Cuando llega la mercancía con la factura del proveedor, regístrala contra su orden de compra: así entra al inventario y queda en cuentas por pagar."
      />
      <TabStrip<View>
        label="Consulta"
        value={view}
        onChange={(value) => {
          filters.applyNow('vista', value);
        }}
        tabs={[
          { value: 'pendientes', label: 'Órdenes por recibir', count: orders.data?.length },
          { value: 'entradas', label: 'Entradas registradas' },
        ]}
      />
      <QueryPanel
        filters={
          <FilterBar
            onSubmit={() => {
              filters.apply();
            }}
          >
            <FilterField label="Proveedor">
              <select
                className={`${SELECT} max-w-64`}
                value={filters.draft.proveedor}
                onChange={(event) => {
                  filters.set('proveedor', event.target.value);
                }}
              >
                <option value="">Todos</option>
                {(suppliers.data ?? []).map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label={view === 'pendientes' ? 'Esperada desde' : 'Factura desde'}>
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
            <FilterField
              label={view === 'pendientes' ? 'Orden o producto' : 'Factura u orden'}
              className="w-full sm:w-52"
            >
              <input
                className={INPUT}
                value={filters.draft.q}
                onChange={(event) => {
                  filters.set('q', event.target.value);
                }}
              />
            </FilterField>
          </FilterBar>
        }
      >
        {view === 'pendientes' ? (
          <QueryView query={orders}>
            {() => (
              <QueryGrid<PurchaseOrder>
                title="Órdenes por recibir"
                columns={PENDING_COLUMNS}
                rows={pendingRows}
                rowKey={(row) => row.id}
                onOpen={(row) => {
                  void navigate(
                    canReceive ? `/recepcion/nueva?orden=${row.id}` : `/compras/ordenes/${row.id}`,
                  );
                }}
                empty="No hay mercancía en camino con estos filtros."
              />
            )}
          </QueryView>
        ) : (
          <QueryView query={invoices}>
            {() => (
              <QueryGrid<SupplierInvoice>
                title="Entradas registradas"
                columns={ENTRY_COLUMNS}
                rows={entryRows}
                rowKey={(row) => row.id}
                onOpen={(row) => {
                  void navigate(`/compras/ordenes/${row.purchaseOrder.id}`);
                }}
                empty="No hay entradas registradas con estos filtros."
              />
            )}
          </QueryView>
        )}
      </QueryPanel>
    </>
  );
}

const PENDING_COLUMNS: QueryColumn<PurchaseOrder>[] = [
  {
    key: 'label',
    header: 'Orden de compra',
    sort: (row) => row.label,
    csv: (row) => row.label,
    render: (row) => (
      <EntityLink to="purchase-order" id={row.id} className="font-medium">
        {row.label}
      </EntityLink>
    ),
  },
  {
    key: 'supplier',
    header: 'Proveedor',
    sort: (row) => row.supplier.name,
    csv: (row) => row.supplier.name,
    render: (row) => (
      <span className="block max-w-56 truncate" title={row.supplier.name}>
        {row.supplier.name}
      </span>
    ),
  },
  {
    key: 'expected',
    header: 'Fecha esperada',
    sort: (row) => row.expectedDate ?? '9999',
    csv: (row) => row.expectedDate ?? '',
    render: (row) => <DateCell date={row.expectedDate} pending lateLabel="No ha llegado" />,
  },
  {
    key: 'status',
    header: 'Estado',
    csv: (row) => row.statusLabel,
    render: (row) => <PurchaseStatusChip status={row.status} />,
  },
  {
    key: 'products',
    header: 'Productos pendientes',
    csv: (row) =>
      row.lines
        .filter((line) => !isZero(line.pending.quantity))
        .map((line) => line.productCode)
        .join(', '),
    render: (row) => (
      <span className="block max-w-72 truncate text-[12.5px] text-ink-2">
        {row.lines
          .filter((line) => !isZero(line.pending.quantity))
          .map((line) => line.productName)
          .join(' · ')}
      </span>
    ),
  },
  {
    key: 'pendingQty',
    header: 'Cantidad pendiente',
    align: 'right',
    hideOnMobile: true,
    render: (row) => (
      <QtyTotal
        values={row.lines
          .filter((line) => !isZero(line.pending.quantity))
          .map((line) => line.pending)}
      />
    ),
  },
  {
    key: 'value',
    header: 'Valor pendiente',
    align: 'right',
    sort: (row) => Number(pendingValue(row)),
    csv: (row) => pendingValue(row).toString(),
    render: (row) => formatCop(pendingValue(row).toString()),
    total: (rows) => sumCop(rows, pendingValue),
  },
  {
    key: 'createdBy',
    header: 'Elaboró',
    hideOnMobile: true,
    csv: (row) => row.createdBy,
    render: (row) => <span className="text-ink-2">{row.createdBy}</span>,
  },
];

const ENTRY_COLUMNS: QueryColumn<SupplierInvoice>[] = [
  {
    key: 'document',
    header: 'Factura del proveedor',
    sort: (row) => row.documentNumber,
    csv: (row) => row.documentNumber,
    render: (row) => <span className="font-medium tabular-nums">{row.documentNumber}</span>,
  },
  {
    key: 'date',
    header: 'Fecha factura',
    sort: (row) => row.invoiceDate,
    csv: (row) => row.invoiceDate,
    render: (row) => <span className="whitespace-nowrap">{formatDate(row.invoiceDate)}</span>,
  },
  {
    key: 'supplier',
    header: 'Proveedor',
    sort: (row) => row.supplier.name,
    csv: (row) => row.supplier.name,
    render: (row) => (
      <span className="block max-w-56 truncate" title={row.supplier.name}>
        {row.supplier.name}
      </span>
    ),
  },
  {
    key: 'order',
    header: 'Orden de compra',
    sort: (row) => row.purchaseOrder.label,
    csv: (row) => row.purchaseOrder.label,
    render: (row) => (
      <EntityLink to="purchase-order" id={row.purchaseOrder.id}>
        {row.purchaseOrder.label}
      </EntityLink>
    ),
  },
  {
    key: 'subtotal',
    header: 'Subtotal',
    align: 'right',
    csv: (row) => row.subtotal,
    render: (row) => formatCop(row.subtotal),
    total: (rows) => sumCop(rows, (row) => row.subtotal),
  },
  {
    key: 'tax',
    header: 'IVA',
    align: 'right',
    hideOnMobile: true,
    csv: (row) => row.tax,
    render: (row) => formatCop(row.tax),
    total: (rows) => sumCop(rows, (row) => row.tax),
  },
  {
    key: 'total',
    header: 'Total',
    align: 'right',
    sort: (row) => Number(row.total),
    csv: (row) => row.total,
    render: (row) => <span className="font-medium">{formatCop(row.total)}</span>,
    total: (rows) => sumCop(rows, (row) => row.total),
  },
  {
    key: 'due',
    header: 'Vence',
    sort: (row) => row.dueDate,
    csv: (row) => row.dueDate,
    render: (row) =>
      isZero(row.balance) ? (
        <span className="text-good">Pagada</span>
      ) : (
        <DateCell date={row.dueDate} pending lateLabel="Vencida" />
      ),
  },
  {
    key: 'receivedBy',
    header: 'Recibió',
    hideOnMobile: true,
    sort: (row) => row.createdAt,
    csv: (row) => row.receivedBy,
    render: (row) => (
      <span className="text-ink-2">
        {row.receivedBy}
        <span className="text-ink-3"> · {formatDateTime(row.createdAt)}</span>
      </span>
    ),
  },
];
