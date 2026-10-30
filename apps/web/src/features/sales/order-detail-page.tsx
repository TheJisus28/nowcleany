import { Ban, FilePlus2, FileText, Pencil, Printer, ReceiptText, Send } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api } from '../../api/client';
import {
  useAction,
  useOrder,
  useOrderCoverage,
  useOrderHistory,
  useOrderInvoice,
  useProducts,
  useShipments,
} from '../../api/hooks';
import type { CoverageLine, Invoice, SalesOrder, Shipment, TrailEntry } from '../../api/types';
import { useAccess } from '../../app/access';
import { useProfile, useSession } from '../../auth/session';
import {
  DocumentScreen,
  DocumentSection,
  DocumentToolbar,
  HeaderField,
  HeaderGrid,
  type ToolbarAction,
  useWorkTab,
} from '../../components/erp';
import { EntityLink, pathTo } from '../../components/links';
import {
  CollectionChip,
  CoverageChip,
  OrderStatusChip,
  ShipmentStatusChip,
} from '../../components/status';
import { QueryView } from '../../components/ui';
import { formatCop, formatDate, formatDateTime, relativeDays, unitLabel } from '../../lib/format';
import { actionLabel } from '../accounting/trail-labels';
import { amountFor, colombiaDateTime, colombiaDay } from '../billing/billing-format';
import { type DocColumn, DocTable, Money, StatusLine } from '../billing/erp-kit';
import { CancelOrderDialog, COMMITTED, Num, useOrderNeighbors } from './order-shared';

type OrderLine = SalesOrder['lines'][number];

export function OrderDetailPage() {
  const { id } = useParams();
  const order = useOrder(id);
  return <QueryView query={order}>{(data) => <OrderDocument order={data} />}</QueryView>;
}

function Value({ children }: { children: ReactNode }) {
  return <span className="block py-1">{children}</span>;
}

