import { Ban, FilePlus2, Plus, Printer, Save, Send, UserPlus } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { api } from '../../api/client';
import { useAction, useCustomers, useOrder, useProducts, useStockStatus } from '../../api/hooks';
import type { SalesOrder } from '../../api/types';
import { useAccess } from '../../app/access';
import { useProfile, useSession } from '../../auth/session';
import {
  DocumentScreen,
  DocumentSection,
  DocumentToolbar,
  DraftBanner,
  HeaderField,
  HeaderGrid,
  LineGrid,
  type LineProduct,
  type LineRow,
  lineAmount,
  LookupField,
  type LookupItem,
  newLine,
  type ToolbarAction,
  useDraft,
  useWorkTab,
} from '../../components/erp';
import { Qty } from '../../components/qty';
import { OrderStatusChip } from '../../components/status';
import { cn, QueryView, Textarea } from '../../components/ui';
import {
  formatCop,
  formatDate,
  formatDateTime,
  isZero,
  parseDecimalInput,
  todayIso,
} from '../../lib/format';
import { colombiaDay, vatOf } from '../billing/billing-format';
import { FILTER_INPUT } from '../billing/erp-kit';
import { CustomerFormDialog } from '../customers/customer-form-dialog';
import { CancelOrderDialog } from './order-shared';

/** What is kept while the order is not saved (closing the tab loses nothing). */
interface OrderDraft {
  customerId: string;
  branchId: string;
  deliveryDate: string;
  notes: string;
  lines: { productId: string; quantity: string }[];
}

const SELLABLE = new Set(['FINISHED_GOOD', 'RESALE']);

/** "Pedido de venta" being typed: a new one or a draft (preventa) that was not sent yet. */
export function OrderFormPage() {
  const { id } = useParams();
  const existing = useOrder(id);
  const [blank, setBlank] = useState(0);
  if (!id) {
    return (
      <OrderForm
        key={`new-${String(blank)}`}
        order={undefined}
        onNew={() => {
          setBlank((value) => value + 1);
        }}
      />
    );
  }
  return (
    <QueryView query={existing}>
      {(order) =>
        order.status === 'DRAFT' ? (
          <OrderForm key={order.id} order={order} />
        ) : (
          <Navigate to={`/ventas/${order.id}`} replace />
        )
      }
    </QueryView>
  );
}

/** A read-only value inside the header, aligned with the inputs. */
function Value({ children }: { children: ReactNode }) {
  return <span className="block py-1">{children}</span>;
}

