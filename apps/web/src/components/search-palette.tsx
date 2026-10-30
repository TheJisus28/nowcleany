import { useQuery } from '@tanstack/react-query';
import {
  Contact,
  CornerDownLeft,
  Factory,
  FileText,
  type LucideIcon,
  Menu,
  Package,
  Search,
  ShoppingCart,
  Tags,
  Truck,
} from 'lucide-react';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api/client';
import type {
  Customer,
  Invoice,
  Product,
  ProductionOrder,
  PurchaseOrder,
  SalesOrder,
  Shipment,
} from '../api/types';
import { useAccess } from '../app/access';
import { NAV } from '../app/nav';
import { useSession } from '../auth/session';
import { pathTo } from './links';
import { cn } from './ui';

type Group =
  | 'menu'
  | 'order'
  | 'invoice'
  | 'customer'
  | 'product'
  | 'production-order'
  | 'purchase-order'
  | 'shipment';

interface Result {
  group: Group;
  key: string;
  title: string;
  detail: string;
  to: string;
  icon?: LucideIcon;
}

const GROUPS: { group: Group; label: string; icon: LucideIcon }[] = [
  { group: 'menu', label: 'Opciones del menú', icon: Menu },
  { group: 'order', label: 'Pedidos', icon: Tags },
  { group: 'invoice', label: 'Facturas de venta', icon: FileText },
  { group: 'customer', label: 'Clientes', icon: Contact },
  { group: 'product', label: 'Productos', icon: Package },
  { group: 'purchase-order', label: 'Órdenes de compra', icon: ShoppingCart },
  { group: 'shipment', label: 'Remisiones', icon: Truck },
  { group: 'production-order', label: 'Órdenes de producción', icon: Factory },
];

const PER_GROUP = 5;

function useDebounced(value: string, delay = 200): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);
  return debounced;
}

/** Lowercase without accents ("facturación" matches "facturacion"). */
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const contains = (needle: string, ...values: string[]) =>
  values.some((value) => normalize(value).includes(needle));

/**
 * Searches, in one box, the menu options of the role and every record the user can open: orders,
 * invoices (FV-), customers, products, purchase orders (OC-), shipping guides (GU-) and production
 * orders.
 */
function useResults(term: string): { results: Result[]; loading: boolean } {
  const { canOpen, has } = useAccess();
  const { can } = useSession();
  const needle = normalize(term.trim());
  const active = needle.length >= 2;
  const q = encodeURIComponent(term.trim());

  const products = useQuery({
    queryKey: ['search', 'products', needle],
    queryFn: () => api.get<Product[]>(`/v1/products?q=${q}`),
    enabled: active && canOpen('product'),
  });
  const orders = useQuery({
    queryKey: ['search', 'orders', needle],
    queryFn: () => api.get<SalesOrder[]>(`/v1/sales-orders?q=${q}&limit=${String(PER_GROUP)}`),
    enabled: active && canOpen('order'),
  });
  const invoices = useQuery({
    queryKey: ['search', 'invoices', needle],
    queryFn: () => api.get<Invoice[]>(`/v1/invoices?q=${q}&limit=${String(PER_GROUP)}`),
    enabled: active && canOpen('invoice') && can('invoices:read'),
  });
  const customers = useQuery({
    queryKey: ['search', 'customers', needle],
    queryFn: () => api.get<Customer[]>(`/v1/customers?q=${q}`),
    enabled: active && canOpen('customer') && can('customers:read'),
  });
  // Few and recent: fetched once and filtered here (their lists have no text search).
  const production = useQuery({
    queryKey: ['search', 'production-orders'],
    queryFn: () => api.get<ProductionOrder[]>('/v1/production-orders?limit=300'),
    enabled: active && canOpen('production-order'),
    staleTime: 60_000,
  });
  const purchases = useQuery({
    queryKey: ['search', 'purchase-orders'],
    queryFn: () => api.get<PurchaseOrder[]>('/v1/purchase-orders?limit=300'),
    enabled: active && canOpen('purchase-order'),
    staleTime: 60_000,
  });
  const shipments = useQuery({
    queryKey: ['search', 'shipments'],
    queryFn: () => api.get<Shipment[]>('/v1/shipments'),
    enabled: active && canOpen('shipment') && can('shipments:read'),
    staleTime: 60_000,
  });

  const results = useMemo(() => {
    if (!active) return [];
    const list: Result[] = [];
    for (const item of NAV.filter(
      (entry) =>
        has(entry.panel) && contains(needle, entry.label, entry.group ?? '', entry.kind ?? ''),
    ).slice(0, 6))
      list.push({
        group: 'menu',
        key: item.to,
        title: item.label,
        detail: [item.group ?? 'Inicio', item.kind].filter(Boolean).join(' › '),
        to: item.to,
        icon: item.icon,
      });
    for (const order of (orders.data ?? []).slice(0, PER_GROUP))
      list.push({
        group: 'order',
        key: order.id,
        title: `${order.label} · ${order.customer.name}`,
        detail: `${order.statusLabel} · ${order.seller.name}`,
        to: pathTo('order', order.id),
      });
    for (const invoice of (invoices.data ?? []).slice(0, PER_GROUP))
      list.push({
        group: 'invoice',
        key: invoice.id,
        title: `${invoice.label} · ${invoice.customer.name}`,
        detail: `${invoice.statusLabel} · pedido ${invoice.order.label}`,
        to: pathTo('invoice', invoice.id),
      });
    for (const customer of (customers.data ?? []).slice(0, PER_GROUP))
      list.push({
        group: 'customer',
        key: customer.id,
        title: customer.name,
        detail: [`${customer.documentTypeLabel} ${customer.documentNumber}`, customer.city]
          .filter(Boolean)
          .join(' · '),
        to: pathTo('customer', customer.id),
      });
    for (const product of (products.data ?? []).slice(0, PER_GROUP))
      list.push({
        group: 'product',
        key: product.id,
        title: product.name,
        detail: `${product.code} · ${product.typeLabel}`,
        to: pathTo('product', product.id),
      });
    for (const order of (purchases.data ?? [])
      .filter((o) =>
        contains(needle, o.label, o.supplier.name, ...o.lines.map((line) => line.productName)),
      )
      .slice(0, PER_GROUP))
      list.push({
        group: 'purchase-order',
        key: order.id,
        title: `${order.label} · ${order.supplier.name}`,
        detail: order.statusLabel,
        to: pathTo('purchase-order', order.id),
      });
    for (const shipment of (shipments.data ?? [])
      .filter((s) =>
        contains(
          needle,
          s.label,
          s.carrier,
          s.vehiclePlate,
          s.driverName,
          ...s.orders.flatMap((entry) => [entry.orderLabel, entry.customer.name]),
        ),
      )
      .slice(0, PER_GROUP))
      list.push({
        group: 'shipment',
        key: shipment.id,
        title: `${shipment.label} · ${shipment.vehiclePlate}`,
        detail: `${shipment.statusLabel} · ${shipment.driverName} · ${shipment.orders
          .map((entry) => entry.orderLabel)
          .join(', ')}`,
        to: pathTo('shipment', shipment.id),
      });
    for (const order of (production.data ?? [])
      .filter((o) => contains(needle, o.label, o.product.name, o.product.code))
      .slice(0, PER_GROUP))
      list.push({
        group: 'production-order',
        key: order.id,
        title: `${order.label} · ${order.product.name}`,
        detail: `${order.kind} · ${order.statusLabel}`,
        to: pathTo('production-order', order.id),
      });
    // Same order as the groups on screen, so the arrows move top to bottom.
    return GROUPS.flatMap((group) => list.filter((result) => result.group === group.group));
  }, [
    active,
    needle,
    has,
    products.data,
    orders.data,
    invoices.data,
    customers.data,
    production.data,
    purchases.data,
    shipments.data,
  ]);

  const loading =
    active &&
    [products, orders, invoices, customers, production, purchases, shipments].some(
      (query) => query.fetchStatus === 'fetching',
    );
  return { results, loading };
}

