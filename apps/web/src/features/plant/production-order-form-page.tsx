import { useQuery } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api, errorMessage } from '../../api/client';
import { useAction, useProductionNeeds, useProducts, useStockStatus } from '../../api/hooks';
import type { ProductionOrder, Requirements } from '../../api/types';
import { useProfile } from '../../auth/session';
import {
  DocumentScreen,
  DocumentSection,
  DocumentToolbar,
  DraftBanner,
  HeaderField,
  HeaderGrid,
  type LookupItem,
  LookupField,
  useDraft,
  useWorkTab,
} from '../../components/erp';
import { EntityLink } from '../../components/links';
import { cn } from '../../components/ui';
import {
  formatDate,
  formatDecimal,
  isZero,
  parseDecimalInput,
  roundUpDecimal,
  todayIso,
  unitLabel,
} from '../../lib/format';
import {
  DocumentNotice,
  GRID_HEAD,
  GRID_TD,
  GRID_TH,
  INPUT,
  multiplyDecimal,
  SELECT,
  TEXTAREA,
} from '../inventory/erp-kit';
import { compareDecimals, subtractDecimals } from './decimal';

interface Form {
  productId: string;
  mode: 'quantity' | 'batches';
  quantity: string;
  batches: string;
  scheduledDate: string;
  notes: string;
}

const EMPTY: Form = {
  productId: '',
  mode: 'quantity',
  quantity: '',
  batches: '',
  scheduledDate: todayIso(1),
  notes: '',
};

/**
 * New production order as one document: product (F2), quantity or batches, scheduled date and notes,
 * with the read-only explosion of what the active formula consumes against today's stock.
 */
