import { Ban, CircleCheck, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { api } from '../../api/client';
import { useAction, useProductionOrder, useProductionOrders, useWarehouses } from '../../api/hooks';
import type { ProductionOrder } from '../../api/types';
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
import { ProductionStatusChip } from '../../components/status';
import { cn, QueryView } from '../../components/ui';
import {
  formatDateTime,
  formatDecimal,
  isZero,
  parseDecimalInput,
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
  INPUT,
  SELECT,
  neighbors,
} from '../inventory/erp-kit';
import { compareDecimals } from './decimal';

export function ProductionOrderPage() {
  const { id } = useParams();
  const order = useProductionOrder(id);
  const list = useProductionOrders();
  const ids = useMemo(
    () =>
      [...(list.data ?? [])].sort((a, b) => a.label.localeCompare(b.label)).map((row) => row.id),
    [list.data],
  );
  return (
    <QueryView query={order}>
      {(data) => (
        <ProductionOrderDocument
          key={`${data.id}-${data.status}`}
          order={data}
          ids={list.data ? ids : undefined}
        />
      )}
    </QueryView>
  );
}

function ProductionOrderDocument({
  order,
  ids,
}: {
  order: ProductionOrder;
  ids: string[] | undefined;
}) {
  const { can } = useSession();
  useWorkTab(`${order.label} · ${order.product.name}`);
  const isPackaging = order.product.type === 'FINISHED_GOOD';
  const editable = order.status === 'PLANNED' && can('production:write');
  const unit = unitLabel(order.plannedQuantity.unit);
  const bulk = order.materials?.find((material) => material.typeLabel === 'Granel');
  const [produced, setProduced] = useState(formatDecimal(order.plannedQuantity.quantity));
  const [leftover, setLeftover] = useState('');
  const [pending, setPending] = useState<'complete' | 'cancel' | null>(null);
  const warehouses = useWarehouses();
  const [fromWarehouse, setFromWarehouse] = useState('');
  const [toWarehouse, setToWarehouse] = useState('');
  const firstWarehouse = warehouses.data?.[0]?.code ?? '';
  const consumeFrom = fromWarehouse || firstWarehouse;
  const outputTo = toWarehouse || firstWarehouse;
  const parsedProduced = parseDecimalInput(produced);
  const parsedLeftover = leftover.trim() === '' ? '0' : parseDecimalInput(leftover);
  const producedError =
    parsedProduced === null || compareDecimals(parsedProduced, '0') <= 0
      ? `Escribe la cantidad real producida en ${unit}.`
      : undefined;
  const leftoverError =
    parsedLeftover === null ? 'Escribe los litros que sobraron o déjalo vacío.' : undefined;
  const short = order.materials?.filter((material) => !isZero(material.shortage.quantity)) ?? [];

  const complete = useAction(
    () =>
      api.post<ProductionOrder>(`/v1/production-orders/${order.id}/complete`, {
        producedQuantity: parsedProduced ?? order.plannedQuantity.quantity,
        ...(consumeFrom ? { fromWarehouse: consumeFrom } : {}),
        ...(outputTo ? { toWarehouse: outputTo } : {}),
        ...(isPackaging && parsedLeftover && compareDecimals(parsedLeftover, '0') > 0
          ? { bulkWaste: parsedLeftover }
          : {}),
      }),
    { success: (result) => `${result.label} terminada: el inventario quedó actualizado` },
  );
  const cancel = useAction(
    () => api.post<ProductionOrder>(`/v1/production-orders/${order.id}/cancel`),
    { success: (result) => `${result.label} anulada` },
  );
  const nav = neighbors(ids, order.id, (value) => `/planta/ordenes/${value}`);

  return (
    <>
      <DocumentScreen
        kind={order.kind}
        number={order.label}
        status={<ProductionStatusChip status={order.status} />}
        toolbar={
          <DocumentToolbar
            actions={[
              {
                label: 'Terminar producción',
                icon: CircleCheck,
                shortcut: 'F9',
                primary: true,
                hidden: !editable,
                disabled: Boolean(producedError ?? leftoverError),
                onClick: () => {
                  setPending('complete');
                },
              },
              {
                label: 'Anular',
                icon: Ban,
                danger: true,
                hidden: !editable,
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
            closeTo="/planta/produccion"
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
          {
            label: 'Planeado',
            value: `${formatDecimal(order.plannedQuantity.quantity)} ${unit}`,
          },
          {
            label: 'Producido',
            value: order.producedQuantity
              ? `${formatDecimal(order.producedQuantity.quantity)} ${unitLabel(order.producedQuantity.unit)}`
              : '—',
            strong: true,
          },
        ]}
        signatures={[
          { label: 'Elaboró', name: order.createdBy, at: formatDateTime(order.createdAt) },
          {
            label: 'Terminó',
            name: order.completedBy,
            at: order.completedAt ? formatDateTime(order.completedAt) : null,
          },
        ]}
      >
        {order.status === 'CANCELLED' ? (
          <DocumentNotice tone="info">
            Orden anulada el {formatDateTime(order.cancelledAt)}: no movió inventario.
          </DocumentNotice>
        ) : null}
        <HeaderGrid>
          <HeaderField label="Producto" span={2}>
            <span className="text-ink-3 tabular-nums">{order.product.code}</span>{' '}
            <EntityLink to="product" id={order.product.id} className="font-medium">
              {order.product.name}
            </EntityLink>
          </HeaderField>
          <HeaderField label="Tipo de orden">{order.kind}</HeaderField>
          <HeaderField label="Fecha programada">
            <DateCell
              date={order.scheduledDate}
              pending={order.status === 'PLANNED'}
              lateLabel="Atrasada"
            />
          </HeaderField>
          <HeaderField label="Cantidad planeada">
            <span className="font-semibold tabular-nums">
              {formatDecimal(order.plannedQuantity.quantity)}
            </span>{' '}
            <span className="text-ink-3">{unit}</span>
          </HeaderField>
          <HeaderField label="Baches">
            {order.batches ? (
              <>
                {order.batches}
                {order.batchCapacity ? (
                  <span className="text-ink-3">
                    {' '}
                    de {formatDecimal(order.batchCapacity.quantity)}{' '}
                    {unitLabel(order.batchCapacity.unit)}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-ink-3">—</span>
            )}
          </HeaderField>
          <HeaderField label="Elaborada">
            {formatDateTime(order.createdAt)}
            <span className="text-ink-2"> · {order.createdBy}</span>
          </HeaderField>
          <HeaderField label={order.status === 'CANCELLED' ? 'Anulada' : 'Terminada'}>
            {order.status === 'CANCELLED' ? (
              formatDateTime(order.cancelledAt)
            ) : order.completedAt ? (
              <>
                {formatDateTime(order.completedAt)}
                {order.completedBy ? (
                  <span className="text-ink-2"> · {order.completedBy}</span>
                ) : null}
              </>
            ) : (
              <span className="text-ink-3">Pendiente</span>
            )}
          </HeaderField>
        </HeaderGrid>

        {order.materials ? (
          <DocumentSection title="Insumos según la fórmula vigente" flush>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-[13.5px]">
                <thead>
                  <tr className={GRID_HEAD}>
                    <th className={cn(GRID_TH, 'w-10 text-center')}>#</th>
                    <th className={cn(GRID_TH, 'w-28')}>Código</th>
                    <th className={GRID_TH}>Insumo</th>
                    <th className={GRID_TH}>Tipo</th>
                    <th className={cn(GRID_TH, 'w-12')}>Und</th>
                    <th className={cn(GRID_TH, 'text-right')}>Requerido</th>
                    <th className={cn(GRID_TH, 'text-right')}>En bodega</th>
                    <th className={cn(GRID_TH, 'text-right')}>Falta</th>
                  </tr>
                </thead>
                <tbody>
                  {order.materials.map((material, index) => {
                    const missing = !isZero(material.shortage.quantity);
                    return (
                      <tr key={material.productId} className="border-b border-line">
                        <td className={cn(GRID_TD, 'text-center text-ink-3 tabular-nums')}>
                          {index + 1}
                        </td>
                        <td className={cn(GRID_TD, 'tabular-nums')}>{material.code}</td>
                        <td className={GRID_TD}>
                          <EntityLink to="product" id={material.productId}>
                            {material.name}
                          </EntityLink>
                        </td>
                        <td className={cn(GRID_TD, 'text-ink-2')}>{material.typeLabel}</td>
                        <td className={cn(GRID_TD, 'text-ink-2')}>
                          {unitLabel(material.required.unit)}
                        </td>
                        <td className={cn(GRID_TD, 'text-right font-medium tabular-nums')}>
                          {formatDecimal(roundUpDecimal(material.required.quantity))}
                        </td>
                        <td className={cn(GRID_TD, 'text-right tabular-nums')}>
                          {formatDecimal(roundUpDecimal(material.onHand.quantity))}
                        </td>
                        <td
                          className={cn(
                            GRID_TD,
                            'text-right tabular-nums',
                            missing ? 'font-semibold text-critical' : 'text-ink-3',
                          )}
                        >
                          {missing
                            ? formatDecimal(roundUpDecimal(material.shortage.quantity))
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {short.length > 0 && order.status === 'PLANNED' ? (
              <p className="px-5 py-2 text-[12.5px] text-ink-2">
                Faltan {short.length} insumo{short.length === 1 ? '' : 's'}. Se puede terminar
                igual: el inventario queda en negativo hasta que llegue la compra.
              </p>
            ) : null}
          </DocumentSection>
        ) : null}

        {editable ? (
          <DocumentSection
            title={isPackaging ? 'Registro del envasado' : 'Registro de la producción'}
          >
            <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-medium text-ink-3">
                  Cantidad real producida ({unit})
                </span>
                <input
                  className={cn(INPUT, 'text-right font-semibold tabular-nums')}
                  inputMode="decimal"
                  value={produced}
                  aria-invalid={producedError ? true : undefined}
                  onChange={(event) => {
                    setProduced(event.target.value);
                  }}
                />
                {producedError ? (
                  <span className="text-[12px] text-critical">{producedError}</span>
                ) : (
                  <span className="text-[12px] text-ink-3">
                    Planeado: {formatDecimal(order.plannedQuantity.quantity)} {unit}
                  </span>
                )}
              </label>
              {isPackaging ? (
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] font-medium text-ink-3">
                    Granel sobrante en el tanque (L)
                  </span>
                  <input
                    className={cn(INPUT, 'text-right tabular-nums')}
                    inputMode="decimal"
                    value={leftover}
                    placeholder="0"
                    aria-invalid={leftoverError ? true : undefined}
                    onChange={(event) => {
                      setLeftover(event.target.value);
                    }}
                  />
                  <span
                    className={cn('text-[12px]', leftoverError ? 'text-critical' : 'text-ink-3')}
                  >
                    {leftoverError ?? `Se registra como merma${bulk ? ` de ${bulk.code}` : ''}.`}
                  </span>
                </label>
              ) : null}
              <p className="text-[12.5px] text-ink-2 sm:col-span-2 lg:self-center">
                {isPackaging
                  ? 'Al terminar entra el producto terminado y se consumen granel, envases, tapas y etiquetas.'
                  : 'Al terminar entra el granel y se consumen las materias primas de la fórmula.'}{' '}
                F9 termina la producción.
              </p>
            </div>
          </DocumentSection>
        ) : null}
      </DocumentScreen>

      <ConfirmDialog
        open={pending === 'complete'}
        title={`¿Terminar ${order.label}?`}
        description="El inventario se actualiza en este momento y la orden ya no se puede modificar."
        confirmLabel="Terminar producción"
        loading={complete.isPending}
        onClose={() => {
          setPending(null);
        }}
        onConfirm={() => {
          complete.mutate(undefined, {
            onSuccess: () => {
              setPending(null);
            },
          });
        }}
      >
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-[12.5px] text-ink-2">
            Consume insumos de
            <select
              className={cn(SELECT, 'w-full')}
              value={consumeFrom}
              onChange={(event) => {
                setFromWarehouse(event.target.value);
              }}
            >
              {(warehouses.data ?? []).map((item) => (
                <option key={item.id} value={item.code}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[12.5px] text-ink-2">
            Lo producido entra a
            <select
              className={cn(SELECT, 'w-full')}
              value={outputTo}
              onChange={(event) => {
                setToWarehouse(event.target.value);
              }}
            >
              {(warehouses.data ?? []).map((item) => (
                <option key={item.id} value={item.code}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-[13.5px]">
          <dt className="text-ink-2">Entra a bodega</dt>
          <dd className="text-right font-semibold tabular-nums">
            {formatDecimal(parsedProduced ?? '0')} {unit} de {order.product.name}
          </dd>
          {isPackaging && parsedLeftover && compareDecimals(parsedLeftover, '0') > 0 ? (
            <>
              <dt className="text-ink-2">Merma de granel</dt>
              <dd className="text-right tabular-nums">{formatDecimal(parsedLeftover)} L</dd>
            </>
          ) : null}
          <dt className="text-ink-2">Insumos</dt>
          <dd className="text-right">Se descuentan según la fórmula vigente</dd>
        </dl>
      </ConfirmDialog>

      <ConfirmDialog
        open={pending === 'cancel'}
        title={`¿Anular ${order.label}?`}
        description="La orden deja de contar como programada y la necesidad vuelve a aparecer para programarla."
        confirmLabel="Anular orden"
        danger
        loading={cancel.isPending}
        onClose={() => {
          setPending(null);
        }}
        onConfirm={() => {
          cancel.mutate(undefined, {
            onSuccess: () => {
              setPending(null);
            },
          });
        }}
      />
    </>
  );
}
