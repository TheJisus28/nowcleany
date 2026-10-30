import { Search, Trash2 } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { formatCop, parseDecimalInput, unitLabel } from '../../lib/format';
import { cn } from '../ui';
import { LookupDialog, type LookupItem } from './lookup';

export interface LineProduct {
  id: string;
  code: string;
  name: string;
  unit: string;
  /** Default price or cost per unit (pesos, integer string). */
  price?: string | null;
}

export interface LineRow {
  key: number;
  productId: string;
  quantity: string;
  /** Pesos per unit, integer string ('' = not set). */
  price: string;
}

let nextKey = 1;
export const newLine = (partial: Partial<Omit<LineRow, 'key'>> = {}): LineRow => ({
  key: nextKey++,
  productId: '',
  quantity: '',
  price: '',
  ...partial,
});

/** Pesos for a decimal quantity at an integer price, rounded half up ("2.5" × "4200" → "10500"). */
export function lineAmount(quantity: string, price: string): string {
  const qty = parseDecimalInput(quantity);
  if (qty === null || !/^\d+$/.test(price)) return '0';
  const [whole = '0', fraction = ''] = qty.split('.');
  const scale = 10n ** BigInt(fraction.length);
  const units = BigInt(whole) * scale + BigInt(fraction || '0');
  return ((units * BigInt(price) * 2n + scale) / (2n * scale)).toString();
}

export function linesTotal(rows: readonly LineRow[]): string {
  return rows
    .reduce((sum, row) => sum + BigInt(lineAmount(row.quantity, row.price)), 0n)
    .toString();
}

const CELL_INPUT =
  'h-8 w-full rounded-[4px] border border-transparent bg-transparent px-2 text-[13.5px] outline-none hover:border-line focus:border-brand focus:bg-surface';

/**
 * The line grid of a document, typed like a spreadsheet: write the code and press Enter (or F2 to search),
 * Enter moves to the quantity and then to the next line; a new line appears after the last one.
 * Ctrl+Supr removes the line.
 */