/** A saved order, read-only: header, lines with fulfilment and coverage, totals and its trail. */
function OrderDocument({ order }: { order: SalesOrder }) {
  const navigate = useNavigate();
  const profile = useProfile();
  const { can } = useSession();
  const { has, canOpen } = useAccess();
  const coverage = useOrderCoverage(can('planning:read') && COMMITTED.includes(order.status));
  const lineCoverage = coverage.data?.find((row) => row.orderId === order.id);
  const invoices = useOrderInvoice(order.id, can('invoices:read') && order.invoicedAt !== null);
  const invoice = invoices.data?.[0];
  const shipments = useShipments(
    { orderId: order.id },
    can('shipments:read') && (order.readyAt !== null || order.dispatchedAt !== null),
  );
  const history = useOrderHistory(order.id);
  const products = useProducts();
  const neighbors = useOrderNeighbors(order);
  const [cancelOpen, setCancelOpen] = useState(false);

  useWorkTab(`${order.label} · ${order.customer.name}`);

  const canManage =
    can('sales-orders:write') && (order.seller.id === profile.id || can('sales-orders:manage-all'));
  const send = useAction(() => api.post<SalesOrder>(`/v1/sales-orders/${order.id}/confirm`), {
    success: `Preventa ${order.label} guardada`,
  });

  // Invoiced orders carry the invoice price; the rest, today's list price.
  const priceOf = useMemo(() => {
    const invoiced = new Map(
      (invoice?.lines ?? []).map((line) => [line.productId, line.unitPrice]),
    );
    const list = new Map((products.data ?? []).map((product) => [product.id, product.price]));
    return (productId: string) => invoiced.get(productId) ?? list.get(productId) ?? null;
  }, [invoice, products.data]);
  const subtotal = invoice
    ? BigInt(invoice.subtotal)
    : order.lines.reduce((sum, line) => {
        const price = priceOf(line.productId);
        return price ? sum + amountFor(line.quantity.quantity, price) : sum;
      }, 0n);
  const vat = invoice ? BigInt(invoice.tax) : 0n;
  const total = invoice ? BigInt(invoice.total) : subtotal + vat;

  const fulfilment = order.invoicedAt !== null && order.status !== 'CANCELLED';
  const coverageOf = (productId: string): CoverageLine | undefined =>
    lineCoverage?.lines.find((line) => line.product.id === productId);

  const columns: DocColumn<OrderLine>[] = [
    {
      key: 'n',
      header: '#',
      align: 'center',
      className: 'w-10 text-ink-3 tabular-nums',
      render: (_, index) => index + 1,
    },
    {
      key: 'code',
      header: 'Código',
      className: 'tabular-nums',
      render: (line) => (
        <EntityLink to="product" id={line.productId}>
          {line.productCode}
        </EntityLink>
      ),
    },
    { key: 'name', header: 'Descripción', render: (line) => line.productName },
    {
      key: 'unit',
      header: 'Und',
      className: 'text-ink-2',
      render: (line) => unitLabel(line.quantity.unit),
    },
    {
      key: 'quantity',
      header: 'Cantidad',
      align: 'right',
      render: (line) => <Num value={line.quantity} strong />,
    },
    {
      key: 'price',
      header: invoice ? 'Precio' : 'Precio lista',
      align: 'right',
      render: (line) => {
        const price = priceOf(line.productId);
        return price ? formatCop(price) : <span className="text-ink-3">Sin precio</span>;
      },
    },
    {
      key: 'amount',
      header: 'Valor',
      align: 'right',
      render: (line) => {
        const price = priceOf(line.productId);
        return price ? (
          <span className="font-medium">
            {formatCop(amountFor(line.quantity.quantity, price).toString())}
          </span>
        ) : (
          '—'
        );
      },
    },
    ...(fulfilment
      ? ([
          {
            key: 'dispatched',
            header: 'Despachado',
            align: 'right',
            render: (line) => <Num value={line.dispatched} />,
          },
          {
            key: 'pending',
            header: 'Pendiente',
            align: 'right',
            render: (line) => <Num value={line.pending} strong />,
          },
        ] satisfies DocColumn<OrderLine>[])
      : []),
    ...(lineCoverage
      ? ([
          {
            key: 'stock',
            header: 'Del stock',
            align: 'right',
            render: (line) => {
              const row = coverageOf(line.productId);
              return row ? <Num value={row.fromStock} /> : '—';
            },
          },
          {
            key: 'production',
            header: 'Por fabricar',
            align: 'right',
            render: (line) => {
              const row = coverageOf(line.productId);
              return row ? <Num value={row.fromProduction} /> : '—';
            },
          },
          {
            key: 'buy',
            header: 'Por comprar',
            align: 'right',
            render: (line) => {
              const row = coverageOf(line.productId);
              return row ? (
                <span className={row.status === 'SHORT' ? 'text-critical' : undefined}>
                  <Num value={row.uncovered} />
                </span>
              ) : (
                '—'
              );
            },
          },
        ] satisfies DocColumn<OrderLine>[])
      : []),
  ];

  const actions: ToolbarAction[] = [
    {
      label: 'Nuevo',
      icon: FilePlus2,
      to: '/ventas/nueva',
      hidden: !(can('sales-orders:write') && has('newOrder')),
    },
    {
      label: 'Modificar',
      icon: Pencil,
      to: `/ventas/${order.id}/editar`,
      hidden: !(order.status === 'DRAFT' && canManage),
    },
    {
      label: 'Guardar preventa',
      icon: Send,
      shortcut: 'F9',
      primary: true,
      loading: send.isPending,
      hidden: !(order.status === 'DRAFT' && canManage),
      onClick: () => {
        send.mutate(undefined);
      },
    },
    {
      label: 'Facturar',
      icon: ReceiptText,
      shortcut: 'F9',
      primary: true,
      to: '/consolidado',
      title: 'Se factura en Facturación de pedidos, con su prioridad y despacho parcial',
      hidden: !(order.status === 'CONFIRMED' && can('invoices:issue') && has('consolidation')),
    },
    {
      label: invoice ? `Ver factura ${invoice.label}` : 'Ver factura',
      icon: FileText,
      to: invoice ? pathTo('invoice', invoice.id) : '#',
      hidden: !invoice || !canOpen('invoice'),
    },
    {
      label: 'Anular',
      icon: Ban,
      danger: true,
      hidden: !((order.status === 'DRAFT' || order.status === 'CONFIRMED') && canManage),
      onClick: () => {
        setCancelOpen(true);
      },
    },
    {
      label: 'Cotización PDF',
      icon: FileText,
      to: `/ventas/${order.id}/cotizacion`,
    },
    {
      label: 'Imprimir',
      icon: Printer,
      shortcut: 'Ctrl+P',
      onClick: () => {
        window.print();
      },
    },
  ];

  const signatures = [
    { label: 'Elaboró', name: order.seller.name, at: formatDateTime(order.createdAt) },
    ...(order.confirmedAt
      ? [{ label: 'Guardó', name: order.seller.name, at: formatDateTime(order.confirmedAt) }]
      : []),
    ...(order.invoicedAt
      ? [{ label: 'Facturó', name: order.invoicedBy, at: formatDateTime(order.invoicedAt) }]
      : []),
    ...(order.readyAt
      ? [{ label: 'Alistó', name: order.readyBy, at: formatDateTime(order.readyAt) }]
      : []),
    ...(order.dispatchedAt
      ? [{ label: 'Despachó', name: order.dispatchedBy, at: formatDateTime(order.dispatchedAt) }]
      : []),
    ...(order.deliveredAt
      ? [{ label: 'Recibió', name: order.receivedBy, at: formatDateTime(order.deliveredAt) }]
      : []),
    ...(order.cancelledAt
      ? [{ label: 'Anuló', name: order.cancelledBy, at: formatDateTime(order.cancelledAt) }]
      : []),
  ];

  const status =
    order.status === 'CANCELLED' ? (
      <StatusLine tone="warning">
        Anulado el {formatDateTime(order.cancelledAt)} por {order.cancelledBy ?? '—'}. Motivo:{' '}
        {order.cancelReason ?? '—'}
      </StatusLine>
    ) : order.status === 'DELIVERED' ? (
      <StatusLine>
        Entregado el {formatDateTime(order.deliveredAt)}
        {order.receivedBy ? `; recibió ${order.receivedBy}` : ''}.
      </StatusLine>
    ) : order.nextStep ? (
      <StatusLine>
        <span className="font-medium text-ink">Siguiente paso:</span> {order.nextStep}.
        {order.status === 'DRAFT'
          ? ' Mientras sea preventa no compromete producto ni cuenta para planta y compras.'
          : ''}
        {order.status === 'PARTIAL'
          ? ' Ya salió una parte; el resto sale cuando se fabrique o se compre.'
          : ''}
      </StatusLine>
    ) : null;

  return (
    <>
      <DocumentToolbar
        actions={actions}
        previous={neighbors.previous}
        next={neighbors.next}
        closeTo={has('sales') ? '/ventas' : has('consolidation') ? '/consolidado' : '/'}
      />
      <DocumentScreen
        kind="Pedido de venta"
        number={order.label}
        status={
          <>
            <OrderStatusChip status={order.status} />
            {lineCoverage ? <CoverageChip status={lineCoverage.status} /> : null}
          </>
        }
        notes={
          <div>
            <p className="text-[12px] font-medium text-ink-3">Observaciones</p>
            <p className="mt-1 whitespace-pre-line">
              {order.notes ?? <span className="text-ink-3">Sin observaciones.</span>}
            </p>
          </div>
        }
        totals={
          invoice
            ? [
                { label: 'Subtotal', value: formatCop(subtotal.toString()) },
                ...(invoice.documentType === 'FEL'
                  ? [{ label: 'IVA 19 %', value: formatCop(vat.toString()) }]
                  : []),
                {
                  label: invoice.documentType === 'FEL' ? 'Total factura' : 'Total remisión',
                  value: formatCop(total.toString()),
                  strong: true,
                },
              ]
            : [
                {
                  label: 'Valor sin impuestos',
                  value: formatCop(subtotal.toString()),
                  strong: true,
                },
              ]
        }
        signatures={signatures}
      >
        {status}
        <HeaderGrid>
          <HeaderField label="Cliente" span={2}>
            <Value>
              <EntityLink to="customer" id={order.customer.id} className="font-medium">
                {order.customer.name}
              </EntityLink>
              <span className="ml-2 text-[13px] text-ink-2 tabular-nums">
                {order.customer.documentType === 'NIT' ? 'NIT' : 'C.C.'}{' '}
                {order.customer.documentNumber}
              </span>
            </Value>
          </HeaderField>
          <HeaderField label="Sucursal de entrega" span={2}>
            <Value>
              {order.branch.name}
              <span className="text-[13px] text-ink-2">
                {' · '}
                {[order.branch.address, order.branch.city].filter(Boolean).join(', ') ||
                  'Sin dirección'}
              </span>
            </Value>
          </HeaderField>
          <HeaderField label="Fecha del pedido">
            <Value>{formatDate(colombiaDay(order.createdAt))}</Value>
          </HeaderField>
          <HeaderField label="Vendedor">
            <Value>{order.seller.name}</Value>
          </HeaderField>
          <HeaderField label="Fecha prometida al cliente">
            <Value>
              {formatDate(order.estimatedDeliveryDate)}
              {COMMITTED.includes(order.status) || order.status === 'DRAFT' ? (
                <span className="ml-1.5 text-[12.5px] text-ink-3">
                  ({relativeDays(order.estimatedDeliveryDate).toLowerCase()})
                </span>
              ) : null}
            </Value>
          </HeaderField>
          <HeaderField label="Enviado al consolidado">
            <Value>{order.confirmedAt ? formatDateTime(order.confirmedAt) : '—'}</Value>
          </HeaderField>
          {order.invoicedAt ? (
            <>
              <HeaderField label="Factura de venta">
                <Value>
                  {invoice ? (
                    <EntityLink to="invoice" id={invoice.id} className="font-medium">
                      {invoice.label}
                    </EntityLink>
                  ) : (
                    'Facturado'
                  )}
                </Value>
              </HeaderField>
              <HeaderField label="Prioridad">
                <Value>
                  {order.priority === null ? (
                    <span className="text-ink-2">Por fecha prometida</span>
                  ) : (
                    <span className="font-semibold tabular-nums">{order.priority}</span>
                  )}
                </Value>
              </HeaderField>
              <HeaderField label="Despacho parcial">
                <Value>{order.allowPartial ? 'Permitido' : 'No: sale completo'}</Value>
              </HeaderField>
              <HeaderField label="Recibió">
                <Value>{order.receivedBy ?? '—'}</Value>
              </HeaderField>
            </>
          ) : null}
        </HeaderGrid>
        <DocumentSection title="Detalle del pedido" flush>
          <DocTable
            label={`Líneas de ${order.label}`}
            columns={columns}
            rows={order.lines}
            rowKey={(line) => line.productId}
            minWidth={fulfilment || lineCoverage ? 900 : 640}
          />
        </DocumentSection>
      </DocumentScreen>

      <div className="mt-4 rounded-[8px] border border-line bg-surface">
        {invoice ? <InvoiceSection invoice={invoice} /> : null}
        {shipments.data && shipments.data.length > 0 ? (
          <ShipmentsSection
            orderId={order.id}
            shipments={shipments.data}
            onOpen={(shipment) => {
              if (canOpen('shipment')) void navigate(pathTo('shipment', shipment.id));
            }}
          />
        ) : null}
        <DocumentSection title="Auditoría del pedido" flush>
          <QueryView query={history}>{(entries) => <TrailTable entries={entries} />}</QueryView>
        </DocumentSection>
      </div>

      <CancelOrderDialog
        order={order}
        open={cancelOpen}
        onClose={() => {
          setCancelOpen(false);
        }}
      />
    </>
  );
}

