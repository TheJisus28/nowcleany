import { CircleCheck, Clock, PackageOpen, ReceiptText, Truck } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { usePurchaseOrders, useSupplierInvoices } from '../../api/hooks';
import type { PurchaseOrder, SupplierInvoice } from '../../api/types';
import { useSession } from '../../auth/session';
import { DataTable } from '../../components/data-table';
import { Kpi } from '../../components/kpi';
import { EntityLink, pathTo } from '../../components/links';
import { Qty } from '../../components/qty';
import { DueDate, PurchaseStatusChip } from '../../components/status';
import { Button, EmptyState, PageHeader, Panel, QueryView } from '../../components/ui';
import {
  daysUntil,
  formatCop,
  formatCopShort,
  formatDate,
  formatDateTime,
  isZero,
  plural,
  todayIso,
} from '../../lib/format';
import { pendingValue } from './money';
import { SupplierInvoiceDialog } from './supplier-invoice-dialog';

/**
 * Receiving's desk: purchase orders waiting for goods, and the supplier invoices already entered.
 * Entering an invoice against its order is what brings the goods into the stock.
 */
export function ReceivingPage() {
  const orders = usePurchaseOrders('OPEN,PARTIAL');
  const invoices = useSupplierInvoices();
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);

  return (
    <>
      <PageHeader
        title="Recepción de facturas"
        description="Cuando llega la mercancía con la factura del proveedor, ingrésala contra su orden de compra: así entra al inventario y queda lista para pagar."
      />

      <ReceivingKpis orders={orders.data} invoices={invoices.data} />

      <Panel
        title="Órdenes esperando mercancía"
        description="En tránsito y recibidas parcial, primero la que debía llegar antes."
        className="mb-6"
        flush
      >
        <QueryView query={orders}>
          {(rows) => (
            <PendingOrders
              rows={rows}
              onReceive={(order) => {
                setReceiving(order);
              }}
            />
          )}
        </QueryView>
      </Panel>

      <Panel
        title="Facturas ingresadas recientemente"
        description="Las últimas facturas de proveedor registradas, con su total y vencimiento."
        flush
      >
        <QueryView query={invoices}>{(rows) => <RecentInvoices rows={rows} />}</QueryView>
      </Panel>

      {receiving ? (
        <SupplierInvoiceDialog
          order={receiving}
          onClose={() => {
            setReceiving(null);
          }}
        />
      ) : null}
    </>
  );
}

function ReceivingKpis({
  orders,
  invoices,
}: {
  orders: PurchaseOrder[] | undefined;
  invoices: SupplierInvoice[] | undefined;
}) {
  const waiting = orders ?? [];
  const late = waiting.filter((order) => (daysUntil(order.expectedDate) ?? 0) < 0);
  const today = waiting.filter((order) => daysUntil(order.expectedDate) === 0);
  const month = todayIso().slice(0, 7);
  const thisMonth = (invoices ?? []).filter((invoice) => invoice.createdAt.startsWith(month));
  const entered = thisMonth.reduce((sum, invoice) => sum + BigInt(invoice.total), 0n);
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi
        label="Órdenes esperando"
        value={orders ? waiting.length : '…'}
        icon={Truck}
        tone="brand"
        hint={plural(
          waiting.filter((order) => order.status === 'PARTIAL').length,
          'recibida parcial',
          'recibidas parcial',
        )}
      />
      <Kpi
        label="Llegan hoy"
        value={orders ? today.length : '…'}
        icon={PackageOpen}
        hint="Según la fecha esperada de la orden"
      />
      <Kpi
        label="Atrasadas"
        value={orders ? late.length : '…'}
        icon={Clock}
        tone={late.length > 0 ? 'critical' : 'good'}
        hint={late.length > 0 ? 'Pasó la fecha y no han llegado' : 'Ninguna atrasada'}
      />
      <Kpi
        label="Ingresado este mes"
        value={
          invoices ? (
            <span title={formatCop(entered.toString())}>{formatCopShort(entered.toString())}</span>
          ) : (
            '…'
          )
        }
        icon={ReceiptText}
        hint={plural(thisMonth.length, 'factura con IVA', 'facturas con IVA')}
      />
    </div>
  );
}

