import { useQuery } from '@tanstack/react-query';
import {
  Contact,
  CornerDownLeft,
  Factory,
  type LucideIcon,
  Package,
  Search,
  ShoppingCart,
  Tags,
} from 'lucide-react';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api/client';
import type { Customer, Product, ProductionOrder, PurchaseOrder, SalesOrder } from '../api/types';
import { type Entity, useAccess } from '../app/access';
import { useSession } from '../auth/session';
import { pathTo } from './links';
import { cn } from './ui';

interface Result {
  entity: Entity;
  id: string;
  title: string;
  detail: string;
}

const GROUPS: { entity: Entity; label: string; icon: LucideIcon }[] = [
  { entity: 'product', label: 'Productos', icon: Package },
  { entity: 'order', label: 'Preventas', icon: Tags },
  { entity: 'customer', label: 'Clientes', icon: Contact },
  { entity: 'production-order', label: 'Órdenes de producción', icon: Factory },
  { entity: 'purchase-order', label: 'Órdenes de compra', icon: ShoppingCart },
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

const contains = (needle: string, ...values: string[]) =>
  values.some((value) => value.toLowerCase().includes(needle));

/** Searches, in one box, every record the user can open: products, orders, customers, OP and OC. */
function useResults(term: string): { results: Result[]; loading: boolean } {
  const { canOpen } = useAccess();
  const { can } = useSession();
  const needle = term.trim().toLowerCase();
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

  const results = useMemo(() => {
    if (!active) return [];
    const list: Result[] = [];
    for (const product of (products.data ?? []).slice(0, PER_GROUP))
      list.push({
        entity: 'product',
        id: product.id,
        title: product.name,
        detail: `${product.code} · ${product.typeLabel}`,
      });
    for (const order of (orders.data ?? []).slice(0, PER_GROUP))
      list.push({
        entity: 'order',
        id: order.id,
        title: `${order.label} · ${order.customer.name}`,
        detail: `${order.statusLabel} · ${order.seller.name}`,
      });
    for (const customer of (customers.data ?? []).slice(0, PER_GROUP))
      list.push({
        entity: 'customer',
        id: customer.id,
        title: customer.name,
        detail: [customer.taxId ? `NIT ${customer.taxId}` : null, customer.city]
          .filter(Boolean)
          .join(' · '),
      });
    for (const order of (production.data ?? [])
      .filter((o) => contains(needle, o.label, o.product.name, o.product.code))
      .slice(0, PER_GROUP))
      list.push({
        entity: 'production-order',
        id: order.id,
        title: `${order.label} · ${order.product.name}`,
        detail: `${order.kind} · ${order.statusLabel}`,
      });
    for (const order of (purchases.data ?? [])
      .filter((o) =>
        contains(needle, o.label, o.supplier, ...o.lines.map((line) => line.productName)),
      )
      .slice(0, PER_GROUP))
      list.push({
        entity: 'purchase-order',
        id: order.id,
        title: `${order.label} · ${order.supplier}`,
        detail: order.statusLabel,
      });
    return list;
  }, [active, needle, products.data, orders.data, customers.data, production.data, purchases.data]);

  const loading =
    active &&
    [products, orders, customers, production, purchases].some(
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
    void navigate(pathTo(result.entity, result.id));
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
          placeholder="Producto, preventa, cliente, OP u OC…"
          className="h-14 w-full bg-transparent text-[16px] outline-none placeholder:text-ink-3"
        />
        <kbd className="hidden rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-3 sm:block">
          Esc
        </kbd>
      </label>
      <div className="max-h-[60vh] overflow-y-auto p-2">
        {debounced.trim().length < 2 ? (
          <p className="px-3 py-6 text-center text-sm text-ink-3">
            Escribe al menos dos letras: un código (00224, PV-00012), un nombre o un proveedor.
          </p>
        ) : results.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-ink-3">
            {loading ? 'Buscando…' : 'Nada coincide con esa búsqueda.'}
          </p>
        ) : (
          GROUPS.map((group) => {
            const items = results.filter((result) => result.entity === group.entity);
            if (items.length === 0) return null;
            return (
              <section key={group.entity} className="mb-1">
                <h3 className="px-3 pt-2 pb-1 text-[12px] font-medium text-ink-3">{group.label}</h3>
                <ul>
                  {items.map((item) => {
                    const index = results.indexOf(item);
                    return (
                      <li key={`${item.entity}-${item.id}`}>
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
                          <group.icon aria-hidden className="size-4 shrink-0 text-ink-3" />
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