function InvoiceSection({ invoice }: { invoice: Invoice }) {
  const navigate = useNavigate();
  const { canOpen } = useAccess();
  return (
    <DocumentSection title="Factura de venta" flush>
      <DocTable
        label="Factura del pedido"
        rows={[invoice]}
        rowKey={(row) => row.id}
        {...(canOpen('invoice')
          ? {
              onOpen: (row: Invoice) => {
                void navigate(pathTo('invoice', row.id));
              },
            }
          : {})}
        columns={[
          {
            key: 'label',
            header: 'Factura',
            render: (row) => (
              <EntityLink to="invoice" id={row.id} className="font-medium">
                {row.label}
              </EntityLink>
            ),
          },
          {
            key: 'date',
            header: 'Fecha',
            render: (row) => formatDate(colombiaDay(row.issuedAt)),
          },
          { key: 'due', header: 'Vence', render: (row) => formatDate(row.dueDate) },
          { key: 'by', header: 'Facturó', render: (row) => row.issuedBy },
          {
            key: 'total',
            header: 'Total',
            align: 'right',
            render: (row) => <Money value={row.total} />,
          },
          {
            key: 'paid',
            header: 'Abonos',
            align: 'right',
            render: (row) => <Money value={row.paid} />,
          },
          {
            key: 'balance',
            header: 'Saldo',
            align: 'right',
            render: (row) => <Money value={row.balance} strong />,
          },
          {
            key: 'status',
            header: 'Estado',
            render: (row) => <CollectionChip status={row.status} />,
          },
        ]}
      />
      {invoice.hasPending ? (
        <p className="px-5 py-2 text-[12px] text-ink-3">
          Se facturó con producto pendiente por fabricar o comprar.
        </p>
      ) : null}
    </DocumentSection>
  );
}