export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-label="Buscar"
      className="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-xl bg-transparent p-0 text-ink backdrop:bg-ink/40 backdrop:backdrop-blur-[2px]"
    >
      {open ? <Palette onClose={onClose} /> : null}
    </dialog>
  );
}

function Palette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);
  const debounced = useDebounced(term);
  const { results, loading } = useResults(debounced);

  const go = (result: Result | undefined) => {
    if (!result) return;
    onClose();
    void navigate(result.to);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(results[active]);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
      <label className="flex items-center gap-3 border-b border-line px-4">
        <Search aria-hidden className="size-5 shrink-0 text-ink-3" />
        <span className="sr-only">Buscar</span>
        <input
          autoFocus
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Menú, pedido, FV-, OC-, GU-, cliente o producto…"
          className="h-14 w-full bg-transparent text-[16px] outline-none placeholder:text-ink-3"
        />
        <kbd className="hidden rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-3 sm:block">
          Esc
        </kbd>
      </label>
      <div className="max-h-[60vh] overflow-y-auto p-2">
        {debounced.trim().length < 2 ? (
          <p className="px-3 py-6 text-center text-sm text-ink-3">
            Escribe al menos dos letras: una opción del menú (cartera, recibo), un número (PV-00012,
            FV-00102, OC-00045, GU-00007), un cliente o un producto.
          </p>
        ) : results.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-ink-3">
            {loading ? 'Buscando…' : 'Nada coincide con esa búsqueda.'}
          </p>
        ) : (
          GROUPS.map((group) => {
            const items = results.filter((result) => result.group === group.group);
            if (items.length === 0) return null;
            return (
              <section key={group.group} className="mb-1">
                <h3 className="px-3 pt-2 pb-1 text-[12px] font-medium text-ink-3">{group.label}</h3>
                <ul>
                  {items.map((item) => {
                    const index = results.indexOf(item);
                    const Icon = item.icon ?? group.icon;
                    return (
                      <li key={`${item.group}-${item.key}`}>
                        <button
                          type="button"
                          onMouseEnter={() => {
                            setActive(index);
                          }}
                          onClick={() => {
                            go(item);
                          }}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left',
                            index === active ? 'bg-brand-soft' : 'hover:bg-surface-2',
                          )}
                        >
                          <Icon aria-hidden className="size-4 shrink-0 text-ink-3" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{item.title}</span>
                            <span className="block truncate text-[12.5px] text-ink-3">
                              {item.detail}
                            </span>
                          </span>
                          {index === active ? (
                            <CornerDownLeft aria-hidden className="size-4 text-ink-3" />
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
