import { CircleCheck, PackageCheck, Plus, ShoppingCart, Trash2, Truck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../api/client';
import {
  useAction,
  useProducts,
  usePurchaseNeeds,
  usePurchaseOrders,
  useSuppliers,
} from '../../api/hooks';
import type { PurchaseNeed, PurchaseOrder } from '../../api/types';
import { useSession } from '../../auth/session';
import { DataTable } from '../../components/data-table';
import { Dialog } from '../../components/dialog';
import { EntityLink, pathTo, ProductCell } from '../../components/links';
import { Qty } from '../../components/qty';
import { DueDate, PurchaseStatusChip } from '../../components/status';
import {
  Button,
  cn,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Panel,
  QueryView,
  Segmented,
  Select,
  Textarea,
} from '../../components/ui';
import {
  formatDate,
  formatDecimal,
  isZero,
  parseDecimalInput,
  roundUpDecimal,
  todayIso,
  unitLabel,
} from '../../lib/format';
import { ReceiveDialog } from './receive-dialog';

interface DraftLine {
  key: number;
  productId: string;
  quantity: string;
}

let key = 1;

export function PurchasingPage() {
  const { can } = useSession();
  const needs = usePurchaseNeeds();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<DraftLine[] | null>(null);
  const [scope, setScope] = useState<'buy' | 'all'>('buy');
  const toBuyCount = needs.data?.rows.filter((row) => !isZero(row.toBuy.quantity)).length ?? 0;

  const openDraft = (rows: PurchaseNeed[]) => {
    setDraft(
      rows.map((row) => ({
        key: key++,
        productId: row.product.id,
        quantity: formatDecimal(roundUpDecimal(row.toBuy.quantity)),
      })),
    );
  };

  return (
    <>
      <PageHeader
        title="Compras"
        description="Exactamente lo que falta para cumplir lo vendido, descontando lo que ya está en camino. Sin stock de seguridad."
        actions={
          can('purchasing:write') ? (
            <Button
              variant="secondary"
              icon={<Plus className="size-4" />}
              onClick={() => {
                setDraft([{ key: key++, productId: '', quantity: '' }]);
              }}
            >
              Orden de compra
            </Button>
          ) : null
        }
      />

      <Panel
        title="Qué comprar"
        description="Requerido por las preventas confirmadas, menos lo que hay en bodega y lo que ya está en tránsito."
        className="mb-6"
        actions={
          needs.data ? (
            <>
              <Segmented
                label="Mostrar"
                value={scope}
                onChange={setScope}
                options={[
                  { value: 'buy', label: `Por comprar · ${String(toBuyCount)}` },
                  { value: 'all', label: `Todos · ${String(needs.data.rows.length)}` },
                ]}
              />
              {can('purchasing:write') ? (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setSelected(
                        new Set(
                          needs.data.rows
                            .filter((row) => !isZero(row.toBuy.quantity))
                            .map((row) => row.product.id),
                        ),
                      );
                    }}
                  >
                    Seleccionar todo lo que falta
                  </Button>
                  <Button
                    icon={<ShoppingCart className="size-4" />}
                    disabled={selected.size === 0}
                    onClick={() => {
                      openDraft(needs.data.rows.filter((row) => selected.has(row.product.id)));
                    }}
                  >
                    Crear orden con {selected.size} insumo{selected.size === 1 ? '' : 's'}
                  </Button>
                </>
              ) : null}
            </>
          ) : null
        }
        flush
      >
        <QueryView query={needs}>
          {(data) => (
            <DataTable<PurchaseNeed>
              label="Insumos por comprar"
              rows={
                scope === 'buy' ? data.rows.filter((row) => !isZero(row.toBuy.quantity)) : data.rows
              }
              rowKey={(row) => row.product.id}
              rowClassName={(row) => (isZero(row.toBuy.quantity) ? 'text-ink-2' : undefined)}
              empty={
                <EmptyState
                  icon={<CircleCheck />}
                  title="No hay nada por comprar"
                  description="Las existencias y lo que está en tránsito cubren todo lo vendido."
                />
              }
              columns={[
                {
                  key: 'material',
                  header: 'Insumo',
                  render: (row) => (
                    <span className="flex items-start gap-3">
                      {can('purchasing:write') ? (
                        <input
                          type="checkbox"
                          aria-label={`Incluir ${row.product.name}`}
                          className="mt-1 size-4 accent-[#003858]"
                          disabled={isZero(row.toBuy.quantity)}
                          checked={selected.has(row.product.id)}
                          onClick={(event) => {
                            event.stopPropagation();
                          }}
                          onChange={(event) => {
                            const next = new Set(selected);
                            if (event.target.checked) next.add(row.product.id);
                            else next.delete(row.product.id);
                            setSelected(next);
                          }}
                        />
                      ) : null}
                      <ProductCell product={row.product} />
                    </span>
                  ),
                },
                {
                  key: 'required',
                  header: 'Requerido',
                  align: 'right',
                  render: (row) => <Qty value={row.required} />,
                },
                {
                  key: 'onHand',
                  header: 'En bodega',
                  align: 'right',
                  render: (row) => <Qty value={row.onHand} />,
                },
                {
                  key: 'onOrder',
                  header: 'En tránsito',
                  align: 'right',
                  render: (row) => (
                    <span>
                      <Qty value={row.onOrder} dimZero />
                      {row.inTransit.map((transit) => (
                        <span key={transit.orderId} className="block text-[12px] text-ink-3">
                          <EntityLink to="purchase-order" id={transit.orderId}>
                            {transit.label}
                          </EntityLink>
                        </span>
                      ))}
                    </span>
                  ),
                },
                {
                  key: 'toBuy',
                  header: 'Comprar',
                  align: 'right',
                  render: (row) => (
                    <Qty
                      value={row.toBuy}
                      emphasis
                      dimZero
                      className={cn(!isZero(row.toBuy.quantity) && 'text-ink')}
                    />
                  ),
                },
                {
                  key: 'usedBy',
                  header: 'Para',
                  hideOnMobile: true,
                  render: (row) =>
                    row.usedBy.length === 0 ? (
                      <span className="text-ink-3">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-x-2 text-[13px] text-ink-2">
                        {row.usedBy.map((product) => (
                          <EntityLink key={product.id} to="product" id={product.id}>
                            <span title={product.name}>{product.code}</span>
                          </EntityLink>
                        ))}
                      </span>
                    ),
                },
              ]}
            />
          )}
        </QueryView>
      </Panel>

      <PurchaseOrders />

      {draft ? (
        <PurchaseOrderDialog
          initial={draft}
          onClose={() => {
            setDraft(null);
          }}
          onCreated={() => {
            setSelected(new Set());
            setDraft(null);
          }}
        />
      ) : null}
    </>
  );
}