function ShipmentsSection({
  orderId,
  shipments,
  onOpen,
}: {
  orderId: string;
  shipments: Shipment[];
  onOpen: (shipment: Shipment) => void;
}) {
  return (
    <DocumentSection title="Guías de despacho" flush>
      <DocTable
        label="Guías del pedido"
        rows={shipments}
        rowKey={(row) => row.id}
        onOpen={onOpen}
        columns={[
          {
            key: 'label',
            header: 'Guía',
            render: (row) => (
              <EntityLink to="shipment" id={row.id} className="font-medium">
                {row.label}
              </EntityLink>
            ),
          },
          { key: 'date', header: 'Fecha', render: (row) => formatDate(row.scheduledDate) },
          { key: 'carrier', header: 'Transportador', render: (row) => row.carrier },
          {
            key: 'plate',
            header: 'Placa',
            className: 'tabular-nums',
            render: (row) => row.vehiclePlate,
          },
          { key: 'driver', header: 'Conductor', render: (row) => row.driverName },
          {
            key: 'partial',
            header: 'Parcial',
            render: (row) =>
              row.orders.find((entry) => entry.orderId === orderId)?.partial ? 'Sí' : 'No',
          },
          {
            key: 'received',
            header: 'Recibió',
            render: (row) =>
              row.orders.find((entry) => entry.orderId === orderId)?.receivedBy ?? '—',
          },
          {
            key: 'status',
            header: 'Estado',
            render: (row) => <ShipmentStatusChip status={row.status} />,
          },
        ]}
      />
    </DocumentSection>
  );
}

function TrailTable({ entries }: { entries: TrailEntry[] }) {
  return (
    <DocTable
      label="Auditoría del pedido"
      rows={entries}
      rowKey={(entry) => entry.id}
      empty="Sin pasos registrados."
      minWidth={760}
      columns={[
        {
          key: 'at',
          header: 'Fecha y hora',
          className: 'whitespace-nowrap tabular-nums text-ink-2',
          render: (entry) => colombiaDateTime(entry.occurredAt),
        },
        {
          key: 'document',
          header: 'Documento',
          className: 'whitespace-nowrap',
          render: (entry) => entry.label,
        },
        {
          key: 'action',
          header: 'Acción',
          className: 'whitespace-nowrap font-medium',
          render: (entry) => actionLabel(entry.action),
        },
        { key: 'actor', header: 'Usuario', render: (entry) => entry.actor.name },
        {
          key: 'role',
          header: 'Rol',
          className: 'text-ink-2',
          render: (entry) => entry.actor.role ?? '—',
        },
        { key: 'summary', header: 'Detalle', render: (entry) => entry.summary },
      ]}
    />
  );
}
