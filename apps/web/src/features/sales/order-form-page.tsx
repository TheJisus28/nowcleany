import { ArrowLeft, Check, Plus, Save, Trash2, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { api } from '../../api/client';
import { useAction, useCustomers, useOrder, useProducts, useStockStatus } from '../../api/hooks';
import type { SalesOrder } from '../../api/types';
import { Qty } from '../../components/qty';
import {
  Button,
  Field,
  Input,
  PageHeader,
  Panel,
  Select,
  Spinner,
  Textarea,
} from '../../components/ui';
import { parseDecimalInput, todayIso, unitLabel } from '../../lib/format';
import { CustomerFormDialog } from '../customers/customer-form-dialog';

interface LineDraft {
  key: number;
  productId: string;
  quantity: string;
}

let lineKey = 1;
const emptyLine = (): LineDraft => ({ key: lineKey++, productId: '', quantity: '' });

export function OrderFormPage() {
  const { id } = useParams();
  const existing = useOrder(id);
  if (id && existing.isPending) return <Spinner />;
  return <OrderForm key={existing.data?.id ?? 'new'} order={existing.data} />;
}

function OrderForm({ order }: { order: SalesOrder | undefined }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const customers = useCustomers();
  const products = useProducts({ type: 'FINISHED_GOOD', active: true });
  const stock = useStockStatus({ type: 'FINISHED_GOOD' });

  // A new order opened from a customer page starts with that customer.
  const [customerId, setCustomerId] = useState(order?.customer.id ?? params.get('cliente') ?? '');
  const [branchId, setBranchId] = useState(order?.branch.id ?? '');
  const customer = customers.data?.find((item) => item.id === customerId);
  const branches = (customer?.branches ?? []).filter(
    (branch) => branch.active || branch.id === order?.branch.id,
  );
  // Without a choice, the order ships to the customer's main branch.
  const selectedBranchId =
    branches.find((branch) => branch.id === branchId)?.id ??
    (branches.find((branch) => branch.isMain) ?? branches[0])?.id ??
    '';
  const [deliveryDate, setDeliveryDate] = useState(order?.estimatedDeliveryDate ?? todayIso(7));
  const [notes, setNotes] = useState(order?.notes ?? '');
  const [lines, setLines] = useState<LineDraft[]>(
    order?.lines.map((line) => ({
      key: lineKey++,
      productId: line.productId,
      quantity: line.quantity.quantity,
    })) ?? [emptyLine()],
  );
  const [showErrors, setShowErrors] = useState(false);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);

  const availability = useMemo(
    () => new Map((stock.data ?? []).map((row) => [row.productId, row])),
    [stock.data],
  );
  const unitOf = (productId: string) =>
    products.data?.find((p) => p.id === productId)?.stockUnit ?? 'un';

  const lineErrors = lines.map((line) => ({
    product: line.productId ? undefined : 'Elige un producto.',
    quantity:
      parseDecimalInput(line.quantity) === null || Number(parseDecimalInput(line.quantity)) <= 0
        ? 'Escribe una cantidad mayor que cero.'
        : undefined,
  }));
  const duplicated = new Set(
    lines
      .map((line) => line.productId)
      .filter((productId, index, all) => productId && all.indexOf(productId) !== index),
  );
  const valid =
    Boolean(customerId) &&
    Boolean(selectedBranchId) &&
    lineErrors.every((error) => !error.product && !error.quantity) &&
    duplicated.size === 0;

  const payload = () => ({
    customerId,
    branchId: selectedBranchId,
    ...(deliveryDate ? { estimatedDeliveryDate: deliveryDate } : {}),
    ...(notes.trim() ? { notes: notes.trim() } : {}),
    lines: lines.map((line) => ({
      productId: line.productId,
      quantity: parseDecimalInput(line.quantity) ?? '0',
    })),
  });

  const save = useAction(
    async (confirm: boolean) => {
      const saved = order
        ? await api.patch<SalesOrder>(`/v1/sales-orders/${order.id}`, payload())
        : await api.post<SalesOrder>('/v1/sales-orders', payload());
      return confirm ? api.post<SalesOrder>(`/v1/sales-orders/${saved.id}/confirm`) : saved;
    },
    {
      success: (saved) =>
        saved.status === 'CONFIRMED'
          ? `${saved.label} confirmada`
          : `${saved.label} guardada como borrador`,
    },
  );

  const submit = (event: { preventDefault(): void }, confirm: boolean) => {
    event.preventDefault();
    setShowErrors(true);
    if (!valid) return;
    save.mutate(confirm, {
      onSuccess: (saved) => {
        void navigate(`/ventas/${saved.id}`);
      },
    });
  };

  return (
    <>
      <Link
        to={order ? `/ventas/${order.id}` : '/ventas'}
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {order ? order.label : 'Ventas'}
      </Link>
      <PageHeader
        title={order ? `Editar ${order.label}` : 'Nueva preventa'}
        description="La preventa no se bloquea por falta de stock: al confirmarla, planta y compras ven de inmediato lo que hay que producir y comprar."
      />

      <form
        onSubmit={(event) => {
          submit(event, false);
        }}
        className="grid gap-6 lg:grid-cols-[1fr_320px]"
        noValidate
      >
        <div className="flex flex-col gap-6">
          <Panel title="Cliente y entrega">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Cliente"
                error={showErrors && !customerId ? 'Elige el cliente.' : undefined}
              >
                {(props) => (
                  <div className="flex gap-2">
                    <Select
                      {...props}
                      value={customerId}
                      onChange={(event) => {
                        setCustomerId(event.target.value);
                        setBranchId('');
                      }}
                    >
                      <option value="">Elige un cliente…</option>
                      {(customers.data ?? [])
                        .filter((item) => item.active || item.id === customerId)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} · {item.documentTypeLabel} {item.documentNumber}
                          </option>
                        ))}
                    </Select>
                    <Button
                      variant="secondary"
                      icon={<UserPlus className="size-4" />}
                      onClick={() => {
                        setNewCustomerOpen(true);
                      }}
                      aria-label="Nuevo cliente"
                      title="Nuevo cliente"
                      className="px-3"
                    />
                  </div>
                )}
              </Field>
              <Field
                label="Sucursal de entrega"
                hint={
                  customer
                    ? [
                        branches.find((b) => b.id === selectedBranchId)?.address,
                        branches.find((b) => b.id === selectedBranchId)?.city,
                      ]
                        .filter(Boolean)
                        .join(', ') || undefined
                    : 'Primero elige el cliente.'
                }
                error={
                  showErrors && customerId && !selectedBranchId ? 'Elige la sucursal.' : undefined
                }
              >
                {(props) => (
                  <Select
                    {...props}
                    value={selectedBranchId}
                    disabled={!customer}
                    onChange={(event) => {
                      setBranchId(event.target.value);
                    }}
                  >
                    {branches.length === 0 ? <option value="">Sin sucursales</option> : null}
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                        {branch.city ? ` · ${branch.city}` : ''}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field
                label="Fecha estimada de entrega"
                hint="Define la prioridad frente a las demás preventas."
              >
                {(props) => (
                  <Input
                    {...props}
                    type="date"
                    value={deliveryDate}
                    onChange={(event) => {
                      setDeliveryDate(event.target.value);
                    }}
                  />
                )}
              </Field>
            </div>
          </Panel>

          <Panel
            title="Productos"
            description="Solo productos terminados. Decimales con coma (2,5)."
            actions={
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus className="size-3.5" />}
                onClick={() => {
                  setLines((current) => [...current, emptyLine()]);
                }}
              >
                Agregar producto
              </Button>
            }
          >
            <ul className="flex flex-col gap-4">
              {lines.map((line, index) => {
                const status = availability.get(line.productId);
                const errors = lineErrors[index];
                return (
                  <li
                    key={line.key}
                    className="grid gap-3 sm:grid-cols-[1fr_160px_auto] sm:items-start"
                  >
                    <Field
                      label={`Producto ${String(index + 1)}`}
                      error={
                        showErrors
                          ? (errors?.product ??
                            (duplicated.has(line.productId)
                              ? 'Este producto ya está en otra línea.'
                              : undefined))
                          : undefined
                      }
                    >
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
                          <option value="">Elige un producto…</option>
                          {(products.data ?? []).map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.code} · {product.name}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                    <Field
                      label={`Cantidad${line.productId ? ` (${unitLabel(unitOf(line.productId))})` : ''}`}
                      error={showErrors ? errors?.quantity : undefined}
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
                          placeholder="0"
                        />
                      )}
                    </Field>
                    <div className="flex items-center justify-between gap-3 sm:mt-7 sm:justify-end">
                      {status ? (
                        <p className="text-[13px] text-ink-3 sm:hidden">
                          Proyectado <Qty value={status.projected} />
                        </p>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={lines.length === 1}
                        onClick={() => {
                          setLines((current) => current.filter((l) => l.key !== line.key));
                        }}
                        aria-label={`Quitar producto ${String(index + 1)}`}
                        icon={<Trash2 className="size-4" />}
                      />
                    </div>
                    {status ? (
                      <p className="-mt-1 hidden text-[13px] text-ink-3 sm:col-span-3 sm:block">
                        En stock <Qty value={status.onHand} /> · comprometido{' '}
                        <Qty value={status.committed} /> · proyectado{' '}
                        <Qty value={status.projected} />
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel title="Notas">
            <Field label="Notas para planta o bodega (opcional)">
              {(props) => (
                <Textarea
                  {...props}
                  maxLength={500}
                  value={notes}
                  onChange={(event) => {
                    setNotes(event.target.value);
                  }}
                />
              )}
            </Field>
          </Panel>
        </div>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <Panel title="Guardar">
            <p className="text-sm text-ink-2">
              En borrador no compromete stock ni cuenta para planta y compras. Al confirmar se
              reserva el producto y la preventa entra a la planeación.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <Button
                icon={<Check className="size-4" />}
                loading={save.isPending && save.variables}
                disabled={save.isPending}
                onClick={(event) => {
                  submit(event, true);
                }}
              >
                Guardar y confirmar
              </Button>
              <Button
                type="submit"
                variant="secondary"
                icon={<Save className="size-4" />}
                loading={save.isPending && !save.variables}
                disabled={save.isPending}
              >
                Guardar borrador
              </Button>
            </div>
          </Panel>
        </aside>
      </form>

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
    </>
  );
}
