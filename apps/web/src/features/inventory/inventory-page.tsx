import {
  ArrowRightLeft,
  Droplets,
  FileUp,
  PackageCheck,
  PackagePlus,
  Plus,
  Scale,
  Search,
  Trash2,
  TriangleAlert,
  Truck,
  Warehouse,
} from 'lucide-react';
import { type ChangeEvent, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ApiError, api } from '../../api/client';
import {
  useAction,
  useMovements,
  useOrders,
  useProducts,
  usePurchaseOrders,
  useStockStatus,
  useWarehouses,
} from '../../api/hooks';
import type { PurchaseOrder, SalesOrder, StockStatus } from '../../api/types';
import { useSession } from '../../auth/session';
import { DataTable } from '../../components/data-table';
import { Dialog } from '../../components/dialog';
import { EntityLink, pathTo, ProductCell } from '../../components/links';
import { Qty } from '../../components/qty';
import { Chip, DueDate } from '../../components/status';
import {
  Button,
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
import { formatDecimal, parseDecimalInput, unitLabel } from '../../lib/format';
import { ReceiveDialog } from '../purchasing/receive-dialog';
import { MovementTable } from './movement-table';

const TYPES = [
  { value: '', label: 'Todos' },
  { value: 'RAW_MATERIAL', label: 'Materias primas' },
  { value: 'BULK', label: 'Granel' },
  { value: 'FINISHED_GOOD', label: 'Terminados' },
] as const;

type Tab = 'existencias' | 'por-recibir' | 'por-despachar' | 'movimientos';
type DialogKind = 'receipt' | 'transfer' | 'adjust' | 'waste' | 'load' | null;

export function InventoryPage() {
  const { can } = useSession();
  const canReceive = can('purchasing:receive');
  const canDispatch = can('sales-orders:dispatch');
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const close = () => {
    setDialog(null);
  };
  // Counts on the tabs, so the day's warehouse work is visible from any tab.
  const arriving = usePurchaseOrders('OPEN', undefined, canReceive);
  const toDispatch = useOrders({ status: 'CONFIRMED' }, canDispatch);

  const tabs: { value: Tab; label: string }[] = [
    { value: 'existencias', label: 'Existencias' },
    ...(canReceive
      ? [{ value: 'por-recibir' as const, label: withCount('Por recibir', arriving.data) }]
      : []),
    ...(canDispatch
      ? [{ value: 'por-despachar' as const, label: withCount('Por despachar', toDispatch.data) }]
      : []),
    { value: 'movimientos', label: 'Movimientos' },
  ];
  const requested = params.get('vista');
  const tab: Tab =
    tabs.find((option) => option.value === requested)?.value ??
    (canDispatch ? 'por-despachar' : 'existencias');

  return (
    <>
      <PageHeader
        title="Inventario"
        description="Existencias por bodega, lo comprometido en preventas, lo que llega y lo que sale."
        actions={
          <>
            {can('inventory:receive') ? (
              <Button
                variant={canReceive ? 'secondary' : 'primary'}
                icon={<PackagePlus className="size-4" />}
                onClick={() => {
                  setDialog('receipt');
                }}
              >
                Entrada sin orden
              </Button>
            ) : null}
            {can('inventory:transfer') ? (
              <Button
                variant="secondary"
                icon={<ArrowRightLeft className="size-4" />}
                onClick={() => {
                  setDialog('transfer');
                }}
              >
                Entregar a despacho
              </Button>
            ) : null}
            {can('inventory:waste') ? (
              <Button
                variant="secondary"
                icon={<Droplets className="size-4" />}
                onClick={() => {
                  setDialog('waste');
                }}
              >
                Registrar merma
              </Button>
            ) : null}
            {can('inventory:adjust') ? (
              <Button
                variant="secondary"
                icon={<Scale className="size-4" />}
                onClick={() => {
                  setDialog('adjust');
                }}
              >
                Ajustar por conteo
              </Button>
            ) : null}
            {can('inventory:initial-load') ? (
              <Button
                variant="ghost"
                icon={<FileUp className="size-4" />}
                onClick={() => {
                  setDialog('load');
                }}
              >
                Carga inicial
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-4 overflow-x-auto">
        <Segmented
          label="Vista"
          value={tab}
          onChange={(value) => {
            setParams({ vista: value }, { replace: true });
          }}
          options={tabs}
        />
      </div>

      {tab === 'existencias' ? <StockTab /> : null}
      {tab === 'por-recibir' ? <ReceiveTab orders={arriving} /> : null}
      {tab === 'por-despachar' ? <DispatchTab orders={toDispatch} /> : null}
      {tab === 'movimientos' ? <MovementsTab /> : null}

      {dialog === 'receipt' ? <ReceiptDialog onClose={close} /> : null}
      {dialog === 'transfer' ? <TransferDialog onClose={close} /> : null}
      {dialog === 'adjust' ? <AdjustDialog onClose={close} /> : null}
      {dialog === 'waste' ? <WasteDialog onClose={close} /> : null}
      {dialog === 'load' ? <InitialLoadDialog onClose={close} /> : null}
    </>
  );
}

function withCount(label: string, rows: readonly unknown[] | undefined): string {
  return rows && rows.length > 0 ? `${label} · ${String(rows.length)}` : label;
}

function StockTab() {
  const navigate = useNavigate();
  const [type, setType] = useState<(typeof TYPES)[number]['value']>('');
  const [search, setSearch] = useState('');
  const status = useStockStatus({ type: type || undefined, q: search.trim() || undefined });

  return (
    <Panel flush>
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3 md:flex-row md:items-center md:justify-between">
        <Segmented label="Tipo" value={type} onChange={setType} options={TYPES} />
        <label className="relative block md:w-72">
          <span className="sr-only">Buscar producto</span>
          <Search
            aria-hidden
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
          />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            placeholder="Código o nombre"
            className="pl-9"
          />
        </label>
      </div>
      <QueryView query={status}>
        {(rows) => (
          <DataTable<StockStatus>
            label="Existencias"
            rows={rows}
            rowKey={(row) => row.productId}
            onRowClick={(row) => {
              void navigate(pathTo('product', row.productId));
            }}
            empty={<EmptyState icon={<Warehouse />} title="No hay productos con este filtro" />}
            columns={[
              {
                key: 'product',
                header: 'Producto',
                render: (row) => (
                  <ProductCell
                    product={{ id: row.productId, code: row.code, name: row.name }}
                    detail={row.typeLabel}
                  />
                ),
              },
              ...['PLANTA', 'DESPACHO'].map((code) => ({
                key: code,
                header: code === 'PLANTA' ? 'Planta' : 'Despacho',
                align: 'right' as const,
                hideOnMobile: true,
                render: (row: StockStatus) => {
                  const warehouse = row.byWarehouse.find((w) => w.warehouseCode === code);
                  return warehouse ? <Qty value={warehouse.onHand} dimZero /> : '—';
                },
              })),
              {
                key: 'onHand',
                header: 'Físico',
                align: 'right',
                render: (row) => <Qty value={row.onHand} emphasis />,
              },
              {
                key: 'committed',
                header: 'Comprometido',
                align: 'right',
                render: (row) => <Qty value={row.committed} dimZero />,
              },
              {
                key: 'projected',
                header: 'Proyectado',
                align: 'right',
                render: (row) => <Qty value={row.projected} emphasis />,
              },
              {
                key: 'flags',
                header: 'Alertas',
                render: (row) =>
                  row.oversold || row.negativeOnHand ? (
                    <span className="flex flex-wrap gap-1.5">
                      {row.oversold ? (
                        <Chip tone="critical" icon={TriangleAlert}>
                          Sobrevendido
                        </Chip>
                      ) : null}
                      {row.negativeOnHand ? (
                        <Chip tone="warning" icon={TriangleAlert}>
                          Físico negativo
                        </Chip>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-ink-3">—</span>
                  ),
              },
            ]}
          />
        )}
      </QueryView>
    </Panel>
  );
}

interface ListQuery<T> {
  data: T[] | undefined;
  isPending: boolean;
  error: unknown;
  refetch: () => unknown;
}

function ReceiveTab({ orders }: { orders: ListQuery<PurchaseOrder> }) {
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  return (
    <Panel
      title="Compras por recibir"
      description="Lo que compras pidió a proveedores. Al recibir, registra lo que llegó de verdad."
      flush
    >
      <QueryView query={orders}>
        {(rows) => (
          <DataTable<PurchaseOrder>
            label="Por recibir"
            rows={[...rows].sort((a, b) =>
              (a.expectedDate ?? '9').localeCompare(b.expectedDate ?? '9'),
            )}
            rowKey={(row) => row.id}
            empty={<EmptyState icon={<PackageCheck />} title="No hay compras en camino" />}
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
                header: 'Llega',
                render: (row) => <DueDate date={row.expectedDate} />,
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
                        : <Qty value={line.quantity} />
                      </li>
                    ))}
                  </ul>
                ),
              },
              {
                key: 'action',
                header: '',
                align: 'right',
                render: (row) => (
                  <Button
                    size="sm"
                    icon={<PackageCheck className="size-3.5" />}
                    onClick={() => {
                      setReceiving(row);
                    }}
                  >
                    Recibir
                  </Button>
                ),
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

function DispatchTab({ orders }: { orders: ListQuery<SalesOrder> }) {
  const dispatch = useAction(
    (id: string) => api.post<SalesOrder>(`/v1/sales-orders/${id}/dispatch`),
    {
      success: (order) => `${order.label} despachada`,
    },
  );
  return (
    <Panel
      title="Preventas confirmadas por despachar"
      description="Primero la entrega más cercana. Al despachar sale el producto de la bodega de despacho."
      flush
    >
      <QueryView query={orders}>
        {(rows) => (
          <DataTable<SalesOrder>
            label="Por despachar"
            rows={[...rows].sort((a, b) =>
              (a.estimatedDeliveryDate ?? '9').localeCompare(b.estimatedDeliveryDate ?? '9'),
            )}
            rowKey={(row) => row.id}
            empty={<EmptyState icon={<Truck />} title="No hay preventas por despachar" />}
            columns={[
              {
                key: 'label',
                header: 'Preventa',
                render: (row) => (
                  <span>
                    <EntityLink to="order" id={row.id} className="font-medium">
                      {row.label}
                    </EntityLink>
                    <span className="block text-[12.5px] text-ink-3">{row.customer.name}</span>
                  </span>
                ),
              },
              {
                key: 'delivery',
                header: 'Entrega',
                render: (row) => <DueDate date={row.estimatedDeliveryDate} />,
              },
              {
                key: 'products',
                header: 'Productos',
                render: (row) => (
                  <ul className="text-[13px]">
                    {row.lines.map((line) => (
                      <li key={line.productId}>
                        <EntityLink to="product" id={line.productId}>
                          {line.productCode}
                        </EntityLink>
                        : <Qty value={line.quantity} />
                      </li>
                    ))}
                  </ul>
                ),
              },
              {
                key: 'action',
                header: '',
                align: 'right',
                render: (row) => (
                  <Button
                    size="sm"
                    icon={<Truck className="size-3.5" />}
                    loading={dispatch.isPending && dispatch.variables === row.id}
                    onClick={() => {
                      dispatch.mutate(row.id);
                    }}
                  >
                    Despachar
                  </Button>
                ),
              },
            ]}
          />
        )}
      </QueryView>
    </Panel>
  );
}

const MOVEMENT_TYPES = [
  { value: '', label: 'Todos' },
  { value: 'RECEIPT', label: 'Recepciones' },
  { value: 'PRODUCTION_OUTPUT', label: 'Producción' },
  { value: 'DISPATCH', label: 'Despachos' },
  { value: 'ADJUSTMENT', label: 'Ajustes' },
  { value: 'WASTE', label: 'Mermas' },
] as const;

function MovementsTab() {
  const [type, setType] = useState<(typeof MOVEMENT_TYPES)[number]['value']>('');
  const movements = useMovements({ type: type || undefined });
  return (
    <Panel
      title="Movimientos"
      description="Últimos 100 movimientos. El kardex es inmutable: los errores se corrigen con un ajuste."
      actions={
        <Segmented
          label="Tipo de movimiento"
          value={type}
          onChange={setType}
          options={MOVEMENT_TYPES}
        />
      }
      flush
    >
      <QueryView query={movements}>{(rows) => <MovementTable rows={rows} showProduct />}</QueryView>
    </Panel>
  );
}

// --- operations -------------------------------------------------------------------------------

interface Line {
  key: number;
  productId: string;
  quantity: string;
}
let lineKey = 1;

function ReceiptDialog({ onClose }: { onClose: () => void }) {
  const materials = useProducts({ type: 'RAW_MATERIAL', active: true });
  const warehouses = useWarehouses();
  const [warehouse, setWarehouse] = useState('PLANTA');
  const [document, setDocument] = useState('');
  const [lines, setLines] = useState<Line[]>([{ key: lineKey++, productId: '', quantity: '' }]);
  const units = useMemo(
    () => new Map((materials.data ?? []).map((m) => [m.id, m.stockUnit])),
    [materials.data],
  );
  const valid = lines.every(
    (line) => line.productId && Number(parseDecimalInput(line.quantity) ?? 0) > 0,
  );
  const receive = useAction(
    () =>
      api.post('/v1/inventory/receipts', {
        warehouse,
        ...(document.trim() ? { document: document.trim() } : {}),
        lines: lines.map((line) => ({
          productId: line.productId,
          quantity: parseDecimalInput(line.quantity) ?? '0',
        })),
      }),
    { success: 'Recepción registrada' },
  );
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Registrar recepción"
      description="Materia prima que entra a bodega sin orden de compra. Para lo pedido, usa Recibir en Compras."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={receive.isPending}
            disabled={!valid}
            onClick={() => {
              receive.mutate(undefined, { onSuccess: onClose });
            }}
          >
            Registrar recepción
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Bodega">
          {(props) => (
            <Select
              {...props}
              value={warehouse}
              onChange={(event) => {
                setWarehouse(event.target.value);
              }}
            >
              {(warehouses.data ?? []).map((w) => (
                <option key={w.id} value={w.code}>
                  {w.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Factura o remisión (opcional)">
          {(props) => (
            <Input
              {...props}
              value={document}
              onChange={(event) => {
                setDocument(event.target.value);
              }}
            />
          )}
        </Field>
      </div>
      <ul className="mt-5 flex flex-col gap-3">
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
                  {(materials.data ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.code} · {m.name}
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
      <Button
        variant="ghost"
        size="sm"
        className="mt-3"
        icon={<Plus className="size-3.5" />}
        onClick={() => {
          setLines((current) => [...current, { key: lineKey++, productId: '', quantity: '' }]);
        }}
      >
        Agregar insumo
      </Button>
    </Dialog>
  );
}

function TransferDialog({ onClose }: { onClose: () => void }) {
  const products = useProducts({ type: 'FINISHED_GOOD', active: true });
  const status = useStockStatus({ type: 'FINISHED_GOOD' });
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const atPlant = status.data
    ?.find((row) => row.productId === productId)
    ?.byWarehouse.find((w) => w.warehouseCode === 'PLANTA')?.onHand;
  const parsed = parseDecimalInput(quantity);
  const transfer = useAction(
    () =>
      api.post('/v1/inventory/transfers', {
        productId,
        quantity: parsed ?? '0',
        from: 'PLANTA',
        to: 'DESPACHO',
      }),
    { success: 'Producto entregado a despacho' },
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title="Entregar a despacho"
      description="Traslado de producto terminado de la bodega de planta a la de despacho."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            icon={<ArrowRightLeft className="size-4" />}
            loading={transfer.isPending}
            disabled={!productId || !parsed || Number(parsed) <= 0}
            onClick={() => {
              transfer.mutate(undefined, { onSuccess: onClose });
            }}
          >
            Registrar traslado
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Producto terminado">
          {(props) => (
            <Select
              {...props}
              value={productId}
              onChange={(event) => {
                setProductId(event.target.value);
              }}
            >
              <option value="">Elige…</option>
              {(products.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label="Cantidad"
          hint={
            atPlant
              ? `En bodega de planta: ${formatDecimal(atPlant.quantity)} ${unitLabel(atPlant.unit)}`
              : undefined
          }
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
      </div>
    </Dialog>
  );
}

/** What is lost: bulk left in a tank, a damaged or spilled product. It leaves stock as WASTE. */
function WasteDialog({ onClose }: { onClose: () => void }) {
  const products = useProducts({ active: true });
  const warehouses = useWarehouses();
  const [productId, setProductId] = useState('');
  const [warehouse, setWarehouse] = useState('PLANTA');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const parsed = parseDecimalInput(quantity);
  const product = products.data?.find((p) => p.id === productId);
  const waste = useAction(
    () =>
      api.post('/v1/inventory/waste', {
        productId,
        warehouse,
        quantity: parsed ?? '0',
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    { success: 'Merma registrada en el kardex' },
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title="Registrar merma"
      description="Lo que se perdió sale del inventario con tu nombre: granel sobrante, producto dañado o derramado."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={waste.isPending}
            disabled={!productId || parsed === null || Number(parsed) <= 0}
            onClick={() => {
              waste.mutate(undefined, { onSuccess: onClose });
            }}
          >
            Registrar merma
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Producto" className="sm:col-span-2">
          {(props) => (
            <Select
              {...props}
              value={productId}
              onChange={(event) => {
                setProductId(event.target.value);
              }}
            >
              <option value="">Elige…</option>
              {(products.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Bodega">
          {(props) => (
            <Select
              {...props}
              value={warehouse}
              onChange={(event) => {
                setWarehouse(event.target.value);
              }}
            >
              {(warehouses.data ?? []).map((w) => (
                <option key={w.id} value={w.code}>
                  {w.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={`Cantidad perdida${product ? ` (${unitLabel(product.stockUnit)})` : ''}`}>
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
        <Field label="Detalle (opcional)" className="sm:col-span-2">
          {(props) => (
            <Textarea
              {...props}
              value={note}
              maxLength={300}
              placeholder="Sobrante del tanque 2 después de envasar"
              onChange={(event) => {
                setNote(event.target.value);
              }}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

function AdjustDialog({ onClose }: { onClose: () => void }) {
  const products = useProducts({ active: true });
  const warehouses = useWarehouses();
  const [productId, setProductId] = useState('');
  const [warehouse, setWarehouse] = useState('PLANTA');
  const [counted, setCounted] = useState('');
  const [reason, setReason] = useState('');
  const parsed = parseDecimalInput(counted);
  const adjust = useAction(
    () =>
      api.post('/v1/inventory/adjustments', {
        productId,
        warehouse,
        countedQuantity: parsed ?? '0',
        reason,
      }),
    { success: 'Ajuste registrado en el kardex' },
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title="Ajustar por conteo físico"
      description="El saldo queda igual a lo contado; la diferencia se registra con tu nombre y el motivo."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={adjust.isPending}
            disabled={!productId || parsed === null || reason.trim().length < 5}
            onClick={() => {
              adjust.mutate(undefined, { onSuccess: onClose });
            }}
          >
            Registrar ajuste
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Producto" className="sm:col-span-2">
          {(props) => (
            <Select
              {...props}
              value={productId}
              onChange={(event) => {
                setProductId(event.target.value);
              }}
            >
              <option value="">Elige…</option>
              {(products.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Bodega">
          {(props) => (
            <Select
              {...props}
              value={warehouse}
              onChange={(event) => {
                setWarehouse(event.target.value);
              }}
            >
              {(warehouses.data ?? []).map((w) => (
                <option key={w.id} value={w.code}>
                  {w.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Cantidad contada">
          {(props) => (
            <Input
              {...props}
              inputMode="decimal"
              value={counted}
              onChange={(event) => {
                setCounted(event.target.value);
              }}
            />
          )}
        </Field>
        <Field
          label="Motivo"
          hint="Mínimo 5 caracteres. Queda en la auditoría."
          className="sm:col-span-2"
        >
          {(props) => (
            <Textarea
              {...props}
              value={reason}
              maxLength={300}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

function InitialLoadDialog({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const load = useAction(
    (csv: string) =>
      api.post<{ rows: number; movements: number }>('/v1/inventory/initial-load', csv),
    {
      success: (result) =>
        `Carga inicial lista: ${String(result.rows)} filas, ${String(result.movements)} saldos actualizados`,
    },
  );
  const lineErrors = load.error instanceof ApiError ? (load.error.problem.errors ?? []) : [];

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    if (!picked) return;
    setFile({ name: picked.name, text: await picked.text() });
    load.reset();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Carga inicial de inventario"
      description="Archivo CSV exportado de Excel con columnas codigo; cantidad; bodega (opcional, PLANTA por defecto). Deja cada saldo en la cantidad indicada."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            icon={<FileUp className="size-4" />}
            loading={load.isPending}
            disabled={!file}
            onClick={() => {
              if (file) load.mutate(file.text, { onSuccess: onClose });
            }}
          >
            Cargar archivo
          </Button>
        </>
      }
    >
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-line-strong px-6 py-8 text-center hover:border-brand">
        <FileUp aria-hidden className="size-6 text-ink-3" />
        <span className="font-medium">{file ? file.name : 'Elige el archivo .csv'}</span>
        <span className="text-[13px] text-ink-3">
          Separador ; o , — decimales con coma si el separador es ;
        </span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(event) => {
            void pick(event);
          }}
        />
      </label>
      {lineErrors.length > 0 ? (
        <div className="mt-4 rounded-md bg-critical-soft px-4 py-3 text-sm">
          <p className="font-medium">No se cargó nada. Corrige estas filas:</p>
          <ul className="mt-1.5 list-disc pl-5">
            {lineErrors.map((error) => (
              <li key={`${String(error.line)}-${error.message}`}>
                Fila {error.line}: {error.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Dialog>
  );
}
