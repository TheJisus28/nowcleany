import { ChevronLeft, ChevronRight, FilePlus2, History, Printer, Save, Sigma } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../api/client';
import { useAction, useMonthlyPurchase } from '../../api/hooks';
import type { MonthlyPurchase } from '../../api/types';
import { useSession } from '../../auth/session';
import {
  DocumentToolbar,
  FilterBar,
  FilterField,
  type QueryColumn,
  QueryGrid,
  useWorkTab,
} from '../../components/erp';
import { EntityLink } from '../../components/links';
import { Qty } from '../../components/qty';
import { cn, QueryView } from '../../components/ui';
import {
  formatCop,
  formatDecimal,
  isZero,
  monthLabel,
  parseDecimalInput,
  plural,
  roundUpDecimal,
  unitLabel,
} from '../../lib/format';
import {
  csvQty,
  INPUT,
  QtyTotal,
  QueryPanel,
  ScreenTitle,
  useUrlFilters,
} from '../inventory/erp-kit';
import { newOrderPath } from './purchasing-page';

type PlanRow = MonthlyPurchase['products'][number];
type BuyRow = MonthlyPurchase['purchases'][number];

const FILTERS = { mes: '' };

/** "2026-11" ± n months. */
function shiftMonth(month: string, delta: number): string {
  const [year = 2026, value = 1] = month.split('-').map(Number);
  return new Date(Date.UTC(year, value - 1 + delta, 15)).toISOString().slice(0, 7);
}

/** "2026-10" → "octubre". */
function monthName(month: string): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString('es-CO', {
    month: 'long',
    timeZone: 'UTC',
  });
}

const display = (quantity: string) => formatDecimal(roundUpDecimal(quantity));

/**
 * Purchasing's month as a report-form: how much of each product we expect to sell (last month's sales
 * to start, the buyer adjusts it) and what that means in raw materials and resale goods to buy.
 */
export function MonthlyPlanPage() {
  const filters = useUrlFilters(FILTERS);
  const plan = useMonthlyPurchase(filters.applied.mes || undefined);
  const month = filters.applied.mes || plan.data?.month;
  useWorkTab(month ? `Plan de compras · ${monthName(month)}` : 'Plan de compras del mes');

  const monthFilter = month ? (
    <FilterBar>
      <FilterField label="Mes">
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              filters.applyNow('mes', shiftMonth(month, -1));
            }}
            className="inline-flex size-8 items-center justify-center rounded-[5px] border border-line-strong bg-surface text-ink-2 hover:bg-surface-2"
            title="Mes anterior"
          >
            <ChevronLeft aria-hidden className="size-4" />
            <span className="sr-only">Mes anterior</span>
          </button>
          <input
            type="month"
            className={cn(INPUT, 'w-44')}
            value={month}
            onChange={(event) => {
              if (event.target.value) filters.applyNow('mes', event.target.value);
            }}
          />
          <button
            type="button"
            onClick={() => {
              filters.applyNow('mes', shiftMonth(month, 1));
            }}
            className="inline-flex size-8 items-center justify-center rounded-[5px] border border-line-strong bg-surface text-ink-2 hover:bg-surface-2"
            title="Mes siguiente"
          >
            <ChevronRight aria-hidden className="size-4" />
            <span className="sr-only">Mes siguiente</span>
          </button>
        </span>
      </FilterField>
    </FilterBar>
  ) : null;

  return (
    <QueryView query={plan}>
      {(data) => <MonthView key={data.month} data={data} monthFilter={monthFilter} />}
    </QueryView>
  );
}

