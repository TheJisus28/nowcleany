import {
  Banknote,
  CalendarRange,
  ChevronRight,
  ClipboardCheck,
  Factory,
  FileWarning,
  type LucideIcon,
  PackageCheck,
  ReceiptText,
  ShoppingCart,
  Truck,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import {
  useInvoices,
  useMonthlyPurchase,
  useOrders,
  usePurchaseNeeds,
  usePurchaseOrders,
  useShipments,
  useSupplierInvoices,
} from '../../api/hooks';
import type { SalesOrder } from '../../api/types';
import { useProfile } from '../../auth/session';
import { EntityLink } from '../../components/links';
import { DueDate, OrderStatusChip } from '../../components/status';
import { cn, PageHeader, Panel, Spinner } from '../../components/ui';
import { formatCop, formatCopShort, monthLabel, plural } from '../../lib/format';

/** The company's flow, left to right; each role sees where its step sits. */
const FLOW: readonly { role: string; label: string }[] = [
  { role: 'sales', label: 'Vendedor' },
  { role: 'consolidator', label: 'Consolidado' },
  { role: 'plant', label: 'Planta' },
  { role: 'logistics', label: 'Logística' },
  { role: 'accountant', label: 'Contable' },
];
const PURCHASE_FLOW: readonly { role: string; label: string }[] = [
  { role: 'purchasing', label: 'Compras' },
  { role: 'receiving', label: 'Recepción' },
  { role: 'plant', label: 'Planta' },
  { role: 'accountant', label: 'Contable' },
];

function FlowStrip({ roles }: { roles: readonly string[] }) {
  const purchasing = roles.includes('purchasing') || roles.includes('receiving');
  const steps = purchasing ? PURCHASE_FLOW : FLOW;
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-1.5 text-[13px]">
      {steps.map((step, index) => {
        const mine = roles.includes(step.role);
        return (
          <li key={step.role} className="flex items-center gap-1.5">
            <span
              className={cn(
                'rounded-full px-3 py-1',
                mine ? 'bg-brand font-medium text-white' : 'bg-surface-2 text-ink-2',
              )}
            >
              {step.label}
              {mine ? ' · tu paso' : ''}
            </span>
            {index < steps.length - 1 ? (
              <ChevronRight aria-hidden className="size-3.5 text-ink-3" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** One pending job: how many, what it means and where to do it. */
function Task({
  icon: Icon,
  title,
  description,
  count,
  to,
  action,
  loading,
  urgent = false,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  count: ReactNode;
  to: string;
  action: string;
  loading: boolean;
  urgent?: boolean;
  children?: ReactNode;
}) {
  return (
    <Panel flush>
      <div className="flex flex-wrap items-center gap-4 px-5 py-4">
        <span
          className={cn(
            'grid size-11 shrink-0 place-items-center rounded-lg',
            urgent ? 'bg-critical-soft text-critical' : 'bg-brand-soft text-brand',
          )}
        >
          <Icon aria-hidden className="size-5" />
        </span>
        <div className="min-w-48 flex-1">
          <h2 className="font-semibold [font-stretch:108%]">{title}</h2>
          <p className="text-[13.5px] text-ink-2">{description}</p>
        </div>
        <span className="text-[30px] leading-none font-semibold tabular-nums">
          {loading ? '…' : count}
        </span>
        <Link
          to={to}
          className="inline-flex h-10 items-center gap-1.5 rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand-strong"
        >
          {action}
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      </div>
      {children ? <div className="border-t border-line">{children}</div> : null}
    </Panel>
  );
}

function OrderPreview({ orders }: { orders: readonly SalesOrder[] }) {
  if (orders.length === 0) return null;
  return (
    <ul className="divide-y divide-line text-sm">
      {orders.slice(0, 5).map((order) => (
        <li key={order.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5">
          <EntityLink to="order" id={order.id} className="w-24 font-medium">
            {order.label}
          </EntityLink>
          <span className="min-w-40 flex-1 truncate">
            {order.customer.name}
            <span className="text-ink-3"> · {order.branch.city ?? order.branch.name}</span>
          </span>
          <OrderStatusChip status={order.status} />
          <DueDate date={order.estimatedDeliveryDate} />
        </li>
      ))}
    </ul>
  );
}

export function TasksPage() {
  const profile = useProfile();
  const roles = profile.roles;
  const is = (role: string) => roles.includes(role) || roles.includes('admin');

  const toInvoice = useOrders({ status: 'CONFIRMED', limit: '500' }, is('consolidator'));
  const toPrepare = useOrders({ status: 'INVOICED,PARTIAL', limit: '500' }, is('plant'));
  const ready = useOrders({ status: 'READY', limit: '500' }, is('logistics'));
  const onRoad = useShipments({ status: 'PLANNED,IN_TRANSIT' }, is('logistics'));
  const purchaseNeeds = usePurchaseNeeds();
  const monthly = useMonthlyPurchase();
  const awaiting = usePurchaseOrders(
    'OPEN,PARTIAL',
    undefined,
    is('purchasing') || is('receiving'),
  );
  const receivables = useInvoices({ open: true, limit: '2000' }, is('accountant'));
  const payables = useSupplierInvoices({ open: true }, is('accountant'));

  const urgent = (purchaseNeeds.data?.rows ?? []).filter((row) => Number(row.toBuy.quantity) > 0);
  const suggested = (monthly.data?.purchases ?? []).filter(
    (row) => Number(row.suggested.quantity) > 0,
  );
  const overdue = (receivables.data ?? []).filter((invoice) => invoice.status === 'OVERDUE');
  const sum = (values: readonly string[]) =>
    values.reduce((total, value) => total + BigInt(value), 0n).toString();

  return (
    <>
      <PageHeader
        title={`Hola, ${profile.fullName.split(' ')[0] ?? profile.fullName}`}
        description="Lo que te toca hoy. Cada paso lo autorizas tú y pasa al siguiente; todo queda en la traza."
      />
      <FlowStrip roles={roles} />
      <div className="flex flex-col gap-4">
        {is('consolidator') ? (
          <Task
            icon={ClipboardCheck}
            title="Preventas por consolidar"
            description="Enviadas por los vendedores. Facturas siempre: lo que el stock no cubre queda pendiente para planta y compras."
            count={toInvoice.data?.length ?? 0}
            loading={toInvoice.isPending}
            to="/consolidado"
            action="Consolidar"
          >
            <OrderPreview orders={toInvoice.data ?? []} />
          </Task>
        ) : null}

        {is('plant') ? (
          <Task
            icon={Factory}
            title="Pedidos por alistar"
            description="Facturados por el consolidado. Alista lo que exista y entrégalo a despacho; lo que falta, prográmalo."
            count={toPrepare.data?.length ?? 0}
            loading={toPrepare.isPending}
            to="/planta"
            action="Ir a planta"
          >
            <OrderPreview orders={toPrepare.data ?? []} />
          </Task>
        ) : null}

        {is('logistics') ? (
          <>
            <Task
              icon={PackageCheck}
              title="Listos para despacho"
              description="Planta ya los entregó: arma la guía con el vehículo y la ruta."
              count={ready.data?.length ?? 0}
              loading={ready.isPending}
              to="/logistica"
              action="Armar guía"
            >
              <OrderPreview orders={ready.data ?? []} />
            </Task>
            <Task
              icon={Truck}
              title="Guías por despachar o en ruta"
              description="Despacha las guías armadas y confirma quién recibió cada pedido."
              count={onRoad.data?.length ?? 0}
              loading={onRoad.isPending}
              to="/logistica"
              action="Ver guías"
            />
          </>
        ) : null}

        {is('purchasing') ? (
          <>
            <Task
              icon={ShoppingCart}
              title="Compra urgente"
              description="Insumos y mercancía que faltan para lo ya vendido (descontado lo que viene en camino)."
              count={urgent.length}
              loading={purchaseNeeds.isPending}
              urgent={urgent.length > 0}
              to="/compras"
              action="Pedir"
            />
            <Task
              icon={CalendarRange}
              title={`Plan de ${monthly.data ? monthLabel(monthly.data.month) : 'el mes'}`}
              description={
                monthly.data
                  ? `Según lo vendido en ${monthLabel(monthly.data.basedOn)}: ${plural(suggested.length, 'producto por pedir', 'productos por pedir')}, unos ${formatCopShort(monthly.data.estimatedCost)}.`
                  : 'Lo que conviene tener este mes según lo vendido el mes anterior.'
              }
              count={suggested.length}
              loading={monthly.isPending}
              to="/compras/plan"
              action="Ver plan"
            />
          </>
        ) : null}

        {is('purchasing') || is('receiving') ? (
          <Task
            icon={ReceiptText}
            title={
              is('receiving') ? 'Órdenes esperando factura del proveedor' : 'Órdenes en tránsito'
            }
            description={
              is('receiving')
                ? 'Cuando llegue la mercancía con su factura, ingrésala contra la orden: así entra al inventario.'
                : 'Pedidas a los proveedores, aún sin recibir todo.'
            }
            count={awaiting.data?.length ?? 0}
            loading={awaiting.isPending}
            to={is('receiving') ? '/recepcion' : '/compras'}
            action={is('receiving') ? 'Ingresar facturas' : 'Ver órdenes'}
          >
            {(awaiting.data ?? []).length > 0 ? (
              <ul className="divide-y divide-line text-sm">
                {(awaiting.data ?? []).slice(0, 5).map((order) => (
                  <li
                    key={order.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5"
                  >
                    <EntityLink to="purchase-order" id={order.id} className="w-24 font-medium">
                      {order.label}
                    </EntityLink>
                    <span className="min-w-40 flex-1 truncate">{order.supplier.name}</span>
                    <span className="text-ink-2">{order.statusLabel}</span>
                    <DueDate date={order.expectedDate} lateLabel="No ha llegado" />
                  </li>
                ))}
              </ul>
            ) : null}
          </Task>
        ) : null}

        {is('accountant') ? (
          <>
            <Task
              icon={FileWarning}
              title="Facturas vencidas por cobrar"
              description={`Suman ${formatCop(sum(overdue.map((invoice) => invoice.balance)))} de ${plural(new Set(overdue.map((i) => i.customer.id)).size, 'cliente', 'clientes')}.`}
              count={overdue.length}
              loading={receivables.isPending}
              urgent={overdue.length > 0}
              to="/contabilidad"
              action="Cobrar"
            />
            <Task
              icon={Banknote}
              title="Facturas de proveedor por pagar"
              description={`Suman ${formatCop(sum((payables.data ?? []).map((invoice) => invoice.balance)))}; ${plural((payables.data ?? []).filter((invoice) => invoice.overdue).length, 'vencida', 'vencidas')}.`}
              count={payables.data?.length ?? 0}
              loading={payables.isPending}
              to="/contabilidad"
              action="Pagar"
            />
          </>
        ) : null}

        {roles.length === 0 ? <Spinner /> : null}
      </div>
    </>
  );
}
