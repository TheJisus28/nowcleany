import { ChevronRight, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  useInvoices,
  useMonthlyPurchase,
  useOrders,
  useProductionOrders,
  usePurchaseNeeds,
  usePurchaseOrders,
  useShipments,
  useSupplierInvoices,
} from '../../api/hooks';
import { useProfile } from '../../auth/session';
import { FilterBar, FilterField, QueryGrid } from '../../components/erp/query-grid';
import { DocumentToolbar } from '../../components/erp/toolbar';
import { DueDate } from '../../components/status';
import { cn, Input, Select } from '../../components/ui';
import {
  formatCop,
  formatDate,
  formatDecimal,
  monthLabel,
  todayIso,
  unitLabel,
} from '../../lib/format';

/** One document waiting for the user's step. */
interface Pending {
  id: string;
  document: string;
  kind: string;
  party: string;
  step: string;
  /** When it reached this step. */
  since: string | null;
  /** Promised, expected or due date. */
  due: string | null;
  amount: string | null;
  quantity: string | null;
  to: string;
}

/** The company's flow; each user sees where their step sits. */
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
  const steps = roles.includes('purchasing') || roles.includes('receiving') ? PURCHASE_FLOW : FLOW;
  return (
    <ol className="flex flex-wrap items-center gap-1 text-[12.5px]">
      {steps.map((step, index) => {
        const mine = roles.includes(step.role);
        return (
          <li key={step.role} className="flex items-center gap-1">
            <span
              className={cn(
                'rounded px-2 py-0.5',
                mine ? 'bg-brand font-medium text-white' : 'bg-surface-2 text-ink-2',
              )}
            >
              {step.label}
            </span>
            {index < steps.length - 1 ? (
              <ChevronRight aria-hidden className="size-3 text-ink-3" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

const pendingUnits = (lines: readonly { pending: { quantity: string } }[]) =>
  lines.reduce((sum, line) => sum + Number(line.pending.quantity), 0).toString();

/** Pendientes: every document waiting for the user's step, in one consultation. */
export function TasksPage() {
  const profile = useProfile();
  const navigate = useNavigate();
  const client = useQueryClient();
  const roles = profile.roles;
  const admin = roles.includes('admin');
  const is = (role: string) => roles.includes(role) || admin;
  const [kind, setKind] = useState('');
  const [text, setText] = useState('');

  const toInvoice = useOrders({ status: 'CONFIRMED', limit: '500' }, is('consolidator'));
  const toPrepare = useOrders({ status: 'INVOICED,PARTIAL', limit: '500' }, is('plant'));
  const production = useProductionOrders('PLANNED');
  const ready = useOrders({ status: 'READY', limit: '500' }, is('logistics'));
  const guides = useShipments({ status: 'PLANNED,IN_TRANSIT' }, is('logistics'));
  const needs = usePurchaseNeeds();
  const monthly = useMonthlyPurchase();
  const awaiting = usePurchaseOrders(
    'OPEN,PARTIAL',
    undefined,
    is('purchasing') || is('receiving'),
  );
  const receivables = useInvoices({ open: true, limit: '2000' }, is('accountant'));
  const payables = useSupplierInvoices({ open: true }, is('accountant'));

  const rows = useMemo<Pending[]>(() => {
    const has = (role: string) => roles.includes(role) || admin;
    const today = todayIso();
    const list: Pending[] = [];
    if (has('consolidator'))
      for (const order of toInvoice.data ?? [])
        list.push({
          id: `inv-${order.id}`,
          document: order.label,
          kind: 'Pedido',
          party: order.customer.name,
          step: 'Facturar',
          since: order.confirmedAt,
          due: order.estimatedDeliveryDate,
          amount: null,
          quantity: pendingUnits(order.lines),
          to: '/consolidado',
        });
    if (has('plant')) {
      for (const order of toPrepare.data ?? [])
        list.push({
          id: `prep-${order.id}`,
          document: order.label,
          kind: order.status === 'PARTIAL' ? 'Pedido (parcial)' : 'Pedido facturado',
          party: order.customer.name,
          step: 'Alistar y entregar a despacho',
          since: order.invoicedAt,
          due: order.estimatedDeliveryDate,
          amount: null,
          quantity: pendingUnits(order.lines),
          to: `/planta/alistar/${order.id}`,
        });
      for (const order of production.data ?? [])
        list.push({
          id: `op-${order.id}`,
          document: order.label,
          kind: 'Orden de producción',
          party: `${order.product.code} · ${order.product.name}`,
          step: 'Producir y registrar',
          since: order.createdAt,
          due: order.scheduledDate,
          amount: null,
          quantity: `${formatDecimal(order.plannedQuantity.quantity)} ${unitLabel(order.plannedQuantity.unit)}`,
          to: `/planta/ordenes/${order.id}`,
        });
    }
    if (has('logistics')) {
      for (const order of ready.data ?? [])
        list.push({
          id: `ship-${order.id}`,
          document: order.label,
          kind: 'Pedido alistado',
          party: `${order.customer.name} · ${order.branch.city ?? order.branch.name}`,
          step: 'Incluir en una guía de despacho',
          since: order.readyAt,
          due: order.estimatedDeliveryDate,
          amount: null,
          quantity: pendingUnits(order.lines),
          to: `/logistica/nueva?pedidos=${order.id}`,
        });
      for (const guide of guides.data ?? [])
        list.push({
          id: `guide-${guide.id}`,
          document: guide.label,
          kind: 'Guía',
          party: `${guide.vehiclePlate} · ${guide.driverName}`,
          step: guide.status === 'PLANNED' ? 'Despachar' : 'Confirmar entregas',
          since: guide.dispatchedAt ?? guide.createdAt,
          due: guide.scheduledDate,
          amount: null,
          quantity: String(guide.orders.length),
          to: `/logistica/guias/${guide.id}`,
        });
    }
    if (has('purchasing')) {
      for (const need of (needs.data?.rows ?? []).filter((row) => Number(row.toBuy.quantity) > 0))
        list.push({
          id: `buy-${need.product.id}`,
          document: need.product.code,
          kind: 'Compra urgente',
          party: need.product.name,
          step: 'Pedir al proveedor',
          since: null,
          due: today,
          amount: null,
          quantity: `${formatDecimal(need.toBuy.quantity)} ${unitLabel(need.toBuy.unit)}`,
          to: '/compras',
        });
      if (monthly.data)
        list.push({
          id: 'plan',
          document: `Plan ${monthly.data.month}`,
          kind: 'Plan de compras',
          party: `Según lo vendido en ${monthLabel(monthly.data.basedOn)}`,
          step: 'Revisar y pedir lo del mes',
          since: null,
          due: `${monthly.data.month}-01`,
          amount: monthly.data.estimatedCost,
          quantity: String(
            monthly.data.purchases.filter((row) => Number(row.suggested.quantity) > 0).length,
          ),
          to: '/compras/plan',
        });
    }
    if (has('purchasing') || has('receiving'))
      for (const order of awaiting.data ?? [])
        list.push({
          id: `po-${order.id}`,
          document: order.label,
          kind: order.status === 'PARTIAL' ? 'Orden recibida parcial' : 'Orden de compra',
          party: order.supplier.name,
          step: has('receiving') ? 'Registrar entrada de almacén' : 'Esperar entrega del proveedor',
          since: order.createdAt,
          due: order.expectedDate,
          amount: order.total,
          quantity: null,
          to: has('receiving')
            ? `/recepcion/nueva?orden=${order.id}`
            : `/compras/ordenes/${order.id}`,
        });
    if (has('accountant')) {
      for (const invoice of (receivables.data ?? []).filter((item) => item.status === 'OVERDUE'))
        list.push({
          id: `rc-${invoice.id}`,
          document: invoice.label,
          kind: 'Factura vencida',
          party: invoice.customer.name,
          step: 'Cobrar (recibo de caja)',
          since: invoice.issuedAt,
          due: invoice.dueDate,
          amount: invoice.balance,
          quantity: null,
          to: `/contabilidad/recibos?factura=${invoice.id}`,
        });
      for (const invoice of payables.data ?? [])
        list.push({
          id: `ce-${invoice.id}`,
          document: `Fact. ${invoice.documentNumber}`,
          kind: 'Factura de proveedor',
          party: invoice.supplier.name,
          step: 'Pagar (comprobante de egreso)',
          since: invoice.invoiceDate,
          due: invoice.dueDate,
          amount: invoice.balance,
          quantity: null,
          to: `/contabilidad/egresos?factura=${invoice.id}`,
        });
    }
    return list;
  }, [
    roles,
    admin,
    toInvoice.data,
    toPrepare.data,
    production.data,
    ready.data,
    guides.data,
    needs.data,
    monthly.data,
    awaiting.data,
    receivables.data,
    payables.data,
  ]);

  const kinds = [...new Set(rows.map((row) => row.kind))];
  const needle = text.trim().toLowerCase();
  const filtered = rows.filter(
    (row) =>
      (!kind || row.kind === kind) &&
      (!needle || `${row.document} ${row.party} ${row.step}`.toLowerCase().includes(needle)),
  );

  return (
    <>
      <DocumentToolbar
        actions={[
          {
            label: 'Actualizar',
            icon: RefreshCw,
            shortcut: 'F5',
            onClick: () => {
              void client.invalidateQueries();
            },
          },
          {
            label: 'Facturación de pedidos',
            to: '/consolidado',
            primary: true,
            hidden: !is('consolidator'),
          },
          { label: 'Alistamiento', to: '/planta', primary: true, hidden: !is('plant') },
          { label: 'Guías de despacho', to: '/logistica', primary: true, hidden: !is('logistics') },
          {
            label: 'Nueva orden de compra',
            to: '/compras/nueva',
            primary: true,
            hidden: !is('purchasing'),
          },
          {
            label: 'Nueva entrada de almacén',
            to: '/recepcion/nueva',
            primary: true,
            hidden: !is('receiving'),
          },
          {
            label: 'Recibo de caja',
            to: '/contabilidad/recibos',
            primary: true,
            hidden: !is('accountant'),
          },
          {
            label: 'Comprobante de egreso',
            to: '/contabilidad/egresos',
            hidden: !is('accountant'),
          },
        ]}
      />
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold [font-stretch:110%]">Pendientes</h1>
        </div>
        <FlowStrip roles={roles} />
      </div>
      <div className="overflow-hidden rounded-t-[8px] border border-b-0 border-line bg-surface">
        <FilterBar>
          <FilterField label="Tipo de documento">
            <Select
              value={kind}
              onChange={(event) => {
                setKind(event.target.value);
              }}
              className="w-56"
            >
              <option value="">Todos</option>
              {kinds.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Buscar">
            <Input
              value={text}
              onChange={(event) => {
                setText(event.target.value);
              }}
              placeholder="Número, tercero o paso"
              className="w-64"
            />
          </FilterField>
        </FilterBar>
      </div>
      <QueryGrid<Pending>
        title="Pendientes"
        rows={filtered}
        rowKey={(row) => row.id}
        onOpen={(row) => {
          void navigate(row.to);
        }}
        empty="No tienes documentos pendientes: lo que te toca está al día."
        initialSort={{ key: 'due', direction: 'asc' }}
        columns={[
          {
            key: 'document',
            header: 'Documento',
            render: (row) => <span className="font-medium whitespace-nowrap">{row.document}</span>,
            sort: (row) => row.document,
            csv: (row) => row.document,
          },
          {
            key: 'kind',
            header: 'Tipo',
            render: (row) => row.kind,
            sort: (row) => row.kind,
            csv: (row) => row.kind,
          },
          {
            key: 'party',
            header: 'Tercero / detalle',
            render: (row) => <span className="block max-w-80 truncate">{row.party}</span>,
            sort: (row) => row.party,
            csv: (row) => row.party,
          },
          {
            key: 'step',
            header: 'Tu paso',
            render: (row) => <span className="font-medium text-brand">{row.step}</span>,
            sort: (row) => row.step,
            csv: (row) => row.step,
          },
          {
            key: 'since',
            header: 'Desde',
            render: (row) => formatDate(row.since),
            sort: (row) => row.since ?? '',
            csv: (row) => row.since?.slice(0, 10) ?? '',
            hideOnMobile: true,
          },
          {
            key: 'due',
            header: 'Fecha límite',
            render: (row) => (row.due ? <DueDate date={row.due} /> : '—'),
            sort: (row) => row.due ?? '9999',
            csv: (row) => row.due ?? '',
          },
          {
            key: 'quantity',
            header: 'Cantidad',
            align: 'right',
            render: (row) => (row.quantity ? formatDecimal(row.quantity) : ''),
            csv: (row) => row.quantity ?? '',
            hideOnMobile: true,
          },
          {
            key: 'amount',
            header: 'Valor',
            align: 'right',
            render: (row) => (row.amount ? formatCop(row.amount) : ''),
            sort: (row) => Number(row.amount ?? 0),
            csv: (row) => row.amount ?? '',
            total: (list) =>
              formatCop(String(list.reduce((sum, row) => sum + Number(row.amount ?? 0), 0))),
          },
        ]}
      />
    </>
  );
}