const FILTERS = [
  { value: 'OPEN', label: 'En tránsito' },
  { value: 'RECEIVED', label: 'Recibidas' },
  { value: 'ALL', label: 'Todas' },
] as const;

function PurchaseOrders() {
  const { can } = useSession();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['value']>('OPEN');
  const orders = usePurchaseOrders(filter === 'ALL' ? undefined : filter);
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const cancel = useAction(
    (id: string) => api.post<PurchaseOrder>(`/v1/purchase-orders/${id}/cancel`),
    {
      success: (order) => `${order.label} anulada`,
    },
  );

  return (
    <Panel
      title="Órdenes de compra"
      description="Lo pedido a proveedores. Al recibirlas, bodega registra las cantidades reales."
      actions={<Segmented label="Estado" value={filter} onChange={setFilter} options={FILTERS} />}
      flush
    >
      <QueryView query={orders}>
        {(rows) => (
          <DataTable<PurchaseOrder>
            label="Órdenes de compra"
            rows={rows}
            rowKey={(row) => row.id}
            onRowClick={(row) => {
              void navigate(pathTo('purchase-order', row.id));
            }}
            empty={<EmptyState icon={<Truck />} title="No hay órdenes con este estado" />}
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
                key: 'lines',
                header: 'Insumos',
                render: (row) => (
                  <ul className="text-[13px]">
                    {row.lines.map((line) => (
                      <li key={line.productId}>
                        <EntityLink to="product" id={line.productId}>
                          {line.productName}
                        </EntityLink>
                        : <Qty value={line.receivedQuantity ?? line.quantity} />
                      </li>
                    ))}
                  </ul>
                ),
              },
              {
                key: 'expected',
                header: 'Llega',
                render: (row) =>
                  row.status === 'OPEN' ? (
                    <DueDate date={row.expectedDate} />
                  ) : (
                    formatDate(row.receivedAt ?? row.expectedDate)
                  ),
              },
              {
                key: 'status',
                header: 'Estado',
                render: (row) => <PurchaseStatusChip status={row.status} />,
              },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (row) =>
                  row.status === 'OPEN' ? (
                    <span
                      className="inline-flex gap-2"
                      onClick={(event) => {
                        event.stopPropagation();
                      }}
                    >
                      {can('purchasing:write') ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            cancel.mutate(row.id);
                          }}
                        >
                          Anular
                        </Button>
                      ) : null}
                      {can('purchasing:receive') ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<PackageCheck className="size-3.5" />}
                          onClick={() => {
                            setReceiving(row);
                          }}
                        >
                          Recibir
                        </Button>
                      ) : null}
                    </span>
                  ) : null,
              },
            ]}
          />
        )}
      </QueryView>
      {receiving ? (
        <ReceiveDialog
          order={receiving}
          onClose={() => {
            setReceiving(null);
          }}
        />
      ) : null}
    </Panel>
  );
}

