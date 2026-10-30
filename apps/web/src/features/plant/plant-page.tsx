import { CalendarPlus, CircleCheck, Factory, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api } from '../../api/client';
import { useAction, useOrders, useProductionNeeds, useProductionOrders } from '../../api/hooks';
import type { BulkNeed, PackagingNeed, ProductionOrder, Q } from '../../api/types';
import { useSession } from '../../auth/session';
import { DataTable } from '../../components/data-table';
import { Dialog } from '../../components/dialog';
import { EntityLink, pathTo, ProductCell } from '../../components/links';
import { Qty } from '../../components/qty';
import { DueDate, ProductionStatusChip } from '../../components/status';
import {
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Panel,
  QueryView,
  Segmented,
  Textarea,
} from '../../components/ui';
import {
  formatDate,
  formatDecimal,
  isZero,
  parseDecimalInput,
  todayIso,
  unitLabel,
} from '../../lib/format';
import { OrdersToPrepare, type ScheduleTarget } from './orders-to-prepare';

type Scope = 'pending' | 'all';
type View = 'pedidos' | 'produccion';

/** Earliest delivery among the orders that ask for it: what the plant should do first. */
const firstDelivery = (need: PackagingNeed): string | null =>
  need.orders
    .map((order) => order.estimatedDeliveryDate)
    .filter((date): date is string => Boolean(date))
    .sort()[0] ?? null;

const byDate = (a: string | null, b: string | null) => (a ?? '9999').localeCompare(b ?? '9999');

export function PlantPage() {
  const needs = useProductionNeeds();
  const toPrepare = useOrders({ status: 'INVOICED,PARTIAL', limit: '500' });
  const [params, setParams] = useSearchParams();
  const view: View = params.get('vista') === 'produccion' ? 'produccion' : 'pedidos';
  const [schedule, setSchedule] = useState<ScheduleTarget | null>(null);
  const [scope, setScope] = useState<Scope>('pending');
  const toSchedule = needs.data
    ? [...needs.data.packaging, ...needs.data.bulk].filter(
        (need) => !isZero(need.pendingToSchedule.quantity),
      ).length
    : null;

  return (
    <>
      <PageHeader
        title="Planta"
        description={
          view === 'pedidos'
            ? 'Alista lo que existe de cada pedido facturado y entrégalo a despacho; lo que falta se fabrica según la prioridad del consolidado.'
            : 'Qué envasar y qué granel producir para cumplir los pedidos, primero lo que se entrega antes.'
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="overflow-x-auto">
          <Segmented
            label="Vista"
            value={view}
            onChange={(value) => {
              setParams(value === 'pedidos' ? {} : { vista: value }, { replace: true });
            }}
            options={[
              {
                value: 'pedidos',
                label: `Pedidos por alistar${toPrepare.data ? ` · ${String(toPrepare.data.length)}` : ''}`,
              },
              {
                value: 'produccion',
                label: `Por fabricar${toSchedule ? ` · ${String(toSchedule)}` : ''}`,
              },
            ]}
          />
        </div>
        {view === 'produccion' ? (
          <Segmented
            label="Mostrar"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'pending', label: 'Falta programar' },
              { value: 'all', label: 'Todo' },
            ]}
          />
        ) : null}
      </div>

      {view === 'pedidos' ? (
        <QueryView query={toPrepare}>
          {(orders) => (
            <OrdersToPrepare
              orders={orders}
              packaging={needs.data?.packaging}
              onSchedule={setSchedule}
            />
          )}
        </QueryView>
      ) : (
        <>
          <QueryView query={needs}>
            {(data) => (
              <NeedsTables
                packaging={data.packaging}
                bulk={data.bulk}
                scope={scope}
                onSchedule={setSchedule}
              />
            )}
          </QueryView>

          <ProductionOrders />
        </>
      )}

      <ScheduleDialog
        target={schedule}
        onClose={() => {
          setSchedule(null);
        }}
      />
    </>
  );
}

