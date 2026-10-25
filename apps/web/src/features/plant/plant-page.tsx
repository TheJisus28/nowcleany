import {
  CalendarPlus,
  CircleCheck,
  Droplets,
  Factory,
  PackageOpen,
  TriangleAlert,
} from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api/client';
import {
  useAction,
  useProductionNeeds,
  useProductionOrder,
  useProductionOrders,
} from '../../api/hooks';
import type { BulkNeed, PackagingNeed, ProductionOrder, Q, Ref } from '../../api/types';
import { useSession } from '../../auth/session';
import { DataTable } from '../../components/data-table';
import { Dialog } from '../../components/dialog';
import { Qty } from '../../components/qty';
import { ProductionStatusChip } from '../../components/status';
import {
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Panel,
  QueryView,
  Segmented,
  Spinner,
  Textarea,
} from '../../components/ui';
import {
  formatDate,
  formatDecimal,
  isZero,
  parseDecimalInput,
  relativeDays,
  todayIso,
  unitLabel,
} from '../../lib/format';

interface ScheduleTarget {
  product: Ref;
  kind: 'BULK' | 'FINISHED_GOOD';
  suggested: Q;
}

export function PlantPage() {
  const needs = useProductionNeeds();
  const [schedule, setSchedule] = useState<ScheduleTarget | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        title="Planta"
        description="Qué envasar y qué granel producir para cumplir las preventas confirmadas, frente a lo que ya está programado."
      />

      <QueryView query={needs}>
        {(data) => {
          const packaging = data.packaging.filter(
            (need) => !isZero(need.toPack.quantity) || !isZero(need.planned.quantity),
          );
          const bulk = data.bulk.filter(
            (need) => !isZero(need.toProduce.quantity) || !isZero(need.planned.quantity),
          );
          return (
            <div className="mb-8 grid items-start gap-6 xl:grid-cols-2">
              <Panel
                title="Por envasar"
                description="Producto terminado que falta para las preventas."
              >
                {packaging.length === 0 ? (
                  <EmptyState
                    icon={<CircleCheck />}
                    title="Nada por envasar"
                    description="El stock cubre las preventas confirmadas."
                  />
                ) : (
                  <ul className="flex flex-col gap-4">
                    {packaging.map((need) => (
                      <PackagingCard
                        key={need.product.id}
                        need={need}
                        onSchedule={() => {
                          setSchedule({
                            product: need.product,
                            kind: 'FINISHED_GOOD',
                            suggested: need.pendingToSchedule,
                          });
                        }}
                      />
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel
                title="Granel por producir"
                description="Líquido necesario para envasar, en litros y baches."
              >
                {bulk.length === 0 ? (
                  <EmptyState
                    icon={<CircleCheck />}
                    title="Nada por producir"
                    description="El granel en planta alcanza para envasar."
                  />
                ) : (
                  <ul className="flex flex-col gap-4">
                    {bulk.map((need) => (
                      <BulkCard
                        key={need.product.id}
                        need={need}
                        onSchedule={() => {
                          setSchedule({
                            product: need.product,
                            kind: 'BULK',
                            suggested: need.pendingToSchedule,
                          });
                        }}
                      />
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          );
        }}
      </QueryView>

      <ProductionOrders onOpen={setDetailId} />

      <ScheduleDialog
        target={schedule}
        onClose={() => {
          setSchedule(null);
        }}
      />
      <ProductionOrderDialog
        id={detailId}
        onClose={() => {
          setDetailId(null);
        }}
      />
    </>
  );
}

function Metric({ label, value, strong = false }: { label: string; value: Q; strong?: boolean }) {
  return (
    <div>
      <dt className="text-[12.5px] text-ink-3">{label}</dt>
      <dd>
        <Qty value={value} emphasis={strong} dimZero />
      </dd>
    </div>
  );
}

function PackagingCard({ need, onSchedule }: { need: PackagingNeed; onSchedule: () => void }) {
  const { can } = useSession();
  const pending = !isZero(need.pendingToSchedule.quantity);
  const blocked = Number(need.canMakeNow.quantity) < Number(need.pendingToSchedule.quantity);
  return (
    <li className="rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-semibold">
            <PackageOpen aria-hidden className="size-4 text-ink-3" />
            {need.product.name}
          </p>
          <p className="text-[12.5px] text-ink-3">{need.product.code}</p>
        </div>
        {can('production:write') && pending ? (
          <Button size="sm" icon={<CalendarPlus className="size-3.5" />} onClick={onSchedule}>
            Programar envasado
          </Button>
        ) : null}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="A envasar" value={need.toPack} strong />
        <Metric label="Ya programado" value={need.planned} />
        <Metric label="Falta programar" value={need.pendingToSchedule} strong />
        <Metric label="Se puede hoy" value={need.canMakeNow} />
      </dl>
      {pending && blocked && need.limitingMaterial ? (
        <p className="mt-3 flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-[13px]">
          <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-[#b67d00]" />
          Con los insumos de hoy alcanza para {formatDecimal(need.canMakeNow.quantity)}{' '}
          {unitLabel(need.canMakeNow.unit)}. Limita: {need.limitingMaterial.name}.
        </p>
      ) : null}
      {need.orders.length > 0 ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-[13px] font-medium text-ink-2">
            Preventas que lo piden ({need.orders.length})
          </summary>
          <ul className="mt-2 divide-y divide-line">
            {need.orders.map((order) => (
              <li
                key={order.orderId}
                className="flex flex-wrap items-baseline justify-between gap-2 py-2"
              >
                <span>
                  <span className="font-medium">{order.label}</span> · {order.customerName}
                  <span className="block text-[12.5px] text-ink-3">
                    {order.sellerName} · entrega{' '}
                    {relativeDays(order.estimatedDeliveryDate).toLowerCase()}
                  </span>
                </span>
                <span className="text-right text-[13px]">
                  <Qty value={order.quantity} />
                  {!isZero(order.toProduce.quantity) ? (
                    <span className="block text-ink-3">
                      por producir <Qty value={order.toProduce} />
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}

function BulkCard({ need, onSchedule }: { need: BulkNeed; onSchedule: () => void }) {
  const { can } = useSession();
  const pending = !isZero(need.pendingToSchedule.quantity);
  const blocked = Number(need.canMakeNow.quantity) < Number(need.pendingToSchedule.quantity);
  return (
    <li className="rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-semibold">
            <Droplets aria-hidden className="size-4 text-ink-3" />
            {need.product.name}
          </p>
          <p className="text-[12.5px] text-ink-3">
            {need.product.code}
            {need.batchCapacity
              ? ` · bache de ${formatDecimal(need.batchCapacity.quantity)} ${unitLabel(need.batchCapacity.unit)}`
              : ''}
          </p>
        </div>
        {can('production:write') && pending ? (
          <Button size="sm" icon={<CalendarPlus className="size-3.5" />} onClick={onSchedule}>
            Programar producción
          </Button>
        ) : null}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="A producir" value={need.toProduce} strong />
        <Metric label="Ya programado" value={need.planned} />
        <div>
          <dt className="text-[12.5px] text-ink-3">Falta programar</dt>
          <dd>
            <Qty value={need.pendingToSchedule} emphasis dimZero />
            {need.batchesPending ? (
              <span className="block text-[12.5px] text-ink-3">
                {need.batchesPending} bache{need.batchesPending === 1 ? '' : 's'}
              </span>
            ) : null}
          </dd>
        </div>
        <Metric label="Se puede hoy" value={need.canMakeNow} />
      </dl>
      {pending && blocked && need.limitingMaterial ? (
        <p className="mt-3 flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-[13px]">
          <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-[#b67d00]" />
          Los químicos de hoy alcanzan para {formatDecimal(need.canMakeNow.quantity)}{' '}
          {unitLabel(need.canMakeNow.unit)}. Limita: {need.limitingMaterial.name}.
        </p>
      ) : null}
      {need.usedBy.length > 0 ? (
        <p className="mt-3 text-[13px] text-ink-3">
          Para: {need.usedBy.map((product) => product.name).join(', ')}
        </p>
      ) : null}
    </li>
  );
}

const ORDER_FILTERS = [
  { value: 'PLANNED', label: 'Programadas' },
  { value: 'COMPLETED', label: 'Terminadas' },
  { value: 'ALL', label: 'Todas' },
] as const;

function ProductionOrders({ onOpen }: { onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState<(typeof ORDER_FILTERS)[number]['value']>('PLANNED');
  const orders = useProductionOrders(filter === 'ALL' ? undefined : filter);
  return (
    <Panel
      title="Órdenes de producción"
      description="Producción de granel y envasado. Al terminarlas se descuentan los insumos de la fórmula vigente."
      actions={
        <Segmented label="Estado" value={filter} onChange={setFilter} options={ORDER_FILTERS} />
      }
      flush
    >
      <QueryView query={orders}>
        {(rows) => (
          <DataTable<ProductionOrder>
            label="Órdenes de producción"
            rows={rows}
            rowKey={(row) => row.id}
            onRowClick={(row) => {
              onOpen(row.id);
            }}
            empty={<EmptyState icon={<Factory />} title="No hay órdenes con este estado" />}
            columns={[
              {
                key: 'label',
                header: 'Orden',
                render: (row) => <span className="font-medium">{row.label}</span>,
              },
              { key: 'kind', header: 'Tipo', render: (row) => row.kind, hideOnMobile: true },
              {
                key: 'product',
                header: 'Producto',
                render: (row) => (
                  <span>
                    {row.product.name}
                    <span className="block text-[12.5px] text-ink-3">{row.product.code}</span>
                  </span>
                ),
              },
              {
                key: 'quantity',
                header: 'Cantidad',
                align: 'right',
                render: (row) => (
                  <span>
                    <Qty value={row.producedQuantity ?? row.plannedQuantity} />
                    {row.batches ? (
                      <span className="block text-[12.5px] text-ink-3">
                        {row.batches} bache{row.batches === 1 ? '' : 's'}
                      </span>
                    ) : null}
                  </span>
                ),
              },
              { key: 'date', header: 'Programada', render: (row) => formatDate(row.scheduledDate) },
              {
                key: 'status',
                header: 'Estado',
                render: (row) => <ProductionStatusChip status={row.status} />,
              },
            ]}
          />
        )}
      </QueryView>
    </Panel>
  );
}

function ScheduleDialog({
  target,
  onClose,
}: {
  target: ScheduleTarget | null;
  onClose: () => void;
}) {
  return target ? <ScheduleForm key={target.product.id} target={target} onClose={onClose} /> : null;
}

function ScheduleForm({ target, onClose }: { target: ScheduleTarget; onClose: () => void }) {
  const [quantity, setQuantity] = useState(formatDecimal(target.suggested.quantity));
  const [date, setDate] = useState(todayIso(1));
  const [notes, setNotes] = useState('');
  const parsed = parseDecimalInput(quantity);
  const create = useAction(
    () =>
      api.post<ProductionOrder>('/v1/production-orders', {
        productId: target.product.id,
        quantity: parsed ?? '0',
        scheduledDate: date,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      }),
    { success: (order) => `${order.label} programada` },
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title={target.kind === 'BULK' ? 'Programar producción de granel' : 'Programar envasado'}
      description={`${target.product.code} · ${target.product.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={create.isPending}
            disabled={!parsed || Number(parsed) <= 0 || !date}
            onClick={() => {
              create.mutate(undefined, { onSuccess: onClose });
            }}
          >
            Programar
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={`Cantidad (${unitLabel(target.suggested.unit)})`}
          hint="Sugerido: lo que falta programar."
        >
          {(props) => (
            <Input
              {...props}
              inputMode="decimal"
              value={quantity}
              onChange={(event) => {
                setQuantity(event.target.value);
              }}
            />
          )}
        </Field>
        <Field label="Fecha programada">
          {(props) => (
            <Input
              {...props}
              type="date"
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
              }}
            />
          )}
        </Field>
        <Field label="Notas (opcional)" className="sm:col-span-2">
          {(props) => (
            <Textarea
              {...props}
              value={notes}
              maxLength={500}
              onChange={(event) => {
                setNotes(event.target.value);
              }}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

function ProductionOrderDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const order = useProductionOrder(id ?? undefined);
  const { can } = useSession();
  const [produced, setProduced] = useState('');
  const data = order.data;
  const parsed = parseDecimalInput(produced);

  const complete = useAction(
    () =>
      api.post<ProductionOrder>(
        `/v1/production-orders/${id ?? ''}/complete`,
        parsed ? { producedQuantity: parsed } : {},
      ),
    { success: (result) => `${result.label} terminada: inventario actualizado` },
  );
  const cancel = useAction(
    () => api.post<ProductionOrder>(`/v1/production-orders/${id ?? ''}/cancel`),
    {
      success: (result) => `${result.label} anulada`,
    },
  );

  return (
    <Dialog
      open={Boolean(id)}
      onClose={() => {
        setProduced('');
        onClose();
      }}
      variant="side"
      title={data ? `${data.label} · ${data.kind}` : 'Orden de producción'}
      description={data ? `${data.product.code} · ${data.product.name}` : undefined}
      footer={
        data?.status === 'PLANNED' && can('production:write') ? (
          <>
            <Button
              variant="danger"
              loading={cancel.isPending}
              onClick={() => {
                cancel.mutate(undefined, { onSuccess: onClose });
              }}
            >
              Anular
            </Button>
            <Button
              icon={<CircleCheck className="size-4" />}
              loading={complete.isPending}
              disabled={produced !== '' && (!parsed || Number(parsed) <= 0)}
              onClick={() => {
                complete.mutate(undefined, {
                  onSuccess: () => {
                    setProduced('');
                    onClose();
                  },
                });
              }}
            >
              Registrar producción
            </Button>
          </>
        ) : undefined
      }
    >
      {order.isPending || !data ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <ProductionStatusChip status={data.status} />
            <span className="text-sm text-ink-2">
              Programada para {formatDate(data.scheduledDate)} · por {data.createdBy}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-ink-3">Planeado</dt>
              <dd>
                <Qty value={data.plannedQuantity} emphasis />
              </dd>
            </div>
            {data.producedQuantity ? (
              <div>
                <dt className="text-ink-3">Producido</dt>
                <dd>
                  <Qty value={data.producedQuantity} emphasis />
                </dd>
              </div>
            ) : null}
            {data.batches ? (
              <div>
                <dt className="text-ink-3">Baches</dt>
                <dd>
                  {data.batches}
                  {data.batchCapacity ? (
                    <span className="text-ink-3">
                      {' '}
                      de {formatDecimal(data.batchCapacity.quantity)}{' '}
                      {unitLabel(data.batchCapacity.unit)}
                    </span>
                  ) : null}
                </dd>
              </div>
            ) : null}
          </dl>

          {data.materials ? (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Insumos según la fórmula vigente</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[12.5px] text-ink-2">
                    <th className="py-2 font-medium">Insumo</th>
                    <th className="py-2 text-right font-medium">Requiere</th>
                    <th className="py-2 text-right font-medium">Hay</th>
                    <th className="py-2 text-right font-medium">Falta</th>
                  </tr>
                </thead>
                <tbody>
                  {data.materials.map((material) => (
                    <tr key={material.productId} className="border-b border-line last:border-0">
                      <td className="py-2 pr-2">
                        {material.name}
                        <span className="block text-[12px] text-ink-3">{material.code}</span>
                      </td>
                      <td className="py-2 text-right">
                        <Qty value={material.required} />
                      </td>
                      <td className="py-2 text-right">
                        <Qty value={material.onHand} />
                      </td>
                      <td className="py-2 text-right">
                        <Qty
                          value={material.shortage}
                          dimZero
                          className={isZero(material.shortage.quantity) ? '' : 'text-critical'}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.materials.some((material) => !isZero(material.shortage.quantity)) ? (
                <p className="mt-2 text-[13px] text-ink-3">
                  Se puede registrar igual: el inventario queda en negativo hasta que llegue la
                  compra.
                </p>
              ) : null}
            </div>
          ) : null}

          {data.status === 'PLANNED' && can('production:write') ? (
            <Field
              label={`Cantidad producida real (${unitLabel(data.plannedQuantity.unit)})`}
              hint={`Déjala vacía si se produjo lo planeado (${formatDecimal(data.plannedQuantity.quantity)}).`}
            >
              {(props) => (
                <Input
                  {...props}
                  inputMode="decimal"
                  value={produced}
                  placeholder={formatDecimal(data.plannedQuantity.quantity)}
                  onChange={(event) => {
                    setProduced(event.target.value);
                  }}
                />
              )}
            </Field>
          ) : null}
          {data.completedAt ? (
            <p className="text-sm text-ink-2">
              Terminada el {formatDate(data.completedAt)} por {data.completedBy}.
            </p>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