function PurchaseOrderDialog({
  initial,
  onClose,
  onCreated,
}: {
  initial: DraftLine[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const materials = useProducts({ type: 'RAW_MATERIAL', active: true });
  const suppliers = useSuppliers();
  const [supplierId, setSupplierId] = useState('');
  const [expectedDate, setExpectedDate] = useState(todayIso(3));
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState(initial);
  const units = useMemo(
    () => new Map((materials.data ?? []).map((m) => [m.id, m.stockUnit])),
    [materials.data],
  );
  const valid =
    Boolean(supplierId) &&
    lines.length > 0 &&
    lines.every((line) => line.productId && Number(parseDecimalInput(line.quantity) ?? 0) > 0);

  const create = useAction(
    () =>
      api.post<PurchaseOrder>('/v1/purchase-orders', {
        supplierId,
        expectedDate,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        lines: lines.map((line) => ({
          productId: line.productId,
          quantity: parseDecimalInput(line.quantity) ?? '0',
        })),
      }),
    { success: (order) => `${order.label} creada: ya cuenta como en tránsito` },
  );

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Nueva orden de compra"
      description="Lo pedido descuenta del faltante en cuanto se crea la orden."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={create.isPending}
            disabled={!valid}
            onClick={() => {
              create.mutate(undefined, { onSuccess: onCreated });
            }}
          >
            Crear orden de compra
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Proveedor" hint="Los proveedores se administran en Compras › Proveedores.">
          {(props) => (
            <Select
              {...props}
              value={supplierId}
              autoFocus
              onChange={(event) => {
                setSupplierId(event.target.value);
              }}
            >
              <option value="">Elige un proveedor…</option>
              {(suppliers.data ?? [])
                .filter((item) => item.active)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.city ? ` · ${item.city}` : ''}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label="Fecha esperada de llegada">
          {(props) => (
            <Input
              {...props}
              type="date"
              value={expectedDate}
              onChange={(event) => {
                setExpectedDate(event.target.value);
              }}
            />
          )}
        </Field>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Insumos</h3>
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus className="size-3.5" />}
            onClick={() => {
              setLines((current) => [...current, { key: key++, productId: '', quantity: '' }]);
            }}
          >
            Agregar
          </Button>
        </div>
        <ul className="flex flex-col gap-3">
          {lines.map((line, index) => (
            <li key={line.key} className="grid grid-cols-[1fr_130px_auto] items-end gap-2">
              <Field label={`Insumo ${String(index + 1)}`}>
                {(props) => (
                  <Select
                    {...props}
                    value={line.productId}
                    onChange={(event) => {
                      const productId = event.target.value;
                      setLines((current) =>
                        current.map((l) => (l.key === line.key ? { ...l, productId } : l)),
                      );
                    }}
                  >
                    <option value="">Elige…</option>
                    {(materials.data ?? []).map((material) => (
                      <option key={material.id} value={material.id}>
                        {material.code} · {material.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field
                label={`Cantidad${line.productId ? ` (${unitLabel(units.get(line.productId) ?? '')})` : ''}`}
              >
                {(props) => (
                  <Input
                    {...props}
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(event) => {
                      const quantity = event.target.value;
                      setLines((current) =>
                        current.map((l) => (l.key === line.key ? { ...l, quantity } : l)),
                      );
                    }}
                  />
                )}
              </Field>
              <Button
                variant="ghost"
                aria-label={`Quitar insumo ${String(index + 1)}`}
                icon={<Trash2 className="size-4" />}
                disabled={lines.length === 1}
                onClick={() => {
                  setLines((current) => current.filter((l) => l.key !== line.key));
                }}
              />
            </li>
          ))}
        </ul>
      </div>

      <Field label="Notas (opcional)" className="mt-6">
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
    </Dialog>
  );
}
