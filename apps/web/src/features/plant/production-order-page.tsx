import { Ban, CircleCheck } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { api } from '../../api/client';
import { useAction, useProductionOrder } from '../../api/hooks';
import type { ProductionOrder } from '../../api/types';
import { useSession } from '../../auth/session';
import { BackLink, EntityLink } from '../../components/links';
import { Qty } from '../../components/qty';
import { DueDate, ProductionStatusChip } from '../../components/status';
import { Button, Field, Input, PageHeader, Panel, QueryView } from '../../components/ui';
import {
  formatDate,
  formatDateTime,
  formatDecimal,
  isZero,
  parseDecimalInput,
  unitLabel,
} from '../../lib/format';

export function ProductionOrderPage() {
  const { id } = useParams();
  const order = useProductionOrder(id);
  return <QueryView query={order}>{(data) => <ProductionOrderView order={data} />}</QueryView>;
}

function ProductionOrderView({ order }: { order: ProductionOrder }) {
  const { can } = useSession();
  const [produced, setProduced] = useState('');
  const parsed = parseDecimalInput(produced);
  const editable = order.status === 'PLANNED' && can('production:write');

  const complete = useAction(
    () =>
      api.post<ProductionOrder>(
        `/v1/production-orders/${order.id}/complete`,
        parsed ? { producedQuantity: parsed } : {},
      ),
    { success: (result) => `${result.label} terminada: inventario actualizado` },
  );
  const cancel = useAction(
    () => api.post<ProductionOrder>(`/v1/production-orders/${order.id}/cancel`),
    { success: (result) => `${result.label} anulada` },
  );
  const short = order.materials?.filter((material) => !isZero(material.shortage.quantity)) ?? [];

  return (
    <>
      <BackLink fallback="/planta" label="Planta" />
      <PageHeader
        title={`${order.label} · ${order.kind}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ProductionStatusChip status={order.status} />
            <span>
              <EntityLink to="product" id={order.product.id} className="font-medium text-ink">
                {order.product.name}
              </EntityLink>{' '}
              · {order.product.code}
            </span>
          </span>
        }
        actions={
          editable ? (
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
          ) : null
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          {order.materials ? (
            <Panel
              title="Insumos según la fórmula vigente"
              description="Lo que se descuenta del inventario al registrar la producción."
              flush
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-2/70 text-left text-[12.5px] text-ink-2">
                    <th className="px-4 py-2.5 font-medium">Insumo</th>
                    <th className="px-4 py-2.5 text-right font-medium">Requiere</th>
                    <th className="px-4 py-2.5 text-right font-medium">Hay</th>
                    <th className="px-4 py-2.5 text-right font-medium">Falta</th>
                  </tr>
                </thead>
                <tbody>
                  {order.materials.map((material) => (
                    <tr key={material.productId} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5">
                        <EntityLink to="product" id={material.productId}>
                          {material.name}
                        </EntityLink>
                        <span className="block text-[12px] text-ink-3">
                          {material.code} · {material.typeLabel}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Qty value={material.required} />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Qty value={material.onHand} />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Qty
                          value={material.shortage}
                          dimZero
                          emphasis={!isZero(material.shortage.quantity)}
                          className={isZero(material.shortage.quantity) ? '' : 'text-critical'}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {short.length > 0 ? (
                <p className="border-t border-line px-4 py-3 text-[13px] text-ink-2">
                  Faltan {short.length} insumo{short.length === 1 ? '' : 's'}. Se puede registrar
                  igual: el inventario queda en negativo hasta que llegue la compra.
                </p>
              ) : null}
            </Panel>
          ) : null}

          {editable ? (
            <Panel title="Registrar producción">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <Field
                  label={`Cantidad producida real (${unitLabel(order.plannedQuantity.unit)})`}
                  hint={`Déjala vacía si se produjo lo planeado (${formatDecimal(order.plannedQuantity.quantity)}).`}
                  className="flex-1"
                >
                  {(props) => (
                    <Input
                      {...props}
                      inputMode="decimal"
                      value={produced}
                      placeholder={formatDecimal(order.plannedQuantity.quantity)}
                      onChange={(event) => {
                        setProduced(event.target.value);
                      }}
                    />
                  )}
                </Field>
                <Button
                  icon={<CircleCheck className="size-4" />}
                  loading={complete.isPending}
                  disabled={produced !== '' && (!parsed || Number(parsed) <= 0)}
                  className="sm:mb-6"
                  onClick={() => {
                    complete.mutate(undefined, {
                      onSuccess: () => {
                        setProduced('');
                      },
                    });
                  }}
                >
                  Registrar producción
                </Button>
              </div>
            </Panel>
          ) : null}
        </div>

        <Panel title="Datos">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
            <dt className="text-ink-3">Planeado</dt>
            <dd>
              <Qty value={order.plannedQuantity} emphasis />
            </dd>
            {order.producedQuantity ? (
              <>
                <dt className="text-ink-3">Producido</dt>
                <dd>
                  <Qty value={order.producedQuantity} emphasis />
                </dd>
              </>
            ) : null}
            {order.batches ? (
              <>
                <dt className="text-ink-3">Baches</dt>
                <dd>
                  {order.batches}
                  {order.batchCapacity ? (
                    <span className="text-ink-3">
                      {' '}
                      de {formatDecimal(order.batchCapacity.quantity)}{' '}
                      {unitLabel(order.batchCapacity.unit)}
                    </span>
                  ) : null}
                </dd>
              </>
            ) : null}
            <dt className="text-ink-3">Programada</dt>
            <dd>
              {formatDate(order.scheduledDate)}
              {order.status === 'PLANNED' ? (
                <span className="block text-[12.5px]">
                  <DueDate date={order.scheduledDate} />
                </span>
              ) : null}
            </dd>
            <dt className="text-ink-3">Creada</dt>
            <dd>
              {formatDateTime(order.createdAt)}
              <span className="block text-[12.5px] text-ink-3">por {order.createdBy}</span>
            </dd>
            {order.completedAt ? (
              <>
                <dt className="text-ink-3">Terminada</dt>
                <dd>
                  {formatDateTime(order.completedAt)}
                  <span className="block text-[12.5px] text-ink-3">por {order.completedBy}</span>
                </dd>
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
    </>
  );
}