function OrderForm({ order, onNew }: { order: SalesOrder | undefined; onNew?: () => void }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const profile = useProfile();
  const { can } = useSession();
  const { has } = useAccess();
  const customers = useCustomers();
  const products = useProducts();
  const stock = useStockStatus();

  // A new order opened from a customer's page starts with that customer.
  const [customerId, setCustomerId] = useState(order?.customer.id ?? params.get('cliente') ?? '');
  const [branchId, setBranchId] = useState(order?.branch.id ?? '');
  const [deliveryDate, setDeliveryDate] = useState(order?.estimatedDeliveryDate ?? todayIso(7));
  const [notes, setNotes] = useState(order?.notes ?? '');
  const [rows, setRows] = useState<LineRow[]>(() =>
    order
      ? order.lines.map((line) =>
          newLine({ productId: line.productId, quantity: line.quantity.quantity }),
        )
      : [newLine()],
  );
  const [showErrors, setShowErrors] = useState(false);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  useWorkTab(order ? `${order.label} · ${order.customer.name}` : 'Pedido nuevo');

  // --- catalog ---------------------------------------------------------------------------------
  const lineIds = useMemo(() => new Set(rows.map((row) => row.productId)), [rows]);
  const lineProducts = useMemo<LineProduct[]>(
    () =>
      (products.data ?? [])
        .filter((p) => SELLABLE.has(p.type) && (p.active || lineIds.has(p.id)))
        .map((p) => ({ id: p.id, code: p.code, name: p.name, unit: p.stockUnit, price: p.price })),
    [products.data, lineIds],
  );
  const productById = useMemo(() => new Map(lineProducts.map((p) => [p.id, p])), [lineProducts]);
  const stockById = useMemo(
    () => new Map((stock.data ?? []).map((row) => [row.productId, row])),
    [stock.data],
  );
  // List prices are read-only on the order: always the current price of the product.
  const priced = useMemo(
    () => rows.map((row) => ({ ...row, price: productById.get(row.productId)?.price ?? '' })),
    [rows, productById],
  );

  // --- customer and branch ---------------------------------------------------------------------
  const customerItems = useMemo<LookupItem[]>(
    () =>
      (customers.data ?? [])
        .filter((item) => item.active || item.id === customerId)
        .map((item) => ({
          id: item.id,
          code: item.documentNumber,
          label: item.name,
          detail: [item.city, item.seller?.name].filter(Boolean).join(' · '),
        })),
    [customers.data, customerId],
  );
  const customer = customers.data?.find((item) => item.id === customerId);
  const branches = (customer?.branches ?? []).filter(
    (branch) => branch.active || branch.id === order?.branch.id,
  );
  // Without a choice, the order ships to the customer's main branch.
  const branch =
    branches.find((item) => item.id === branchId) ??
    branches.find((item) => item.isMain) ??
    branches[0];

  // --- validation (business language, next to the line) ----------------------------------------
  const filled = rows.filter((row) => row.productId || row.quantity.trim());
  const lineErrors: Record<number, string | undefined> = {};
  const messages: string[] = [];
  const seen = new Map<string, number>();
  for (const row of filled) {
    const position = rows.indexOf(row) + 1;
    if (!row.productId) {
      lineErrors[row.key] = 'Elige el producto';
      messages.push(`Línea ${String(position)}: elige el producto.`);
      continue;
    }
    const code = productById.get(row.productId)?.code ?? '';
    const quantity = parseDecimalInput(row.quantity);
    if (quantity === null || isZero(quantity)) {
      lineErrors[row.key] = 'Falta la cantidad';
      messages.push(`Línea ${String(position)}: escribe la cantidad de ${code}.`);
    }
    const first = seen.get(row.productId);
    if (first === undefined) seen.set(row.productId, position);
    else {
      lineErrors[row.key] = 'Producto repetido';
      messages.push(`Línea ${String(position)}: ${code} ya está en la línea ${String(first)}.`);
    }
  }
  if (filled.length === 0) messages.push('Agrega al menos un producto al pedido.');
  const customerError = !customerId
    ? 'Elige el cliente.'
    : customer && !branch
      ? 'El cliente no tiene sucursales activas para entregar.'
      : undefined;
  const valid = !customerError && Boolean(branch) && messages.length === 0;

  // --- totals ----------------------------------------------------------------------------------
  const subtotal = priced.reduce(
    (sum, row) => (row.productId ? sum + BigInt(lineAmount(row.quantity, row.price)) : sum),
    0n,
  );
  const vat = vatOf(subtotal);
  const withoutPrice = priced
    .filter((row) => row.productId && !row.price)
    .map((row) => productById.get(row.productId)?.code ?? '');

  // --- draft -----------------------------------------------------------------------------------
  const draftValue = useMemo<OrderDraft>(
    () => ({
      customerId,
      branchId,
      deliveryDate,
      notes,
      lines: rows.map((row) => ({ productId: row.productId, quantity: row.quantity })),
    }),
    [customerId, branchId, deliveryDate, notes, rows],
  );
  const draft = useDraft(`order.${order?.id ?? 'new'}.${profile.id}`, draftValue, {
    isEmpty: (value) =>
      !value.customerId &&
      !value.notes.trim() &&
      value.lines.every((line) => !line.productId && !line.quantity.trim()),
  });
  const restoreDraft = () => {
    const value = draft.restore();
    if (!value) return;
    setCustomerId(value.customerId);
    setBranchId(value.branchId);
    setDeliveryDate(value.deliveryDate);
    setNotes(value.notes);
    setRows(value.lines.length > 0 ? value.lines.map((line) => newLine(line)) : [newLine()]);
  };

  // --- save and send ---------------------------------------------------------------------------
  const payload = () => ({
    customerId,
    branchId: branch?.id ?? '',
    ...(deliveryDate ? { estimatedDeliveryDate: deliveryDate } : {}),
    ...(notes.trim() ? { notes: notes.trim() } : {}),
    lines: filled.map((row) => ({
      productId: row.productId,
      quantity: parseDecimalInput(row.quantity) ?? '0',
    })),
  });
  const save = useAction(
    async (send: boolean) => {
      const saved = order
        ? await api.patch<SalesOrder>(`/v1/sales-orders/${order.id}`, payload())
        : await api.post<SalesOrder>('/v1/sales-orders', payload());
      return send ? api.post<SalesOrder>(`/v1/sales-orders/${saved.id}/confirm`) : saved;
    },
    {
      success: (saved) =>
        saved.status === 'CONFIRMED'
          ? `${saved.label} enviado al consolidado para facturar`
          : `${saved.label} guardado como preventa (borrador)`,
    },
  );
  const submit = (send: boolean) => {
    setShowErrors(true);
    if (!valid || save.isPending) return;
    save.mutate(send, {
      onSuccess: (saved) => {
        draft.clear();
        void navigate(`/ventas/${saved.id}`);
      },
    });
  };

  const actions: ToolbarAction[] = [
    {
      label: 'Nuevo',
      icon: FilePlus2,
      hidden: !has('newOrder'),
      ...(order
        ? { to: '/ventas/nueva' }
        : {
            onClick: () => {
              draft.clear();
              if (onNew) onNew();
            },
          }),
    },
    {
      label: 'Guardar',
      icon: Save,
      shortcut: 'Ctrl+S',
      title: 'Guarda la preventa sin enviarla: no compromete producto',
      disabled: save.isPending,
      loading: save.isPending && !save.variables,
      onClick: () => {
        submit(false);
      },
    },
    {
      label: 'Enviar al consolidado',
      icon: Send,
      shortcut: 'F9',
      primary: true,
      title: 'Guarda y envía el pedido para que lo facturen',
      disabled: save.isPending,
      loading: save.isPending && save.variables,
      onClick: () => {
        submit(true);
      },
    },
    {
      label: 'Anular',
      icon: Ban,
      danger: true,
      hidden: !order,
      onClick: () => {
        setCancelOpen(true);
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
  ];

  const address = branch ? [branch.address, branch.city].filter(Boolean).join(', ') : '';

  return (
    <>
      <DocumentToolbar
        actions={actions}
        closeTo={order ? `/ventas/${order.id}` : has('sales') ? '/ventas' : '/'}
      />
      {draft.pending ? (
        <DraftBanner
          savedAt={draft.pending.savedAt}
          onRestore={restoreDraft}
          onDiscard={draft.discard}
        />
      ) : null}
      <DocumentScreen
        kind="Pedido de venta"
        number={order?.label ?? 'Nuevo'}
        status={
          order ? (
            <OrderStatusChip status="DRAFT" />
          ) : (
            <span className="text-[12.5px] text-ink-3">Sin guardar</span>
          )
        }
        notes={
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-ink-3">
                Observaciones para el consolidado, planta o bodega
              </span>
              <Textarea
                value={notes}
                maxLength={500}
                className="min-h-16 print:border-0"
                onChange={(event) => {
                  setNotes(event.target.value);
                }}
              />
            </label>
            {withoutPrice.length > 0 ? (
              <p className="text-[12.5px] text-ink-2">
                Sin precio de lista: {withoutPrice.join(', ')}. El consolidado no podrá facturarlos
                hasta que tengan precio.
              </p>
            ) : null}
          </div>
        }
        totals={[
          { label: 'Subtotal', value: formatCop(subtotal.toString()) },
          { label: 'IVA 19 %', value: formatCop(vat.toString()) },
          { label: 'Total', value: formatCop((subtotal + vat).toString()), strong: true },
        ]}
        signatures={[
          {
            label: 'Elaboró',
            name: order?.seller.name ?? profile.fullName,
            at: order ? formatDateTime(order.createdAt) : null,
          },
        ]}
      >
        <HeaderGrid>
          <HeaderField label="Cliente (NIT o cédula)" span={2} htmlFor="order-customer">
            <LookupField
              id="order-customer"
              title="Buscar cliente"
              items={customerItems}
              value={customerId || null}
              onChange={(id) => {
                setCustomerId(id);
                setBranchId('');
              }}
            />
            <span className="no-print mt-1 flex flex-wrap items-center gap-x-3 text-[12.5px]">
              {showErrors && customerError ? (
                <span className="text-critical">{customerError}</span>
              ) : null}
              {can('customers:write') ? (
                <button
                  type="button"
                  onClick={() => {
                    setNewCustomerOpen(true);
                  }}
                  className="inline-flex items-center gap-1 text-brand hover:underline"
                >
                  <UserPlus aria-hidden className="size-3.5" />
                  Crear cliente nuevo
                </button>
              ) : null}
            </span>
          </HeaderField>
          <HeaderField label="Sucursal de entrega" htmlFor="order-branch">
            <select
              id="order-branch"
              value={branch?.id ?? ''}
              disabled={!customer}
              onChange={(event) => {
                setBranchId(event.target.value);
              }}
              className={cn(FILTER_INPUT, 'w-full disabled:bg-surface-2')}
            >
              {branches.length === 0 ? (
                <option value="">{customer ? 'Sin sucursales' : 'Primero el cliente'}</option>
              ) : null}
              {branches.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.isMain ? ' (principal)' : ''}
                </option>
              ))}
            </select>
          </HeaderField>
          <HeaderField label="Fecha prometida al cliente" htmlFor="order-delivery">
            <input
              id="order-delivery"
              type="date"
              value={deliveryDate}
              min={todayIso()}
              onChange={(event) => {
                setDeliveryDate(event.target.value);
              }}
              className={cn(FILTER_INPUT, 'w-full')}
            />
          </HeaderField>
          <HeaderField label="Fecha del pedido">
            <Value>{formatDate(order ? colombiaDay(order.createdAt) : todayIso())}</Value>
          </HeaderField>
          <HeaderField label="Vendedor">
            <Value>{order?.seller.name ?? profile.fullName}</Value>
          </HeaderField>
          <HeaderField label="Dirección de entrega" span={2}>
            <Value>
              {address || <span className="text-ink-3">{customer ? 'Sin dirección' : '—'}</span>}
            </Value>
          </HeaderField>
        </HeaderGrid>

        <DocumentSection
          title="Detalle del pedido"
          flush
          actions={
            <button
              type="button"
              onClick={() => {
                setRows((current) => [...current, newLine()]);
              }}
              className="inline-flex h-7 items-center gap-1 rounded-[5px] px-2 text-[12.5px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              <Plus aria-hidden className="size-3.5" />
              Agregar línea
            </button>
          }
        >
          <LineGrid
            products={lineProducts}
            rows={priced}
            onChange={setRows}
            price="readonly"
            priceLabel="Precio lista"
            extraLabel="Disponible"
            extra={(row) => {
              const status = stockById.get(row.productId);
              return status ? <Qty value={status.projected} /> : null;
            }}
            {...(showErrors ? { errors: lineErrors } : {})}
          />
          {showErrors && messages.length > 0 ? (
            <ul className="mx-5 mb-3 flex flex-col gap-0.5 rounded-md border border-critical/30 bg-critical-soft/50 px-3 py-2 text-[13px] text-ink">
              {messages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
        </DocumentSection>
      </DocumentScreen>

      <CustomerFormDialog
        open={newCustomerOpen}
        onClose={() => {
          setNewCustomerOpen(false);
        }}
        onCreated={(created) => {
          setCustomerId(created.id);
          setBranchId('');
        }}
      />
      {order ? (
        <CancelOrderDialog
          order={order}
          open={cancelOpen}
          onClose={() => {
            setCancelOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