export function ProductionOrderFormPage() {
  useWorkTab('Nueva orden de producción');
  const navigate = useNavigate();
  const profile = useProfile();
  const [params] = useSearchParams();
  const products = useProducts({ active: true });
  const needs = useProductionNeeds();
  const stock = useStockStatus();
  const [form, setForm] = useState<Form>(() => ({
    ...EMPTY,
    productId: params.get('producto') ?? '',
    quantity: params.get('cantidad') ? formatDecimal(params.get('cantidad') ?? '') : '',
  }));
  const [touched, setTouched] = useState(false);
  const draft = useDraft('production-order.new', form, {
    isEmpty: (value) => !value.productId && !value.quantity && !value.notes,
  });
  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const makeable = useMemo(
    () =>
      (products.data ?? []).filter(
        (product) => product.type === 'BULK' || product.type === 'FINISHED_GOOD',
      ),
    [products.data],
  );
  const items = useMemo<LookupItem[]>(
    () =>
      makeable.map((product) => ({
        id: product.id,
        code: product.code,
        label: product.name,
        detail: `${product.typeLabel}${product.activeFormulaVersion ? '' : ' · sin fórmula vigente'}`,
      })),
    [makeable],
  );
  const product = makeable.find((item) => item.id === form.productId);
  const isBulk = product?.type === 'BULK';
  const capacity = isBulk ? product.batchCapacity : null;
  const byBatches = form.mode === 'batches' && capacity !== null;
  const batches = byBatches ? Number.parseInt(form.batches, 10) : NaN;
  const quantity = byBatches
    ? Number.isInteger(batches) && batches > 0
      ? multiplyDecimal(capacity.quantity, batches)
      : null
    : parseDecimalInput(form.quantity);
  const unit = product ? unitLabel(product.stockUnit) : '';
  const need = product
    ? isBulk
      ? needs.data?.bulk.find((row) => row.product.id === product.id)
      : needs.data?.packaging.find((row) => row.product.id === product.id)
    : undefined;

  // The explosion follows what is typed, a moment after the user stops typing.
  const [asked, setAsked] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAsked(quantity && compareDecimals(quantity, '0') > 0 ? quantity : null);
    }, 350);
    return () => {
      window.clearTimeout(timer);
    };
  }, [quantity]);
  const explosion = useQuery({
    queryKey: ['requirements', product?.id, asked],
    queryFn: () =>
      api.post<Requirements>(`/v1/products/${product?.id ?? ''}/requirements`, {
        quantity: asked ?? '0',
      }),
    enabled: Boolean(product?.activeFormulaVersion) && asked !== null,
    retry: false,
  });
  const onHand = useMemo(
    () => new Map((stock.data ?? []).map((row) => [row.productId, row.onHand])),
    [stock.data],
  );

  const errors = {
    product: !product
      ? 'Elige el producto a fabricar (F2 para buscar).'
      : !product.activeFormulaVersion
        ? `${product.code} no tiene fórmula vigente: no se puede producir.`
        : undefined,
    quantity:
      quantity === null || compareDecimals(quantity, '0') <= 0
        ? byBatches
          ? 'Escribe cuántos baches (número entero).'
          : `Escribe la cantidad a producir${unit ? ` en ${unit}` : ''}.`
        : undefined,
    date: form.scheduledDate ? undefined : 'Indica la fecha programada.',
  };
  const valid = !errors.product && !errors.quantity && !errors.date;

  const create = useAction(
    () =>
      api.post<ProductionOrder>('/v1/production-orders', {
        productId: form.productId,
        quantity: quantity ?? '0',
        scheduledDate: form.scheduledDate,
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      }),
    { success: (order) => `${order.label} programada para el ${formatDate(order.scheduledDate)}` },
  );
  const save = () => {
    setTouched(true);
    if (!valid || create.isPending) return;
    create.mutate(undefined, {
      onSuccess: (order) => {
        draft.clear();
        void navigate(`/planta/ordenes/${order.id}`, { replace: true });
      },
    });
  };

  const fieldError = (message: string | undefined) =>
    touched && message ? (
      <span className="mt-1 block text-[12px] text-critical">{message}</span>
    ) : null;

  return (
    <>
      {draft.pending ? (
        <DraftBanner
          savedAt={draft.pending.savedAt}
          onRestore={() => {
            const restored = draft.restore();
            if (restored) setForm(restored);
          }}
          onDiscard={draft.discard}
        />
      ) : null}
      <DocumentScreen
        kind={
          product
            ? isBulk
              ? 'Orden de producción de granel'
              : 'Orden de envasado'
            : 'Orden de producción'
        }
        number="Nueva"
        toolbar={
          <DocumentToolbar
            actions={[
              {
                label: 'Guardar',
                icon: Save,
                shortcut: 'Ctrl+S',
                primary: true,
                loading: create.isPending,
                onClick: save,
              },
            ]}
            closeTo="/planta/produccion"
          />
        }
        notes={
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-ink-3">Observaciones</span>
            <textarea
              className={TEXTAREA}
              value={form.notes}
              maxLength={500}
              placeholder="Tanque, turno, instrucciones para el operario…"
              onChange={(event) => {
                set('notes', event.target.value);
              }}
            />
          </label>
        }
        totals={[
          {
            label: 'Cantidad a producir',
            value: quantity ? `${formatDecimal(quantity)} ${unit}` : '—',
            strong: true,
          },
          ...(byBatches
            ? [
                {
                  label: 'Baches',
                  value: `${Number.isInteger(batches) && batches > 0 ? String(batches) : '—'} × ${formatDecimal(capacity.quantity)} ${unitLabel(capacity.unit)}`,
                },
              ]
            : []),
        ]}
        signatures={[{ label: 'Elaboró', name: profile.fullName, at: formatDate(todayIso()) }]}
      >
        {need && !isZero(need.pendingToSchedule.quantity) ? (
          <DocumentNotice tone="info">
            Para los pedidos confirmados falta programar{' '}
            <strong>
              {formatDecimal(roundUpDecimal(need.pendingToSchedule.quantity))} {unit}
            </strong>
            ; hoy se puede hacer {formatDecimal(roundUpDecimal(need.canMakeNow.quantity))} {unit}
            {need.limitingMaterial &&
            compareDecimals(need.canMakeNow.quantity, need.pendingToSchedule.quantity) < 0
              ? ` (lo limita ${need.limitingMaterial.name})`
              : ''}
            .
          </DocumentNotice>
        ) : null}
        <HeaderGrid>
          <HeaderField label="Producto" span={2} htmlFor="po-product">
            <LookupField
              id="po-product"
              title="Buscar granel o producto terminado"
              items={items}
              value={form.productId || null}
              placeholder="Buscar producto"
              onChange={(id) => {
                setForm((current) => ({
                  ...current,
                  productId: id,
                  mode: 'quantity',
                  batches: '',
                }));
              }}
            />
            {fieldError(errors.product)}
          </HeaderField>
          <HeaderField label="Tipo de orden">
            {product ? (
              isBulk ? (
                'Producción de granel'
              ) : (
                'Envasado'
              )
            ) : (
              <span className="text-ink-3">—</span>
            )}
          </HeaderField>
          <HeaderField label="Fecha de elaboración">{formatDate(todayIso())}</HeaderField>
          {capacity ? (
            <HeaderField label="Producir por" htmlFor="po-mode">
              <select
                id="po-mode"
                className={cn(SELECT, 'w-full')}
                value={form.mode}
                onChange={(event) => {
                  set('mode', event.target.value === 'batches' ? 'batches' : 'quantity');
                }}
              >
                <option value="quantity">Cantidad en {unit}</option>
                <option value="batches">
                  Baches de {formatDecimal(capacity.quantity)} {unitLabel(capacity.unit)}
                </option>
              </select>
            </HeaderField>
          ) : null}
          <HeaderField
            label={byBatches ? 'Número de baches' : `Cantidad${unit ? ` (${unit})` : ''}`}
            htmlFor="po-quantity"
          >
            <input
              id="po-quantity"
              className={cn(INPUT, 'text-right tabular-nums')}
              inputMode={byBatches ? 'numeric' : 'decimal'}
              value={byBatches ? form.batches : form.quantity}
              aria-invalid={touched && errors.quantity ? true : undefined}
              onChange={(event) => {
                if (byBatches) set('batches', event.target.value.replace(/\D/g, ''));
                else set('quantity', event.target.value);
              }}
              onBlur={() => {
                setTouched(true);
              }}
            />
            {fieldError(errors.quantity)}
          </HeaderField>
          <HeaderField label="Fecha programada" htmlFor="po-date">
            <input
              id="po-date"
              type="date"
              className={INPUT}
              value={form.scheduledDate}
              min={todayIso()}
              onChange={(event) => {
                set('scheduledDate', event.target.value);
              }}
            />
            {fieldError(errors.date)}
          </HeaderField>
          <HeaderField label="Fórmula">
            {product ? (
              product.activeFormulaVersion ? (
                <EntityLink to="product" id={product.id}>
                  Vigente v{product.activeFormulaVersion}
                </EntityLink>
              ) : (
                <span className="text-critical">Sin fórmula vigente</span>
              )
            ) : (
              <span className="text-ink-3">—</span>
            )}
          </HeaderField>
        </HeaderGrid>

        <DocumentSection
          title={
            product?.activeFormulaVersion
              ? `Insumos que consume (fórmula vigente v${String(product.activeFormulaVersion)})`
              : 'Insumos que consume'
          }
          flush
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-[13.5px]">
              <thead>
                <tr className={GRID_HEAD}>
                  <th className={cn(GRID_TH, 'w-10 text-center')}>#</th>
                  <th className={cn(GRID_TH, 'w-28')}>Código</th>
                  <th className={GRID_TH}>Insumo</th>
                  <th className={GRID_TH}>Tipo</th>
                  <th className={cn(GRID_TH, 'w-12')}>Und</th>
                  <th className={cn(GRID_TH, 'text-right')}>Requerido</th>
                  <th className={cn(GRID_TH, 'text-right')}>En bodega</th>
                  <th className={cn(GRID_TH, 'text-right')}>Falta</th>
                </tr>
              </thead>
              <tbody>
                {!product?.activeFormulaVersion || asked === null ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-ink-3">
                      Elige el producto y la cantidad para ver los insumos.
                    </td>
                  </tr>
                ) : explosion.isPending ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-ink-3">
                      Calculando…
                    </td>
                  </tr>
                ) : explosion.error ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-critical">
                      {errorMessage(explosion.error)}
                    </td>
                  </tr>
                ) : (
                  explosion.data.components.map((line, index) => {
                    const stockQty = onHand.get(line.productId);
                    const short = stockQty
                      ? subtractDecimals(
                          line.quantity.quantity,
                          stockQty.quantity.startsWith('-') ? '0' : stockQty.quantity,
                        )
                      : line.quantity.quantity;
                    return (
                      <tr key={line.productId} className="border-b border-line">
                        <td className={cn(GRID_TD, 'text-center text-ink-3 tabular-nums')}>
                          {index + 1}
                        </td>
                        <td className={cn(GRID_TD, 'tabular-nums')}>{line.code}</td>
                        <td className={GRID_TD}>
                          <EntityLink to="product" id={line.productId}>
                            {line.name}
                          </EntityLink>
                        </td>
                        <td className={cn(GRID_TD, 'text-ink-2')}>{line.typeLabel}</td>
                        <td className={cn(GRID_TD, 'text-ink-2')}>
                          {unitLabel(line.quantity.unit)}
                        </td>
                        <td className={cn(GRID_TD, 'text-right font-medium tabular-nums')}>
                          {formatDecimal(roundUpDecimal(line.quantity.quantity))}
                        </td>
                        <td className={cn(GRID_TD, 'text-right tabular-nums')}>
                          {stockQty ? formatDecimal(roundUpDecimal(stockQty.quantity)) : '0'}
                        </td>
                        <td
                          className={cn(
                            GRID_TD,
                            'text-right tabular-nums',
                            isZero(short) ? 'text-ink-3' : 'font-semibold text-critical',
                          )}
                        >
                          {isZero(short) ? '—' : formatDecimal(roundUpDecimal(short))}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </DocumentSection>
      </DocumentScreen>
    </>
  );
}
