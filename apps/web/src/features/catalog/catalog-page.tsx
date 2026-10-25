import { BookOpen, Calculator, FlaskConical, Search } from 'lucide-react';
import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { useActiveFormula, useFormulaHistory, useProducts } from '../../api/hooks';
import type { Product, Requirements } from '../../api/types';
import { DataTable } from '../../components/data-table';
import { Dialog } from '../../components/dialog';
import { Qty } from '../../components/qty';
import { Chip } from '../../components/status';
import {
  Button,
  EmptyState,
  Input,
  PageHeader,
  Panel,
  QueryView,
  Segmented,
  Spinner,
} from '../../components/ui';
import { formatDate, formatDecimal, parseDecimalInput, unitLabel } from '../../lib/format';

const TYPES = [
  { value: '', label: 'Todos' },
  { value: 'FINISHED_GOOD', label: 'Terminados' },
  { value: 'BULK', label: 'Granel' },
  { value: 'RAW_MATERIAL', label: 'Materias primas' },
] as const;

export function CatalogPage() {
  const [type, setType] = useState<(typeof TYPES)[number]['value']>('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Product | null>(null);
  const products = useProducts({ type: type || undefined, q: search.trim() || undefined });

  return (
    <>
      <PageHeader
        title="Catálogo"
        description="Materias primas, graneles y productos terminados, con la fórmula vigente de cada uno."
      />
      <Panel flush>
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 md:flex-row md:items-center md:justify-between">
          <Segmented label="Tipo" value={type} onChange={setType} options={TYPES} />
          <label className="relative block md:w-72">
            <span className="sr-only">Buscar producto</span>
            <Search
              aria-hidden
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
            />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
              placeholder="Código o nombre"
              className="pl-9"
            />
          </label>
        </div>
        <QueryView query={products}>
          {(rows) => (
            <DataTable<Product>
              label="Productos"
              rows={rows}
              rowKey={(row) => row.id}
              onRowClick={setOpen}
              empty={<EmptyState icon={<BookOpen />} title="No hay productos con este filtro" />}
              columns={[
                {
                  key: 'name',
                  header: 'Producto',
                  render: (row) => (
                    <span>
                      <span className="font-medium">{row.name}</span>
                      <span className="block text-[12.5px] text-ink-3">{row.code}</span>
                    </span>
                  ),
                },
                { key: 'type', header: 'Tipo', render: (row) => row.typeLabel },
                { key: 'unit', header: 'Unidad', render: (row) => unitLabel(row.stockUnit) },
                {
                  key: 'batch',
                  header: 'Bache',
                  hideOnMobile: true,
                  render: (row) =>
                    row.batchCapacity ? (
                      <Qty value={row.batchCapacity} />
                    ) : (
                      <span className="text-ink-3">—</span>
                    ),
                },
                {
                  key: 'formula',
                  header: 'Fórmula',
                  render: (row) =>
                    row.type === 'RAW_MATERIAL' ? (
                      <span className="text-ink-3">No aplica</span>
                    ) : row.activeFormulaVersion ? (
                      <Chip
                        tone="good"
                        icon={FlaskConical}
                      >{`Vigente v${String(row.activeFormulaVersion)}`}</Chip>
                    ) : (
                      <Chip tone="warning" icon={FlaskConical}>
                        Sin fórmula vigente
                      </Chip>
                    ),
                },
                {
                  key: 'active',
                  header: 'Estado',
                  hideOnMobile: true,
                  render: (row) =>
                    row.active ? 'Activo' : <span className="text-ink-3">Desactivado</span>,
                },
              ]}
            />
          )}
        </QueryView>
      </Panel>
      <ProductDialog
        product={open}
        onClose={() => {
          setOpen(null);
        }}
      />
    </>
  );
}

function ProductDialog({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const hasFormula = Boolean(
    product && product.type !== 'RAW_MATERIAL' && product.activeFormulaVersion,
  );
  const formula = useActiveFormula(hasFormula ? product?.id : undefined);
  const history = useFormulaHistory(
    product && product.type !== 'RAW_MATERIAL' ? product.id : undefined,
  );

  return (
    <Dialog
      open={Boolean(product)}
      onClose={onClose}
      variant="side"
      title={product?.name ?? 'Producto'}
      description={
        product
          ? `${product.code} · ${product.typeLabel} · se maneja en ${unitLabel(product.stockUnit)}`
          : undefined
      }
    >
      {!product ? null : product.type === 'RAW_MATERIAL' ? (
        <p className="text-sm text-ink-2">
          Las materias primas no tienen fórmula: se compran y se consumen al producir.
        </p>
      ) : !hasFormula ? (
        <EmptyState
          icon={<FlaskConical />}
          title="Sin fórmula vigente"
          description="Sin fórmula publicada no se pueden calcular sus necesidades de producción ni de compra."
        />
      ) : formula.isPending || !formula.data ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-6">
          <section>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">Fórmula vigente v{formula.data.version}</h3>
              <p className="text-[13px] text-ink-3">
                Rinde {formatDecimal(formula.data.batchYield.quantity)}{' '}
                {unitLabel(formula.data.batchYield.unit)} por bache
              </p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[12.5px] text-ink-2">
                  <th className="py-2 font-medium">Componente</th>
                  <th className="py-2 text-right font-medium">Por bache</th>
                  <th className="py-2 text-right font-medium">Merma</th>
                </tr>
              </thead>
              <tbody>
                {formula.data.lines.map((line) => (
                  <tr key={line.componentId} className="border-b border-line last:border-0">
                    <td className="py-2 pr-2">
                      {line.componentName}
                      <span className="block text-[12px] text-ink-3">
                        {line.componentCode} · {line.componentTypeLabel}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <Qty value={line.quantity} />
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {line.wasteBps === 0 ? (
                        <span className="text-ink-3">—</span>
                      ) : (
                        `${formatDecimal(String(line.wasteBps / 100))} %`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[13px] text-ink-3">
              Publicada el {formatDate(formula.data.publishedAt)} por{' '}
              {formula.data.publishedBy?.name ?? '—'} · definida por {formula.data.createdBy.name}
            </p>
          </section>

          <RequirementsCalculator product={product} />

          {history.data && history.data.length > 1 ? (
            <section>
              <h3 className="mb-2 text-sm font-semibold">Versiones</h3>
              <ul className="flex flex-col gap-1.5 text-sm">
                {history.data.map((version) => (
                  <li key={version.id} className="flex justify-between gap-3">
                    <span>
                      v{version.version}{' '}
                      <span className="text-ink-3">
                        ·{' '}
                        {version.status === 'ACTIVE'
                          ? 'vigente'
                          : version.status === 'DRAFT'
                            ? 'borrador'
                            : 'retirada'}
                      </span>
                    </span>
                    <span className="text-ink-3">
                      {formatDate(version.publishedAt ?? version.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}

function RequirementsCalculator({ product }: { product: Product }) {
  const [quantity, setQuantity] = useState('');
  const [result, setResult] = useState<Requirements | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const parsed = parseDecimalInput(quantity);

  const calculate = async () => {
    if (!parsed) return;
    setLoading(true);
    setError(null);
    try {
      setResult(
        await api.post<Requirements>(`/v1/products/${product.id}/requirements`, {
          quantity: parsed,
          expand: true,
        }),
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-lg border border-line p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Calculator aria-hidden className="size-4 text-ink-3" />
        ¿Qué se necesita para fabricar…?
      </h3>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void calculate();
        }}
      >
        <label className="flex-1">
          <span className="sr-only">Cantidad en {unitLabel(product.stockUnit)}</span>
          <Input
            inputMode="decimal"
            value={quantity}
            placeholder={`Cantidad en ${unitLabel(product.stockUnit)}`}
            onChange={(event) => {
              setQuantity(event.target.value);
            }}
          />
        </label>
        <Button type="submit" variant="secondary" loading={loading} disabled={!parsed}>
          Calcular
        </Button>
      </form>
      {error ? <p className="mt-2 text-sm text-critical">{error}</p> : null}
      {result ? (
        <div className="mt-4">
          <p className="mb-2 text-[13px] text-ink-2">
            Para <Qty value={result.quantity} /> hasta materias primas (redondeado hacia arriba):
          </p>
          <ul className="flex flex-col gap-1.5 text-sm">
            {(result.rawMaterials ?? result.components).map((line) => (
              <li key={line.productId} className="flex justify-between gap-3">
                <span>{line.name}</span>
                <Qty value={line.quantity} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
