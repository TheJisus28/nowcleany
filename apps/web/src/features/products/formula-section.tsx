import { Calculator, FlaskConical } from 'lucide-react';
import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { useActiveFormula, useFormulaHistory } from '../../api/hooks';
import type { Product, Requirements } from '../../api/types';
import { EntityLink } from '../../components/links';
import { Qty } from '../../components/qty';
import { Button, EmptyState, Input, Panel, Spinner } from '../../components/ui';
import { formatDate, formatDecimal, parseDecimalInput, unitLabel } from '../../lib/format';

/** The active formula of a bulk or finished good, its versions and a requirements calculator. */
export function FormulaSection({ product }: { product: Product }) {
  const formula = useActiveFormula(product.activeFormulaVersion ? product.id : undefined);
  const history = useFormulaHistory(product.id);

  if (!product.activeFormulaVersion) {
    return (
      <Panel title="Fórmula">
        <EmptyState
          icon={<FlaskConical />}
          title="Sin fórmula vigente"
          description="Sin fórmula publicada no se pueden calcular sus necesidades de producción ni de compra."
        />
      </Panel>
    );
  }
  return (
    <Panel
      title={`Fórmula vigente v${String(product.activeFormulaVersion)}`}
      description={
        formula.data
          ? `Rinde ${formatDecimal(formula.data.batchYield.quantity)} ${unitLabel(formula.data.batchYield.unit)} por bache`
          : undefined
      }
    >
      {formula.isPending || !formula.data ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-6">
          <div>
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
                      <EntityLink to="product" id={line.componentId}>
                        {line.componentName}
                      </EntityLink>
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
          </div>

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
    </Panel>
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
                <EntityLink to="product" id={line.productId}>
                  {line.name}
                </EntityLink>
                <Qty value={line.quantity} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
