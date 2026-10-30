import {
  Calculator,
  CircleDashed,
  FlaskConical,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { useAction, useActiveFormula, useDraftFormula, useFormulaHistory } from '../../api/hooks';
import type { Formula, Product, Requirements } from '../../api/types';
import { useProfile, useSession } from '../../auth/session';
import { EntityLink } from '../../components/links';
import { Qty } from '../../components/qty';
import { Chip } from '../../components/status';
import { Button, EmptyState, Input, Panel, Spinner } from '../../components/ui';
import { formatDate, formatDecimal, parseDecimalInput, unitLabel } from '../../lib/format';
import { FormulaEditorDialog } from './formula-editor-dialog';

/**
 * How a bulk or finished good is made: the active version (what planning uses), the draft being
 * prepared and its publication (four eyes: whoever defined it does not publish it), and versions.
 */
export function FormulaSection({ product }: { product: Product }) {
  const { can } = useSession();
  const canDraft = can('formulas:draft');
  const active = useActiveFormula(product.activeFormulaVersion ? product.id : undefined);
  const draft = useDraftFormula(product.hasDraftFormula ? product.id : undefined);
  const [editing, setEditing] = useState<'draft' | 'new' | null>(null);

  const editor =
    editing === null ? null : (
      <FormulaEditorDialog
        product={product}
        base={editing === 'draft' ? draft.data : active.data}
        onClose={() => {
          setEditing(null);
        }}
      />
    );

  return (
    <>
      {product.hasDraftFormula ? (
        draft.data ? (
          <DraftPanel
            product={product}
            draft={draft.data}
            onEdit={() => {
              setEditing('draft');
            }}
          />
        ) : (
          <Spinner />
        )
      ) : null}

      {product.activeFormulaVersion ? (
        <Panel
          title={`Fórmula vigente v${String(product.activeFormulaVersion)}`}
          description={
            active.data
              ? `Rinde ${formatDecimal(active.data.batchYield.quantity)} ${unitLabel(active.data.batchYield.unit)} por bache`
              : undefined
          }
          actions={
            canDraft && !product.hasDraftFormula ? (
              <Button
                size="sm"
                variant="secondary"
                icon={<Plus className="size-3.5" />}
                onClick={() => {
                  setEditing('new');
                }}
              >
                Nueva versión
              </Button>
            ) : null
          }
        >
          {active.isPending || !active.data ? (
            <Spinner />
          ) : (
            <div className="flex flex-col gap-6">
              <div>
                <FormulaLines formula={active.data} />
                <p className="mt-2 text-[13px] text-ink-3">
                  Publicada el {formatDate(active.data.publishedAt)} por{' '}
                  {active.data.publishedBy?.name ?? '—'} · definida por {active.data.createdBy.name}
                </p>
              </div>
              <RequirementsCalculator product={product} />
              <Versions product={product} />
            </div>
          )}
        </Panel>
      ) : product.hasDraftFormula ? null : (
        <Panel title="Fórmula">
          <EmptyState
            icon={<FlaskConical />}
            title="Sin fórmula"
            description="Sin fórmula publicada no se pueden calcular sus necesidades de producción ni de compra."
            action={
              canDraft ? (
                <Button
                  icon={<Plus className="size-4" />}
                  onClick={() => {
                    setEditing('new');
                  }}
                >
                  Definir fórmula
                </Button>
              ) : undefined
            }
          />
        </Panel>
      )}
      {editor}
    </>
  );
}

function DraftPanel({
  product,
  draft,
  onEdit,
}: {
  product: Product;
  draft: Formula;
  onEdit: () => void;
}) {
  const { can } = useSession();
  const profile = useProfile();
  const canDraft = can('formulas:draft');
  const own = draft.createdBy.id === profile.id;
  const canPublish = can('formulas:publish') && (!own || can('formulas:publish-own'));

  const publish = useAction(() => api.post<Formula>(`/v1/formulas/${draft.id}/publish`), {
    success: (published) => `Fórmula v${String(published.version)} publicada: planeación ya la usa`,
  });
  const discard = useAction(() => api.delete(`/v1/products/${product.id}/draft-formula`), {
    success: 'Borrador descartado',
  });

  return (
    <Panel
      className="border-warning/60"
      title={
        <span className="flex flex-wrap items-center gap-2">
          Borrador v{draft.version}
          <Chip tone="warning" icon={CircleDashed}>
            Por publicar
          </Chip>
        </span>
      }
      description={`Definido por ${draft.createdBy.name} el ${formatDate(draft.createdAt)}. ${
        product.activeFormulaVersion
          ? `Planeación sigue usando la v${String(product.activeFormulaVersion)} hasta publicarlo.`
          : 'Hasta publicarlo, planeación no puede calcular este producto.'
      }`}
    >
      <FormulaLines formula={draft} />
      <p className="mt-2 text-[13px] text-ink-3">
        Rinde {formatDecimal(draft.batchYield.quantity)} {unitLabel(draft.batchYield.unit)} por
        bache{draft.notes ? ` · ${draft.notes}` : ''}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {canPublish ? (
          <Button
            icon={<Send className="size-4" />}
            loading={publish.isPending}
            onClick={() => {
              publish.mutate(undefined);
            }}
          >
            Publicar v{draft.version}
          </Button>
        ) : null}
        {canDraft ? (
          <>
            <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={onEdit}>
              Editar
            </Button>
            <Button
              variant="ghost"
              icon={<Trash2 className="size-4" />}
              loading={discard.isPending}
              onClick={() => {
                discard.mutate(undefined);
              }}
            >
              Descartar
            </Button>
          </>
        ) : null}
        {!canPublish ? (
          <p className="flex items-center gap-1.5 text-[13px] text-ink-3">
            <ShieldCheck aria-hidden className="size-4" />
            {own && can('formulas:publish')
              ? 'Tú la definiste: la publica otra persona (cuatro ojos).'
              : 'La publica el jefe técnico, después de revisarla.'}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}

function FormulaLines({ formula }: { formula: Formula }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line text-left text-[12.5px] text-ink-2">
          <th className="py-2 font-medium">Componente</th>
          <th className="py-2 text-right font-medium">Por bache</th>
        </tr>
      </thead>
      <tbody>
        {formula.lines.map((line) => (
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
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Versions({ product }: { product: Product }) {
  const history = useFormulaHistory(product.id);
  if (!history.data || history.data.length < 2) return null;
  return (
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
                    : 'retirada'}{' '}
                · {version.createdBy.name}
              </span>
            </span>
            <span className="text-ink-3">
              {formatDate(version.publishedAt ?? version.createdAt)}
            </span>
          </li>
        ))}
      </ul>
    </section>
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
