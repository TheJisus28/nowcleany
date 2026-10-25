import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { type Entity, useAccess } from '../app/access';
import { cn } from './ui';

const PATHS: Record<Entity, (id: string) => string> = {
  product: (id) => `/productos/${id}`,
  order: (id) => `/ventas/${id}`,
  customer: (id) => `/clientes/${id}`,
  'production-order': (id) => `/planta/ordenes/${id}`,
  'purchase-order': (id) => `/compras/ordenes/${id}`,
};

export function pathTo(entity: Entity, id: string): string {
  return PATHS[entity](id);
}

/**
 * A record named anywhere in the app (product, order, customer…): a link to its page when the user
 * can open it, plain text otherwise. Clicks do not bubble, so it works inside clickable rows.
 */
export function EntityLink({
  to,
  id,
  children,
  className,
}: {
  to: Entity;
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const { canOpen } = useAccess();
  if (!canOpen(to)) return <span className={className}>{children}</span>;
  return (
    <Link
      to={PATHS[to](id)}
      onClick={(event) => {
        event.stopPropagation();
      }}
      className={cn(
        'rounded-sm underline decoration-line-strong decoration-1 underline-offset-[3px] transition-colors hover:text-brand hover:decoration-brand',
        // Document numbers (PV-00012, OP-00003) never break across lines.
        to !== 'product' && to !== 'customer' && 'whitespace-nowrap',
        className,
      )}
    >
      {children}
    </Link>
  );
}

/** Product name (linked) with its code underneath, the way products are shown in every table. */
export function ProductCell({
  product,
  detail,
}: {
  product: { id: string; code: string; name: string };
  detail?: ReactNode;
}) {
  return (
    <span className="block min-w-0">
      <EntityLink to="product" id={product.id} className="font-medium">
        {product.name}
      </EntityLink>
      <span className="block text-[12.5px] text-ink-3">
        {product.code}
        {detail ? <> · {detail}</> : null}
      </span>
    </span>
  );
}

/**
 * Back to wherever the user came from inside the app (a product opened from Compras goes back to
 * Compras); on a page opened directly, to a sensible parent.
 */
export function BackLink({ fallback, label }: { fallback: string; label: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const cameFromApp = location.key !== 'default';
  return (
    <Link
      to={fallback}
      onClick={(event) => {
        if (!cameFromApp) return;
        event.preventDefault();
        void navigate(-1);
      }}
      className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink"
    >
      <ArrowLeft aria-hidden className="size-4" />
      {cameFromApp ? 'Volver' : label}
    </Link>
  );
}