function PendingOrders({
  rows,
  onReceive,
}: {
  rows: PurchaseOrder[];
  onReceive: (order: PurchaseOrder) => void;
}) {
  const navigate = useNavigate();
  const { can } = useSession();
  const canReceive = can('purchasing:receive');
  return (
    <DataTable<PurchaseOrder>
      label="Órdenes esperando mercancía"
      rows={[...rows].sort((a, b) => (a.expectedDate ?? '9').localeCompare(b.expectedDate ?? '9'))}
      rowKey={(row) => row.id}
      onRowClick={(row) => {
        void navigate(pathTo('purchase-order', row.id));
      }}
      empty={
        <EmptyState
          icon={<CircleCheck />}
          title="No hay mercancía en camino"
          description="Cuando compras haga una orden, aparecerá aquí para recibirla."
        />
      }
      columns={[
        {
          key: 'label',
          header: 'Orden',
          render: (row) => (
            <span>
              <EntityLink to="purchase-order" id={row.id} className="font-medium">
                {row.label}
              </EntityLink>
              <span className="block text-[12.5px] text-ink-3">{row.supplier.name}</span>
            </span>
          ),
        },
        {
          key: 'expected',
          header: 'Esperada',
          render: (row) => (
            <span>
              <DueDate date={row.expectedDate} lateLabel="No ha llegado" />
              <span className="block text-[12px] text-ink-3">{formatDate(row.expectedDate)}</span>
            </span>
          ),
        },
        {
          key: 'pending',
          header: 'Pendiente por llegar',
          render: (row) => (
            <ul className="flex flex-col gap-0.5 text-[13px]">
              {row.lines
                .filter((line) => !isZero(line.pending.quantity))
                .map((line) => (
                  <li key={line.productId}>
                    <span className="text-ink-2">{line.productName}:</span>{' '}
                    <Qty value={line.pending} emphasis />
                  </li>
                ))}
            </ul>
          ),
        },
        {
          key: 'value',
          header: 'Valor pendiente',
          align: 'right',
          hideOnMobile: true,
          render: (row) => formatCop(pendingValue(row).toString()),
        },
        {
          key: 'status',
          header: 'Estado',
          render: (row) => <PurchaseStatusChip status={row.status} />,
        },
        ...(canReceive
          ? [
              {
                key: 'action',
                header: '',
                align: 'right' as const,
                render: (row: PurchaseOrder) => (
                  <Button
                    size="sm"
                    icon={<ReceiptText className="size-3.5" />}
                    onClick={(event) => {
                      event.stopPropagation();
                      onReceive(row);
                    }}
                  >
                    Ingresar factura del proveedor
                  </Button>
                ),
              },
            ]
          : []),
      ]}
    />
  );
}

function RecentInvoices({ rows }: { rows: SupplierInvoice[] }) {
  const recent = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 25);
  return (
    <DataTable<SupplierInvoice>
      label="Facturas ingresadas"
      rows={recent}
      rowKey={(row) => row.id}
      empty={
        <EmptyState
          icon={<ReceiptText />}
          title="Aún no hay facturas de proveedor"
          description="Las facturas que ingreses aparecerán aquí."
        />
      }
      columns={[
        {
          key: 'document',
          header: 'Factura',
          render: (row) => (
            <span>
              <span className="font-medium">{row.documentNumber}</span>
              <span className="block text-[12.5px] text-ink-3">{row.supplier.name}</span>
            </span>
          ),
        },
        {
          key: 'order',
          header: 'Orden',
          render: (row) => (
            <EntityLink to="purchase-order" id={row.purchaseOrder.id}>
              {row.purchaseOrder.label}
            </EntityLink>
          ),
        },
        {
          key: 'date',
          header: 'Fecha',
          render: (row) => (
            <span>
              {formatDate(row.invoiceDate)}
              <span className="block text-[12px] text-ink-3">
                Ingresada {formatDateTime(row.createdAt)}
              </span>
            </span>
          ),
        },
        {
          key: 'products',
          header: 'Llegó',
          hideOnMobile: true,
          render: (row) => (
            <ul className="text-[13px]">
              {row.lines.map((line) => (
                <li key={line.productId}>
                  <span title={line.productName}>{line.productCode}</span>:{' '}
                  <Qty value={line.quantity} />
                </li>
              ))}
            </ul>
          ),
        },
        {
          key: 'total',
          header: 'Total con IVA',
          align: 'right',
          render: (row) => <span className="font-medium">{formatCop(row.total)}</span>,
        },
        {
          key: 'receivedBy',
          header: 'Recibió',
          hideOnMobile: true,
          render: (row) => row.receivedBy,
        },
      ]}
    />
  );
}