export function LineGrid({
  products,
  rows,
  onChange,
  price = 'none',
  priceLabel = 'Precio',
  quantityLabel = 'Cantidad',
  extra,
  extraLabel,
  errors,
  disabled = false,
}: {
  products: readonly LineProduct[];
  rows: readonly LineRow[];
  onChange: (rows: LineRow[]) => void;
  price?: 'none' | 'readonly' | 'editable';
  priceLabel?: string;
  quantityLabel?: string;
  /** One read-only column of context per line (stock, pending…). */
  extra?: (row: LineRow, product: LineProduct | undefined) => ReactNode;
  extraLabel?: string;
  errors?: Readonly<Record<number, string | undefined>>;
  disabled?: boolean;
}) {
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const lookupItems = useMemo<LookupItem[]>(
    () =>
      products.map((p) => ({
        id: p.id,
        code: p.code,
        label: p.name,
        detail: unitLabel(p.unit),
      })),
    [products],
  );
  const [codes, setCodes] = useState<Record<number, string>>({});
  const [lookup, setLookup] = useState<{ key: number; query: string } | null>(null);
  const [focus, setFocus] = useState<{ key: number; field: 'code' | 'qty' | 'price' } | null>(null);
  const inputs = useRef(new Map<string, HTMLInputElement>());

  useEffect(() => {
    if (!focus) return;
    inputs.current.get(`${String(focus.key)}:${focus.field}`)?.focus();
    inputs.current.get(`${String(focus.key)}:${focus.field}`)?.select();
    setFocus(null);
  }, [focus, rows]);

  const codeOf = (row: LineRow) => codes[row.key] ?? byId.get(row.productId)?.code ?? '';
  const update = (key: number, changes: Partial<LineRow>) => {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  };
  const pick = (key: number, product: LineProduct) => {
    setCodes((current) => ({ ...current, [key]: product.code }));
    const row = rows.find((item) => item.key === key);
    update(key, {
      productId: product.id,
      ...(price !== 'none' && !row?.price && product.price ? { price: product.price } : {}),
    });
    setFocus({ key, field: 'qty' });
  };
  const resolve = (row: LineRow) => {
    const text = codeOf(row).trim().toLowerCase();
    if (!text) return;
    const exact = products.find((p) => p.code.toLowerCase() === text);
    if (exact) pick(row.key, exact);
    else setLookup({ key: row.key, query: codeOf(row) });
  };
  const goNext = (row: LineRow) => {
    const index = rows.findIndex((item) => item.key === row.key);
    const following = rows[index + 1];
    if (following) {
      setFocus({ key: following.key, field: 'code' });
    } else if (row.productId) {
      const added = newLine();
      onChange([...rows, added]);
      setFocus({ key: added.key, field: 'code' });
    }
  };
  const remove = (key: number) => {
    if (rows.length === 1) {
      onChange([newLine()]);
      return;
    }
    onChange(rows.filter((row) => row.key !== key));
  };
  const register = (key: number, field: string) => (element: HTMLInputElement | null) => {
    if (element) inputs.current.set(`${String(key)}:${field}`, element);
    else inputs.current.delete(`${String(key)}:${field}`);
  };
  const onRowKey = (row: LineRow) => (event: React.KeyboardEvent) => {
    if (event.key === 'Delete' && event.ctrlKey) {
      event.preventDefault();
      remove(row.key);
    }
  };

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[13.5px]">
          <thead>
            <tr className="border-y border-line bg-surface-2/70 text-left text-[12px] text-ink-2">
              <th className="w-10 px-2 py-1.5 text-center font-medium">#</th>
              <th className="w-36 px-2 py-1.5 font-medium">Código</th>
              <th className="px-2 py-1.5 font-medium">Descripción</th>
              <th className="w-14 px-2 py-1.5 font-medium">Und</th>
              <th className="w-28 px-2 py-1.5 text-right font-medium">{quantityLabel}</th>
              {price !== 'none' ? (
                <>
                  <th className="w-28 px-2 py-1.5 text-right font-medium">{priceLabel}</th>
                  <th className="w-32 px-2 py-1.5 text-right font-medium">Valor</th>
                </>
              ) : null}
              {extra ? (
                <th className="w-32 px-2 py-1.5 text-right font-medium">{extraLabel}</th>
              ) : null}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const product = byId.get(row.productId);
              const error = errors?.[row.key];
              return (
                <tr
                  key={row.key}
                  onKeyDown={onRowKey(row)}
                  className={cn('border-b border-line', error && 'bg-critical-soft/40')}
                >
                  <td className="px-2 text-center text-ink-3 tabular-nums">{index + 1}</td>
                  <td className="px-1 py-0.5">
                    <div className="flex items-center">
                      <input
                        ref={register(row.key, 'code')}
                        value={codeOf(row)}
                        disabled={disabled}
                        aria-label={`Código de la línea ${String(index + 1)}`}
                        className={cn(CELL_INPUT, 'tabular-nums')}
                        onChange={(event) => {
                          setCodes((current) => ({ ...current, [row.key]: event.target.value }));
                          if (row.productId) update(row.key, { productId: '' });
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'F2') {
                            event.preventDefault();
                            setLookup({ key: row.key, query: codeOf(row) });
                          } else if (event.key === 'Enter') {
                            event.preventDefault();
                            if (row.productId) setFocus({ key: row.key, field: 'qty' });
                            else resolve(row);
                          }
                        }}
                        onBlur={() => {
                          if (!row.productId && codeOf(row).trim()) {
                            const exact = products.find(
                              (p) => p.code.toLowerCase() === codeOf(row).trim().toLowerCase(),
                            );
                            if (exact) pick(row.key, exact);
                          }
                        }}
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        disabled={disabled}
                        onClick={() => {
                          setLookup({ key: row.key, query: codeOf(row) });
                        }}
                        className="no-print ml-0.5 rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
                        title="Buscar producto (F2)"
                      >
                        <Search aria-hidden className="size-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-2">
                    {product ? (
                      product.name
                    ) : (
                      <span className="text-ink-3">
                        {error ?? 'Escribe el código y Enter, o F2'}
                      </span>
                    )}
                  </td>
                  <td className="px-2 text-ink-2">{product ? unitLabel(product.unit) : ''}</td>
                  <td className="px-1 py-0.5">
                    <input
                      ref={register(row.key, 'qty')}
                      value={row.quantity}
                      disabled={disabled || !row.productId}
                      inputMode="decimal"
                      aria-label={`Cantidad de la línea ${String(index + 1)}`}
                      className={cn(CELL_INPUT, 'text-right tabular-nums')}
                      onChange={(event) => {
                        update(row.key, { quantity: event.target.value });
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          if (price === 'editable') setFocus({ key: row.key, field: 'price' });
                          else goNext(row);
                        }
                      }}
                    />
                  </td>
                  {price !== 'none' ? (
                    <>
                      <td className="px-1 py-0.5 text-right tabular-nums">
                        {price === 'editable' ? (
                          <input
                            ref={register(row.key, 'price')}
                            value={row.price}
                            disabled={disabled || !row.productId}
                            inputMode="numeric"
                            aria-label={`${priceLabel} de la línea ${String(index + 1)}`}
                            className={cn(CELL_INPUT, 'text-right tabular-nums')}
                            onChange={(event) => {
                              update(row.key, { price: event.target.value.replace(/\D/g, '') });
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                goNext(row);
                              }
                            }}
                          />
                        ) : (
                          <span className="px-2">{row.price ? formatCop(row.price) : '—'}</span>
                        )}
                      </td>
                      <td className="px-2 text-right font-medium tabular-nums">
                        {row.productId && row.quantity
                          ? formatCop(lineAmount(row.quantity, row.price))
                          : ''}
                      </td>
                    </>
                  ) : null}
                  {extra ? (
                    <td className="px-2 text-right text-[12.5px] text-ink-2 tabular-nums">
                      {extra(row, product)}
                    </td>
                  ) : null}
                  <td className="px-1 text-center">
                    <button
                      type="button"
                      tabIndex={-1}
                      disabled={disabled}
                      onClick={() => {
                        remove(row.key);
                      }}
                      className="no-print rounded p-1 text-ink-3 hover:bg-critical-soft hover:text-critical"
                      title="Quitar la línea (Ctrl+Supr)"
                    >
                      <Trash2 aria-hidden className="size-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <LookupDialog
        open={lookup !== null}
        title="Buscar producto"
        items={lookupItems}
        initialQuery={lookup?.query ?? ''}
        onPick={(item) => {
          const product = byId.get(item.id);
          if (lookup && product) pick(lookup.key, product);
          setLookup(null);
        }}
        onClose={() => {
          setLookup(null);
        }}
      />
    </>
  );
}
