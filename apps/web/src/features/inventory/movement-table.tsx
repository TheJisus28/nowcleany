import type { Entity } from '../../app/access';
import type { Movement } from '../../api/types';
import { DataTable } from '../../components/data-table';
import { EntityLink, ProductCell } from '../../components/links';
import { Qty } from '../../components/qty';
import { EmptyState } from '../../components/ui';
import { formatDateTime } from '../../lib/format';

/** Documents a movement can point to, so the kardex links back to what caused each entry. */
const REFERENCE_PAGES: Record<string, Entity> = {
  sales_order: 'order',
  production_order: 'production-order',
  purchase_order: 'purchase-order',
};

/** The kardex: every movement with its running balance. */
export function MovementTable({ rows, showProduct }: { rows: Movement[]; showProduct: boolean }) {
  return (
    <DataTable<Movement>
      label="Kardex"
      rows={rows}
      rowKey={(row) => row.id}
      empty={<EmptyState title="Sin movimientos" />}
      columns={[
        {
          key: 'when',
          header: 'Fecha',
          render: (row) => (
            <span>
              {formatDateTime(row.occurredAt)}
              <span className="block text-[12.5px] text-ink-3">{row.typeLabel}</span>
            </span>
          ),
        },
        ...(showProduct
          ? [
              {
                key: 'product',
                header: 'Producto',
                render: (row: Movement) => <ProductCell product={row.product} />,
              },
            ]
          : []),
        {
          key: 'warehouse',
          header: 'Bodega',
          render: (row) => row.warehouse.name,
          hideOnMobile: true,
        },
        {
          key: 'quantity',
          header: 'Cantidad',
          align: 'right',
          render: (row) => (
            <span className={row.quantity.quantity.startsWith('-') ? '' : 'text-good'}>
              {row.quantity.quantity.startsWith('-') ? '' : '+'}
              <Qty
                value={row.quantity}
                className={row.quantity.quantity.startsWith('-') ? '' : 'text-ink'}
              />
            </span>
          ),
        },
        {
          key: 'balance',
          header: 'Saldo',
          align: 'right',
          render: (row) => <Qty value={row.balanceAfter} />,
        },
        {
          key: 'reference',
          header: 'Referencia',
          hideOnMobile: true,
          render: (row) => {
            const page = row.reference ? REFERENCE_PAGES[row.reference.type] : undefined;
            return (
              <span className="text-[13px] text-ink-2">
                {row.reference && page ? (
                  <EntityLink to={page} id={row.reference.id}>
                    {row.reference.label}
                  </EntityLink>
                ) : (
                  (row.reference?.label ?? row.note ?? '—')
                )}
                <span className="block text-ink-3">{row.actor.name}</span>
              </span>
            );
          },
        },
      ]}
    />
  );
}