function MonthView({ data, monthFilter }: { data: MonthlyPurchase; monthFilter: ReactNode }) {
  const navigate = useNavigate();
  const { can } = useSession();
  const canWrite = can('purchasing:write');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const last = monthName(data.basedOn);

  const valueOf = (row: PlanRow) => drafts[row.product.id] ?? display(row.plan.quantity);
  const parsedOf = (row: PlanRow) => {
    const raw = valueOf(row);
    return raw.trim() === '' ? '0' : parseDecimalInput(raw);
  };
  const edited = (row: PlanRow) => {
    const parsed = parsedOf(row);
    return (
      row.product.id in drafts && parsed !== null && parsed !== roundUpDecimal(row.plan.quantity)
    );
  };
  const invalid = data.products.some((row) => parsedOf(row) === null);
  const dirty = data.products.some(edited);
  const suggestions = data.products.filter((row) => row.planSetBy === null).length;
  const fill = (pick: (row: PlanRow) => string) => {
    setDrafts(Object.fromEntries(data.products.map((row) => [row.product.id, display(pick(row))])));
  };
  const save = useAction(
    () =>
      api.put(`/v1/purchase-plans/${data.month}`, {
        lines: data.products.map((row) => ({
          productId: row.product.id,
          quantity: parsedOf(row) ?? '0',
        })),
      }),
    { success: `Plan de ${monthLabel(data.month)} guardado: la compra sugerida ya se recalculó` },
  );
  const canSave = canWrite && !invalid && (dirty || suggestions > 0) && !save.isPending;
  const toBuy = useMemo(
    () => data.purchases.filter((row) => !isZero(row.suggested.quantity)),
    [data.purchases],
  );
  const chosen = toBuy.filter((row) => selected.has(row.product.id));
  const createOrder = () => {
    void navigate(
      newOrderPath(
        chosen.map((row) => ({
          productId: row.product.id,
          quantity: roundUpDecimal(row.suggested.quantity),
          unitCost: row.unitCost,
        })),
      ),
    );
  };

  const planColumns: QueryColumn<PlanRow>[] = [
    {
      key: 'code',
      header: 'Código',
      sort: (row) => row.product.code,
      csv: (row) => row.product.code,
      render: (row) => <span className="tabular-nums">{row.product.code}</span>,
    },
    {
      key: 'product',
      header: 'Producto',
      sort: (row) => row.product.name,
      csv: (row) => row.product.name,
      render: (row) => (
        <EntityLink to="product" id={row.product.id}>
          {row.product.name}
        </EntityLink>
      ),
    },
    {
      key: 'type',
      header: 'Tipo',
      hideOnMobile: true,
      sort: (row) => row.typeLabel,
      csv: (row) => row.typeLabel,
      render: (row) => <span className="text-ink-2">{row.typeLabel}</span>,
    },
    {
      key: 'lastMonth',
      header: `Vendido en ${last}`,
      align: 'right',
      sort: (row) => Number(row.lastMonth.quantity),
      csv: (row) => csvQty(row.lastMonth),
      render: (row) => <Qty value={row.lastMonth} dimZero />,
      total: (rows) => <QtyTotal values={rows.map((row) => row.lastMonth)} />,
    },
    {
      key: 'average',
      header: 'Promedio 3 meses',
      align: 'right',
      sort: (row) => Number(row.average3.quantity),
      csv: (row) => csvQty(row.average3),
      render: (row) => <Qty value={row.average3} dimZero />,
      total: (rows) => <QtyTotal values={rows.map((row) => row.average3)} />,
    },
    {
      key: 'plan',
      header: 'Plan del mes',
      align: 'right',
      sort: (row) => Number(parsedOf(row) ?? '0'),
      csv: (row) => (parsedOf(row) ?? '').replace('.', ','),
      render: (row) =>
        canWrite ? (
          <span className="inline-flex items-center gap-1.5">
            <input
              aria-label={`Plan de ${row.product.name}`}
              aria-invalid={parsedOf(row) === null ? true : undefined}
              inputMode="decimal"
              data-plan-input
              value={valueOf(row)}
              className={cn(
                'h-7 w-28 rounded-[4px] border border-line-strong bg-surface px-2 text-right text-[13.5px] font-semibold tabular-nums focus:border-brand aria-invalid:border-critical',
                edited(row) && 'border-brand bg-brand-soft/50',
              )}
              onChange={(event) => {
                const value = event.target.value;
                setDrafts((current) => ({ ...current, [row.product.id]: value }));
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                const inputs = [
                  ...document.querySelectorAll<HTMLInputElement>('[data-plan-input]'),
                ];
                const next = inputs[inputs.indexOf(event.currentTarget) + 1];
                next?.focus();
                next?.select();
              }}
            />
            <span className="w-7 text-left text-[12px] text-ink-3">{unitLabel(row.plan.unit)}</span>
          </span>
        ) : (
          <Qty value={row.plan} emphasis />
        ),
      total: (rows) => (
        <QtyTotal
          values={rows.map((row) => ({ quantity: parsedOf(row) ?? '0', unit: row.plan.unit }))}
        />
      ),
    },
    {
      key: 'source',
      header: 'Origen',
      hideOnMobile: true,
      csv: (row) => (row.planSetBy ? `Fijado por ${row.planSetBy}` : 'Sugerencia'),
      render: (row) =>
        edited(row) ? (
          <span className="text-[12.5px] font-medium text-brand">Sin guardar</span>
        ) : row.planSetBy ? (
          <span className="text-[12.5px] text-ink-2">Fijado por {row.planSetBy}</span>
        ) : (
          <span className="text-[12.5px] text-ink-3">Sugerencia</span>
        ),
    },
  ];

  const buyColumns: QueryColumn<BuyRow>[] = [
    {
      key: 'code',
      header: 'Código',
      sort: (row) => row.product.code,
      csv: (row) => row.product.code,
      render: (row) => <span className="tabular-nums">{row.product.code}</span>,
    },
    {
      key: 'product',
      header: 'Insumo o mercancía',
      sort: (row) => row.product.name,
      csv: (row) => row.product.name,
      render: (row) => (
        <EntityLink to="product" id={row.product.id}>
          {row.product.name}
        </EntityLink>
      ),
    },
    {
      key: 'type',
      header: 'Tipo',
      hideOnMobile: true,
      csv: (row) => row.typeLabel,
      render: (row) => <span className="text-ink-2">{row.typeLabel}</span>,
    },
    {
      key: 'need',
      header: 'Necesidad del mes',
      align: 'right',
      csv: (row) => csvQty(row.monthNeed),
      render: (row) => <Qty value={row.monthNeed} dimZero />,
    },
    {
      key: 'onHand',
      header: 'En bodega',
      align: 'right',
      csv: (row) => csvQty(row.onHand),
      render: (row) => <Qty value={row.onHand} dimZero />,
    },
    {
      key: 'onOrder',
      header: 'En tránsito',
      align: 'right',
      csv: (row) => csvQty(row.onOrder),
      render: (row) => <Qty value={row.onOrder} dimZero />,
    },
    {
      key: 'urgent',
      header: 'Urgente',
      align: 'right',
      sort: (row) => Number(row.urgent.quantity),
      csv: (row) => csvQty(row.urgent),
      render: (row) =>
        isZero(row.urgent.quantity) ? (
          <span className="text-ink-3">—</span>
        ) : (
          <Qty value={row.urgent} emphasis className="text-critical" />
        ),
    },
    {
      key: 'suggested',
      header: 'Sugerido',
      align: 'right',
      sort: (row) => Number(row.suggested.quantity),
      csv: (row) => csvQty(row.suggested),
      render: (row) => <Qty value={row.suggested} emphasis dimZero />,
    },
    {
      key: 'unitCost',
      header: 'Costo unit.',
      align: 'right',
      hideOnMobile: true,
      csv: (row) => row.unitCost ?? '',
      render: (row) =>
        row.unitCost ? formatCop(row.unitCost) : <span className="text-ink-3">Sin costo</span>,
    },
    {
      key: 'cost',
      header: 'Costo estimado',
      align: 'right',
      sort: (row) => Number(row.estimatedCost),
      csv: (row) => row.estimatedCost,
      render: (row) =>
        isZero(row.estimatedCost) ? (
          <span className="text-ink-3">—</span>
        ) : (
          formatCop(row.estimatedCost)
        ),
      total: (rows) =>
        formatCop(rows.reduce((sum, row) => sum + BigInt(row.estimatedCost), 0n).toString()),
    },
    {
      key: 'usedBy',
      header: 'Para',
      hideOnMobile: true,
      csv: (row) => row.usedBy.map((product) => product.code).join(', '),
      render: (row) =>
        row.usedBy.length === 0 ? (
          <span className="text-ink-3">{row.type === 'RESALE' ? 'Reventa' : '—'}</span>
        ) : (
          <span className="flex flex-wrap gap-x-2 text-[12.5px] text-ink-2">
            {row.usedBy.slice(0, 4).map((product) => (
              <EntityLink key={product.id} to="product" id={product.id}>
                <span title={product.name}>{product.code}</span>
              </EntityLink>
            ))}
            {row.usedBy.length > 4 ? (
              <span className="text-ink-3">+{row.usedBy.length - 4}</span>
            ) : null}
          </span>
        ),
    },
  ];

  return (
    <>
      <DocumentToolbar
        actions={[
          {
            label:
              chosen.length > 0
                ? `Crear orden de compra (${String(chosen.length)})`
                : 'Crear orden de compra',
            icon: FilePlus2,
            shortcut: 'F9',
            primary: true,
            hidden: !canWrite,
            disabled: chosen.length === 0,
            title: 'Marca en «Qué comprar» los productos a pedir',
            onClick: createOrder,
          },
          {
            label: 'Guardar plan',
            icon: Save,
            shortcut: 'Ctrl+S',
            hidden: !canWrite,
            disabled: !canSave,
            loading: save.isPending,
            onClick: () => {
              if (canSave)
                save.mutate(undefined, {
                  onSuccess: () => {
                    setDrafts({});
                  },
                });
            },
          },
          {
            label: `Usar lo de ${last}`,
            icon: History,
            hidden: !canWrite,
            onClick: () => {
              fill((row) => row.lastMonth.quantity);
            },
          },
          {
            label: 'Usar el promedio',
            icon: Sigma,
            hidden: !canWrite,
            onClick: () => {
              fill((row) => row.average3.quantity);
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
        ]}
      />
      <ScreenTitle
        title={`Plan de compras de ${monthLabel(data.month)}`}
        subtitle={`Cuánto esperamos vender (de entrada, lo vendido en ${last}) y, con las fórmulas, qué insumos y mercancía comprar. Sin stock de seguridad: solo lo necesario.`}
      >
        <span className="text-[13px] text-ink-2">
          Costo estimado del mes{' '}
          <strong className="ml-1 text-[16px] text-ink tabular-nums">
            {formatCop(data.estimatedCost)}
          </strong>{' '}
          <span className="text-ink-3">antes de IVA</span>
        </span>
      </ScreenTitle>

      <QueryPanel
        title="Cuánto vamos a vender"
        description={
          canWrite
            ? `Ajusta la columna «Plan del mes» (Enter pasa a la siguiente) y guarda con Ctrl+S.${suggestions > 0 ? ` ${plural(suggestions, 'producto sigue', 'productos siguen')} con la sugerencia automática.` : ''}`
            : 'Plan de ventas del mes.'
        }
        filters={monthFilter}
      >
        <QueryGrid<PlanRow>
          title={`Plan de ventas ${data.month}`}
          exportName={`plan-ventas-${data.month}`}
          columns={planColumns}
          rows={data.products}
          rowKey={(row) => row.product.id}
          pageSize={100}
          empty="No hay productos activos para vender."
        />
      </QueryPanel>

      <QueryPanel
        title="Qué comprar"
        description="El plan convertido a insumos con las fórmulas, menos lo que hay en bodega y lo que viene en camino. Urgente es lo que ya falta para pedidos vendidos. Marca y pulsa F9."
      >
        <QueryGrid<BuyRow>
          title={`Qué comprar ${data.month}`}
          exportName={`que-comprar-${data.month}`}
          columns={buyColumns}
          rows={data.purchases}
          rowKey={(row) => row.product.id}
          selectable={canWrite}
          selected={selected}
          onSelectedChange={setSelected}
          isSelectable={(row) => !isZero(row.suggested.quantity)}
          rowClassName={(row) => (isZero(row.suggested.quantity) ? 'text-ink-2' : undefined)}
          initialSort={{ key: 'cost', direction: 'desc' }}
          pageSize={100}
          empty="No hay nada por pedir este mes."
        />
      </QueryPanel>
    </>
  );
}
