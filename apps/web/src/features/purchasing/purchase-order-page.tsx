import { Ban, CircleCheckBig, PackagePlus, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { api } from '../../api/client';
import {
  useAction,
  usePurchaseOrder,
  usePurchaseOrders,
  useSupplierInvoices,
} from '../../api/hooks';
import type { PurchaseOrder } from '../../api/types';
import { useAccess } from '../../app/access';
import { useSession } from '../../auth/session';
import {
  DocumentScreen,
  DocumentSection,
  DocumentToolbar,
  HeaderField,
  HeaderGrid,
  useWorkTab,
} from '../../components/erp';
import { EntityLink } from '../../components/links';
import { Qty } from '../../components/qty';
import { PurchaseStatusChip } from '../../components/status';
import { cn, QueryView } from '../../components/ui';
import {
  formatCop,
  formatDate,
  formatDateTime,
  formatDecimal,
  isZero,
  roundUpDecimal,
  unitLabel,
} from '../../lib/format';
import {
  ConfirmDialog,
  DateCell,
  DocumentNotice,
  GRID_HEAD,
  GRID_TD,
  GRID_TH,
  localDay,
  neighbors,
} from '../inventory/erp-kit';
import { pendingValue, vatOf } from './money';

export function PurchaseOrderPage() {
  const { id } = useParams();
  const order = usePurchaseOrder(id);
  const list = usePurchaseOrders();
  const ids = useMemo(
    () =>
      list.data
        ? [...list.data].sort((a, b) => a.label.localeCompare(b.label)).map((row) => row.id)
        : undefined,
    [list.data],
  );
  return (
    <QueryView query={order}>
      {(data) => <PurchaseOrderDocument key={`${data.id}-${data.status}`} order={data} ids={ids} />}
    </QueryView>
  );
}

function PurchaseOrderDocument({
  order,
  ids,
}: {
  order: PurchaseOrder;
  ids: string[] | undefined;
}) {
  const { can } = useSession();
  const { has } = useAccess();
  useWorkTab(`${order.label} · ${order.supplier.name}`);
  const [pending, setPending] = useState<'cancel' | 'close' | null>(null);
  const open = order.status === 'OPEN' || order.status === 'PARTIAL';
  const subtotal = BigInt(order.total);
  const tax = vatOf(subtotal);
  const nav = neighbors(ids, order.id, (value) => `/compras/ordenes/${value}`);
  const closeTo = has('purchasing') ? '/compras' : has('receiving') ? '/recepcion' : '/';

  const cancelOrder = useAction(
    () => api.post<PurchaseOrder>(`/v1/purchase-orders/${order.id}/cancel`),
    { success: (result) => `${result.label} anulada` },
  );
  const closeOrder = useAction(
    () => api.post<PurchaseOrder>(`/v1/purchase-orders/${order.id}/close`),
    { success: (result) => `${result.label} cerrada con lo recibido` },
  );
  const canReceive = open && can('purchasing:receive');
  const canCancel = order.status === 'OPEN' && can('purchasing:write');
  const canClose = order.status === 'PARTIAL' && can('purchasing:write');

  return (
    <>
      <DocumentScreen
        kind="Orden de compra"
        number={order.label}
        status={<PurchaseStatusChip status={order.status} />}
        toolbar={
          <DocumentToolbar
            actions={[
              {
                label: 'Registrar entrada',
                icon: PackagePlus,
                shortcut: 'F9',
                primary: true,
                hidden: !canReceive,
                to: `/recepcion/nueva?orden=${order.id}`,
              },
              {
                label: 'Cerrar con lo recibido',
                icon: CircleCheckBig,
                hidden: !canClose,
                onClick: () => {
                  setPending('close');
                },
              },
              {
                label: 'Anular',
                icon: Ban,
                danger: true,
                hidden: !canCancel,
                onClick: () => {
                  setPending('cancel');
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
            previous={nav.previous}
            next={nav.next}
            closeTo={closeTo}
          />
        }
        notes={
          order.notes ? (
            <>
              <span className="mb-0.5 block text-[12px] font-medium text-ink-3">Observaciones</span>
              <span className="whitespace-pre-line">{order.notes}</span>
            </>
          ) : (
            <span className="text-ink-3">Sin observaciones.</span>
          )
        }
        totals={[
          { label: 'Subtotal', value: formatCop(order.total) },
          { label: 'IVA 19 %', value: formatCop(tax.toString()) },
          { label: 'Total', value: formatCop((subtotal + tax).toString()), strong: true },
          ...(order.status === 'PARTIAL'
            ? [
                {
                  label: 'Por recibir (antes de IVA)',
                  value: formatCop(pendingValue(order).toString()),
                },
              ]
            : []),
        ]}
        signatures={[
          { label: 'Elaboró', name: order.createdBy, at: formatDateTime(order.createdAt) },
          { label: 'Autorizó', name: null },
        ]}
      >
        {order.status === 'CANCELLED' ? (
          <DocumentNotice tone="info">
            Orden anulada el {formatDateTime(order.cancelledAt)}: no cuenta como en tránsito.
          </DocumentNotice>
        ) : order.status === 'CLOSED' ? (
          <DocumentNotice tone="info">
            Cerrada con lo recibido: lo que faltaba dejó de contar como en tránsito.
          </DocumentNotice>
        ) : null}
        <HeaderGrid>
          <HeaderField label="Proveedor" span={2}>
            <span className="font-medium">{order.supplier.name}</span>
          </HeaderField>
          <HeaderField label="Fecha">{formatDate(localDay(order.createdAt))}</HeaderField>
          <HeaderField label="Fecha esperada">
            <DateCell date={order.expectedDate} pending={open} lateLabel="No ha llegado" />
          </HeaderField>
          <HeaderField label="Elaboró">{order.createdBy}</HeaderField>
          <HeaderField label={order.status === 'CLOSED' ? 'Última entrada' : 'Recibida'}>
            {order.receivedAt ? (
              formatDateTime(order.receivedAt)
            ) : (
              <span className="text-ink-3">—</span>
            )}
          </HeaderField>
          <HeaderField label="Condición de pago">Crédito 30 días</HeaderField>
        </HeaderGrid>

        <DocumentSection title="Productos" flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-[13.5px]">
              <thead>
                <tr className={GRID_HEAD}>
                  <th className={cn(GRID_TH, 'w-10 text-center')}>#</th>
                  <th className={cn(GRID_TH, 'w-24')}>Código</th>
                  <th className={GRID_TH}>Descripción</th>
                  <th className={cn(GRID_TH, 'w-12')}>Und</th>
                  <th className={cn(GRID_TH, 'text-right')}>Pedido</th>
                  <th className={cn(GRID_TH, 'text-right')}>Recibido</th>
                  <th className={cn(GRID_TH, 'text-right')}>Pendiente</th>
                  <th className={cn(GRID_TH, 'text-right')}>Costo unit.</th>
                  <th className={cn(GRID_TH, 'pr-5 text-right')}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line, index) => {
                  const done = isZero(line.pending.quantity);
                  return (
                    <tr key={line.productId} className="border-b border-line">
                      <td className={cn(GRID_TD, 'text-center text-ink-3 tabular-nums')}>
                        {index + 1}
                      </td>
                      <td className={cn(GRID_TD, 'tabular-nums')}>{line.productCode}</td>
                      <td className={GRID_TD}>
                        <EntityLink to="product" id={line.productId}>
                          {line.productName}
                        </EntityLink>
                      </td>
                      <td className={cn(GRID_TD, 'text-ink-2')}>{unitLabel(line.quantity.unit)}</td>
                      <td className={cn(GRID_TD, 'text-right font-medium tabular-nums')}>
                        {formatDecimal(roundUpDecimal(line.quantity.quantity))}
                      </td>
                      <td className={cn(GRID_TD, 'text-right tabular-nums', done && 'text-good')}>
                        {formatDecimal(roundUpDecimal(line.received.quantity))}
                      </td>
                      <td
                        className={cn(
                          GRID_TD,
                          'text-right tabular-nums',
                          done ? 'text-ink-3' : 'font-medium',
                        )}
                      >
                        {done ? '—' : formatDecimal(roundUpDecimal(line.pending.quantity))}
                      </td>
                      <td className={cn(GRID_TD, 'text-right tabular-nums')}>
                        {formatCop(line.unitCost)}
                      </td>
                      <td className={cn(GRID_TD, 'pr-5 text-right font-medium tabular-nums')}>
                        {formatCop(line.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DocumentSection>

        <EntriesSection order={order} />
      </DocumentScreen>

      <ConfirmDialog
        open={pending === 'cancel'}
        title={`¿Anular ${order.label}?`}
        description={`${order.supplier.name} no ha entregado nada de esta orden. Al anularla deja de contar como en tránsito y lo que pedía vuelve a aparecer en lo que hay que comprar.`}
        confirmLabel="Anular orden"
        danger
        loading={cancelOrder.isPending}
        onClose={() => {
          setPending(null);
        }}
        onConfirm={() => {
          cancelOrder.mutate(undefined, {
            onSuccess: () => {
              setPending(null);
            },
          });
        }}
      />
      <ConfirmDialog
        open={pending === 'close'}
        title={`¿Cerrar ${order.label} con lo recibido?`}
        description="El proveedor no enviará el resto: lo pendiente deja de contar como en tránsito y la orden ya no recibe más entradas."
        confirmLabel="Cerrar con lo recibido"
        loading={closeOrder.isPending}
        onClose={() => {
          setPending(null);
        }}
        onConfirm={() => {
          closeOrder.mutate(undefined, {
            onSuccess: () => {
              setPending(null);
            },
          });
        }}
      >
        <p className="mb-2 text-[13px] font-medium">Queda sin llegar</p>
        <table className="w-full text-[13.5px]">
          <tbody>
            {order.lines
              .filter((line) => !isZero(line.pending.quantity))
              .map((line) => (
                <tr key={line.productId} className="border-b border-line last:border-0">
                  <td className="py-1.5 pr-3 text-ink-3 tabular-nums">{line.productCode}</td>
                  <td className="py-1.5 pr-3">{line.productName}</td>
                  <td className="py-1.5 text-right font-semibold">
                    <Qty value={line.pending} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </ConfirmDialog>
    </>
  );
}

/** The warehouse entries (supplier invoices) received against the order. */
function EntriesSection({ order }: { order: PurchaseOrder }) {
  const invoices = useSupplierInvoices({ purchaseOrderId: order.id });
  return (
    <DocumentSection title="Entradas de almacén" flush>
      <QueryView query={invoices}>
        {(rows) => (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-[13.5px]">
              <thead>
                <tr className={GRID_HEAD}>
                  <th className={cn(GRID_TH, 'pl-5')}>Factura del proveedor</th>
                  <th className={GRID_TH}>Fecha factura</th>
                  <th className={GRID_TH}>Productos</th>
                  <th className={cn(GRID_TH, 'text-right')}>Subtotal</th>
                  <th className={cn(GRID_TH, 'text-right')}>IVA</th>
                  <th className={cn(GRID_TH, 'text-right')}>Total</th>
                  <th className={GRID_TH}>Vence</th>
                  <th className={cn(GRID_TH, 'pr-5')}>Recibió</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-6 text-center text-ink-3">
                      Todavía no se ha registrado ninguna entrada contra esta orden.
                    </td>
                  </tr>
                ) : (
                  rows.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-line last:border-0">
                      <td className={cn(GRID_TD, 'pl-5 font-medium tabular-nums')}>
                        {invoice.documentNumber}
                      </td>
                      <td className={GRID_TD}>{formatDate(invoice.invoiceDate)}</td>
                      <td className={cn(GRID_TD, 'text-[12.5px] text-ink-2')}>
                        {invoice.lines
                          .map(
                            (line) =>
                              `${line.productCode}: ${formatDecimal(roundUpDecimal(line.quantity.quantity))} ${unitLabel(line.quantity.unit)}`,
                          )
                          .join(' · ')}
                      </td>
                      <td className={cn(GRID_TD, 'text-right tabular-nums')}>
                        {formatCop(invoice.subtotal)}
                      </td>
                      <td className={cn(GRID_TD, 'text-right tabular-nums')}>
                        {formatCop(invoice.tax)}
                      </td>
                      <td className={cn(GRID_TD, 'text-right font-medium tabular-nums')}>
                        {formatCop(invoice.total)}
                      </td>
                      <td className={GRID_TD}>
                        {isZero(invoice.balance) ? (
                          <span className="text-good">Pagada</span>
                        ) : (
                          <DateCell date={invoice.dueDate} pending lateLabel="Vencida" />
                        )}
                      </td>
                      <td className={cn(GRID_TD, 'pr-5 text-ink-2')}>
                        {invoice.receivedBy}
                        <span className="block text-[12px] text-ink-3">
                          {formatDateTime(invoice.createdAt)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </QueryView>
    </DocumentSection>
  );
}
