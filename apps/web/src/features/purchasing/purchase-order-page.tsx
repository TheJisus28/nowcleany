import { Ban, PackageCheck } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { api } from '../../api/client';
import { useAction, usePurchaseOrder } from '../../api/hooks';
import type { PurchaseOrder } from '../../api/types';
import { useAccess } from '../../app/access';
import { useSession } from '../../auth/session';
import { BackLink, EntityLink } from '../../components/links';
import { Qty } from '../../components/qty';
import { DueDate, PurchaseStatusChip } from '../../components/status';
import { Button, PageHeader, Panel, QueryView } from '../../components/ui';
import { formatDate, formatDateTime } from '../../lib/format';
import { ReceiveDialog } from './receive-dialog';

export function PurchaseOrderPage() {
  const { id } = useParams();
  const order = usePurchaseOrder(id);
  return <QueryView query={order}>{(data) => <PurchaseOrderView order={data} />}</QueryView>;
}

function PurchaseOrderView({ order }: { order: PurchaseOrder }) {
  const { can } = useSession();
  const { has } = useAccess();
  const [receiving, setReceiving] = useState(false);
  const cancel = useAction(
    () => api.post<PurchaseOrder>(`/v1/purchase-orders/${order.id}/cancel`),
    { success: (result) => `${result.label} anulada` },
  );
  const open = order.status === 'OPEN';

  return (
    <>
      <BackLink
        fallback={has('purchasing') ? '/compras' : '/inventario?vista=por-recibir'}
        label={has('purchasing') ? 'Compras' : 'Inventario'}
      />
      <PageHeader
        title={order.label}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <PurchaseStatusChip status={order.status} />
            <span>{order.supplier.name}</span>
          </span>
        }
        actions={
          open ? (
            <>
              {can('purchasing:write') ? (
                <Button
                  variant="danger"
                  icon={<Ban className="size-4" />}
                  loading={cancel.isPending}
                  onClick={() => {
                    cancel.mutate(undefined);
                  }}
                >
                  Anular
                </Button>
              ) : null}
              {can('purchasing:receive') ? (
                <Button
                  icon={<PackageCheck className="size-4" />}
                  onClick={() => {
                    setReceiving(true);
                  }}
                >
                  Recibir
                </Button>
              ) : null}
            </>
          ) : null
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Insumos" flush>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2/70 text-left text-[12.5px] text-ink-2">
                <th className="px-4 py-2.5 font-medium">Insumo</th>
                <th className="px-4 py-2.5 text-right font-medium">Pedido</th>
                <th className="px-4 py-2.5 text-right font-medium">Recibido</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => (
                <tr key={line.productId} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <EntityLink to="product" id={line.productId} className="font-medium">
                      {line.productName}
                    </EntityLink>
                    <span className="block text-[12.5px] text-ink-3">{line.productCode}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Qty value={line.quantity} emphasis />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {line.receivedQuantity ? (
                      <Qty value={line.receivedQuantity} />
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Datos">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
            <dt className="text-ink-3">Proveedor</dt>
            <dd>{order.supplier.name}</dd>
            <dt className="text-ink-3">Llega</dt>
            <dd>
              {formatDate(order.expectedDate)}
              {open ? (
                <span className="block text-[12.5px]">
                  <DueDate date={order.expectedDate} />
                </span>
              ) : null}
            </dd>
            <dt className="text-ink-3">Pedida</dt>
            <dd>
              {formatDateTime(order.createdAt)}
              <span className="block text-[12.5px] text-ink-3">por {order.createdBy}</span>
            </dd>
            {order.receivedAt ? (
              <>
                <dt className="text-ink-3">Recibida</dt>
                <dd>
                  {formatDateTime(order.receivedAt)}
                  <span className="block text-[12.5px] text-ink-3">por {order.receivedBy}</span>
                </dd>
              </>
            ) : null}
            {order.receiptDocument ? (
              <>
                <dt className="text-ink-3">Factura</dt>
                <dd>{order.receiptDocument}</dd>
              </>
            ) : null}
            {order.cancelledAt ? (
              <>
                <dt className="text-ink-3">Anulada</dt>
                <dd>{formatDateTime(order.cancelledAt)}</dd>
              </>
            ) : null}
            {order.notes ? (
              <>
                <dt className="text-ink-3">Notas</dt>
                <dd className="whitespace-pre-line">{order.notes}</dd>
              </>
            ) : null}
          </dl>
        </Panel>
      </div>

      {receiving ? (
        <ReceiveDialog
          order={order}
          onClose={() => {
            setReceiving(false);
          }}
        />
      ) : null}
    </>
  );
}