function NeedsTables({
  packaging,
  bulk,
  scope,
  onSchedule,
}: {
  packaging: PackagingNeed[];
  bulk: BulkNeed[];
  scope: Scope;
  onSchedule: (target: ScheduleTarget) => void;
}) {
  const { can } = useSession();
  const canWrite = can('production:write');
  const visible = (need: { pendingToSchedule: Q; planned: Q }) =>
    scope === 'all' || !isZero(need.pendingToSchedule.quantity);

  const packRows = useMemo(
    () =>
      packaging
        .map((need) => ({ need, first: firstDelivery(need) }))
        .sort((a, b) => byDate(a.first, b.first)),
    [packaging],
  );
  // A bulk is as urgent as the earliest finished good that needs it.
  const firstByProduct = new Map(packRows.map((row) => [row.need.product.id, row.first]));
  const bulkRows = bulk
    .map((need) => ({
      need,
      first:
        need.usedBy
          .map((product) => firstByProduct.get(product.id) ?? null)
          .filter((date): date is string => Boolean(date))
          .sort()[0] ?? null,
    }))
    .sort((a, b) => byDate(a.first, b.first));

  const shownPack = packRows.filter((row) => visible(row.need));
  const shownBulk = bulkRows.filter((row) => visible(row.need));

  const scheduleButton = (need: PackagingNeed | BulkNeed, kind: ScheduleTarget['kind']) =>
    canWrite && !isZero(need.pendingToSchedule.quantity) ? (
      <Button
        size="sm"
        variant="secondary"
        icon={<CalendarPlus className="size-3.5" />}
        onClick={() => {
          onSchedule({ product: need.product, kind, suggested: need.pendingToSchedule });
        }}
      >
        Programar
      </Button>
    ) : null;

  const canMake = (need: PackagingNeed | BulkNeed) => {
    const blocked =
      !isZero(need.pendingToSchedule.quantity) &&
      Number(need.canMakeNow.quantity) < Number(need.pendingToSchedule.quantity);
    return (
      <span>
        <Qty value={need.canMakeNow} dimZero />
        {blocked && need.limitingMaterial ? (
          <span className="mt-0.5 block text-[12px] text-[#9a6a00]">
            <TriangleAlert aria-hidden className="mr-1 inline size-3 align-[-2px]" />
            <EntityLink to="product" id={need.limitingMaterial.id}>
              {need.limitingMaterial.name}
            </EntityLink>
          </span>
        ) : null}
      </span>
    );
  };

  return (
    <div className="mb-8 flex flex-col gap-6">
      <Panel
        title="Por envasar"
        description="Producto terminado que falta para las preventas, por fecha de la primera entrega."
        flush
      >
        <DataTable
          label="Por envasar"
          rows={shownPack}
          rowKey={(row) => row.need.product.id}
          empty={
            <EmptyState
              icon={<CircleCheck />}
              title="Nada por envasar"
              description="El stock y lo programado cubren las preventas confirmadas."
            />
          }
          columns={[
            {
              key: 'product',
              header: 'Producto',
              render: ({ need }) => (
                <ProductCell
                  product={need.product}
                  detail={`${String(need.orders.length)} preventa${need.orders.length === 1 ? '' : 's'}`}
                />
              ),
            },
            {
              key: 'first',
              header: 'Primera entrega',
              render: ({ first }) => <DueDate date={first} />,
            },
            {
              key: 'toPack',
              header: 'A envasar',
              align: 'right',
              hideOnMobile: true,
              render: ({ need }) => <Qty value={need.toPack} />,
            },
            {
              key: 'planned',
              header: 'Programado',
              align: 'right',
              hideOnMobile: true,
              render: ({ need }) => <Qty value={need.planned} dimZero />,
            },
            {
              key: 'pending',
              header: 'Falta programar',
              align: 'right',
              render: ({ need }) => <Qty value={need.pendingToSchedule} emphasis dimZero />,
            },
            {
              key: 'canMake',
              header: 'Se puede hoy',
              align: 'right',
              render: ({ need }) => canMake(need),
            },
            {
              key: 'action',
              header: '',
              align: 'right',
              render: ({ need }) => scheduleButton(need, 'FINISHED_GOOD'),
            },
          ]}
        />
      </Panel>

      <Panel
        title="Granel por producir"
        description="Líquido que falta para envasar, en litros y baches; primero el que necesita la entrega más próxima."
        flush
      >
        <DataTable
          label="Granel por producir"
          rows={shownBulk}
          rowKey={(row) => row.need.product.id}
          empty={
            <EmptyState
              icon={<CircleCheck />}
              title="Nada por producir"
              description="El granel en planta y lo programado alcanzan para envasar."
            />
          }
          columns={[
            {
              key: 'product',
              header: 'Granel',
              render: ({ need }) => (
                <ProductCell
                  product={need.product}
                  detail={
                    need.batchCapacity
                      ? `bache de ${formatDecimal(need.batchCapacity.quantity)} ${unitLabel(need.batchCapacity.unit)}`
                      : undefined
                  }
                />
              ),
            },
            {
              key: 'first',
              header: 'Primera entrega',
              render: ({ first }) => <DueDate date={first} />,
            },
            {
              key: 'toProduce',
              header: 'A producir',
              align: 'right',
              hideOnMobile: true,
              render: ({ need }) => <Qty value={need.toProduce} />,
            },
            {
              key: 'planned',
              header: 'Programado',
              align: 'right',
              hideOnMobile: true,
              render: ({ need }) => <Qty value={need.planned} dimZero />,
            },
            {
              key: 'pending',
              header: 'Falta programar',
              align: 'right',
              render: ({ need }) => (
                <span>
                  <Qty value={need.pendingToSchedule} emphasis dimZero />
                  {need.batchesPending ? (
                    <span className="block text-[12px] text-ink-3">
                      {need.batchesPending} bache{need.batchesPending === 1 ? '' : 's'}
                    </span>
                  ) : null}
                </span>
              ),
            },
            {
              key: 'canMake',
              header: 'Se puede hoy',
              align: 'right',
              render: ({ need }) => canMake(need),
            },
            {
              key: 'action',
              header: '',
              align: 'right',
              render: ({ need }) => scheduleButton(need, 'BULK'),
            },
          ]}
        />
      </Panel>
    </div>
  );
}

const ORDER_FILTERS = [
  { value: 'PLANNED', label: 'Programadas' },
  { value: 'COMPLETED', label: 'Terminadas' },
  { value: 'ALL', label: 'Todas' },
] as const;

function ProductionOrders() {
  const navigate = useNavigate();
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
              void navigate(pathTo('production-order', row.id));
            }}
            empty={<EmptyState icon={<Factory />} title="No hay órdenes con este estado" />}
            columns={[
              {
                key: 'label',
                header: 'Orden',
                render: (row) => (
                  <EntityLink to="production-order" id={row.id} className="font-medium">
                    {row.label}
                  </EntityLink>
                ),
              },
              { key: 'kind', header: 'Tipo', render: (row) => row.kind, hideOnMobile: true },
              {
                key: 'product',
                header: 'Producto',
                render: (row) => <ProductCell product={row.product} />,
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
              {
                key: 'date',
                header: 'Programada',
                render: (row) =>
                  row.status === 'PLANNED' ? (
                    <DueDate date={row.scheduledDate} />
                  ) : (
                    formatDate(row.scheduledDate)
                  ),
              },
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
