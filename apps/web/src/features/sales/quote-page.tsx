import { Printer, X } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { useOrder, useProducts } from '../../api/hooks';
import type { SalesOrder } from '../../api/types';
import { BrandMark } from '../../components/brand';
import { useWorkTab } from '../../components/erp';
import { QueryView } from '../../components/ui';
import { formatCop, formatDate, formatDecimal, unitLabel } from '../../lib/format';
import { amountFor, colombiaDay } from '../billing/billing-format';

/**
 * The pre-sale as a formal quotation to print or save as PDF (the browser's print dialog). Prices are
 * today's list prices without taxes: billing adds VAT only if the customer asks for an electronic
 * invoice.
 */
export function QuotePage() {
  const { id } = useParams();
  const order = useOrder(id);
  return <QueryView query={order}>{(data) => <Quote order={data} />}</QueryView>;
}

function Quote({ order }: { order: SalesOrder }) {
  useWorkTab(`Cotización ${order.label}`);
  const products = useProducts();
  const lines = useMemo(() => {
    const prices = new Map((products.data ?? []).map((product) => [product.id, product.price]));
    return order.lines.map((line) => {
      const price = prices.get(line.productId) ?? null;
      return { ...line, price, amount: price ? amountFor(line.quantity.quantity, price) : null };
    });
  }, [order.lines, products.data]);
  const total = lines.reduce((sum, line) => sum + (line.amount ?? 0n), 0n);
  const address = [order.branch.address, order.branch.city].filter(Boolean).join(', ');

  return (
    <div className="mx-auto max-w-[860px]">
      <div className="no-print mb-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            window.print();
          }}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-brand px-4 text-[14px] font-medium text-white hover:bg-brand-strong"
        >
          <Printer aria-hidden className="size-4" />
          Imprimir o guardar PDF
        </button>
        <Link
          to={`/ventas/${order.id}`}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-[14px] text-ink-2 hover:bg-surface-2"
        >
          <X aria-hidden className="size-4" />
          Volver al pedido
        </Link>
      </div>

      <article className="rounded-[8px] border border-line bg-white p-10 text-[13.5px] text-ink print:rounded-none print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-6 border-b-2 border-brand pb-5">
          <div className="flex items-center gap-3">
            <BrandMark className="size-12" />
            <div>
              <p className="text-[18px] font-bold [font-stretch:112%]">NOW CLEANY S.A.S.</p>
              <p className="text-ink-2">Productos de limpieza · Montería, Córdoba</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[12px] font-semibold tracking-[0.12em] text-ink-3 uppercase">
              Cotización
            </p>
            <p className="text-[22px] font-bold tabular-nums">{order.label}</p>
            <p className="text-ink-2">Fecha: {formatDate(colombiaDay(order.createdAt))}</p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-x-8 gap-y-3 py-5">
          <div>
            <p className="text-[11.5px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
              Cliente
            </p>
            <p className="font-semibold">{order.customer.name}</p>
            <p className="tabular-nums">
              {order.customer.documentType === 'NIT' ? 'NIT' : 'C.C.'}{' '}
              {order.customer.documentNumber}
            </p>
          </div>
          <div>
            <p className="text-[11.5px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
              Entregar en
            </p>
            <p className="font-semibold">{order.branch.name}</p>
            <p>{address || 'Sin dirección'}</p>
          </div>
          <div>
            <p className="text-[11.5px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
              Vendedor
            </p>
            <p>{order.seller.name}</p>
          </div>
          <div>
            <p className="text-[11.5px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
              Entrega estimada
            </p>
            <p>{formatDate(order.estimatedDeliveryDate)}</p>
          </div>
        </section>

        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-line-strong bg-brand-soft text-left text-[11.5px] tracking-[0.06em] text-ink-2 uppercase print:bg-transparent">
              <th className="px-2 py-2 font-semibold">Código</th>
              <th className="px-2 py-2 font-semibold">Descripción</th>
              <th className="px-2 py-2 text-right font-semibold">Cantidad</th>
              <th className="px-2 py-2 font-semibold">Und</th>
              <th className="px-2 py-2 text-right font-semibold">Precio unitario</th>
              <th className="px-2 py-2 text-right font-semibold">Valor</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.productId} className="border-b border-line">
                <td className="px-2 py-2 tabular-nums">{line.productCode}</td>
                <td className="px-2 py-2">{line.productName}</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatDecimal(line.quantity.quantity)}
                </td>
                <td className="px-2 py-2">{unitLabel(line.quantity.unit)}</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {line.price ? formatCop(line.price) : '—'}
                </td>
                <td className="px-2 py-2 text-right font-medium tabular-nums">
                  {line.amount === null ? '—' : formatCop(line.amount.toString())}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="px-2 pt-3 text-right font-semibold">
                Valor sin impuestos
              </td>
              <td className="px-2 pt-3 text-right text-[16px] font-bold tabular-nums">
                {formatCop(total.toString())}
              </td>
            </tr>
          </tfoot>
        </table>

        <section className="mt-6 grid gap-1 text-[12.5px] text-ink-2">
          <p>
            Precios de lista sin impuestos. Si se factura electrónicamente se suma el IVA del 19 %.
          </p>
          {order.notes ? <p>Observaciones: {order.notes}</p> : null}
        </section>

        <footer className="mt-16 grid grid-cols-2 gap-16 text-[12.5px]">
          <div className="border-t border-ink pt-2">
            <p className="font-semibold">{order.seller.name}</p>
            <p className="text-ink-2">Vendedor · NOW CLEANY S.A.S.</p>
          </div>
          <div className="border-t border-ink pt-2">
            <p className="font-semibold">Aceptación del cliente</p>
            <p className="text-ink-2">Nombre, firma y fecha</p>
          </div>
        </footer>
      </article>
    </div>
  );
}
