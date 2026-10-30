import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useAction, useProducts } from '../../api/hooks';
import type { Formula, Product, ProductType } from '../../api/types';
import { Dialog } from '../../components/dialog';
import { Button, Field, Input, Select } from '../../components/ui';
import { formatDecimal, parseDecimalInput, unitLabel } from '../../lib/format';

/** What each product type may be made of (the API enforces the same rule). */
const ALLOWED: Record<ProductType, readonly ProductType[]> = {
  RAW_MATERIAL: [],
  BULK: ['RAW_MATERIAL'],
  FINISHED_GOOD: ['BULK', 'RAW_MATERIAL'],
};

const GROUP_LABELS: Record<ProductType, string> = {
  BULK: 'Granel',
  RAW_MATERIAL: 'Materias primas',
  FINISHED_GOOD: 'Terminados',
};

interface LineDraft {
  key: number;
  componentId: string;
  quantity: string;
}

let lineKey = 1;

const toDraft = (formula: Formula | undefined): LineDraft[] =>
  formula && formula.lines.length > 0
    ? formula.lines.map((line) => ({
        key: lineKey++,
        componentId: line.componentId,
        quantity: formatDecimal(line.quantity.quantity),
      }))
    : [{ key: lineKey++, componentId: '', quantity: '' }];

/**
 * Edits the product's draft formula (starting from the draft, or from the active version for a new
 * one). Saving never changes what planning uses: only publishing does.
 */
export function FormulaEditorDialog({
  product,
  base,
  onClose,
}: {
  product: Product;
  base: Formula | undefined;
  onClose: () => void;
}) {
  const products = useProducts({ active: true });
  const allowed = ALLOWED[product.type];
  const [batchYield, setBatchYield] = useState(
    base
      ? formatDecimal(base.batchYield.quantity)
      : product.type === 'BULK' && product.batchCapacity
        ? formatDecimal(product.batchCapacity.quantity)
        : '1',
  );
  const [notes, setNotes] = useState(base?.status === 'DRAFT' ? (base.notes ?? '') : '');
  const [lines, setLines] = useState<LineDraft[]>(() => toDraft(base));

  const options = useMemo(
    () =>
      allowed.map((type) => ({
        type,
        items: (products.data ?? [])
          .filter((candidate) => candidate.type === type && candidate.id !== product.id)
          .sort((a, b) => a.code.localeCompare(b.code)),
      })),
    [allowed, products.data, product.id],
  );
  const byId = useMemo(
    () => new Map((products.data ?? []).map((candidate) => [candidate.id, candidate])),
    [products.data],
  );

  const parsedYield = parseDecimalInput(batchYield);
  const chosen = lines.map((line) => line.componentId).filter(Boolean);
  const duplicated = new Set(chosen.filter((id, index) => chosen.indexOf(id) !== index));
  const lineErrors = lines.map((line) => ({
    component: !line.componentId
      ? 'Elige un componente.'
      : duplicated.has(line.componentId)
        ? 'Ya está en la fórmula.'
        : undefined,
    quantity: Number(parseDecimalInput(line.quantity) ?? 0) > 0 ? undefined : 'Mayor que cero.',
  }));
  const valid =
    Number(parsedYield ?? 0) > 0 &&
    lines.length > 0 &&
    lineErrors.every((error) => !error.component && !error.quantity);
  const [showErrors, setShowErrors] = useState(false);

  const save = useAction(
    () =>
      api.put<Formula>(`/v1/products/${product.id}/draft-formula`, {
        batchYield: parsedYield ?? '0',
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        lines: lines.map((line) => ({
          componentId: line.componentId,
          quantity: parseDecimalInput(line.quantity) ?? '0',
        })),
      }),
    { success: (draft) => `Borrador v${String(draft.version)} guardado: falta publicarlo` },
  );

  const update = (key: number, patch: Partial<LineDraft>) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={
        base?.status === 'DRAFT'
          ? `Borrador v${String(base.version)}`
          : 'Nueva versión de la fórmula'
      }
      description={`${product.code} · ${product.name}. Guardar no cambia lo que usa planeación: eso pasa al publicar.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={save.isPending}
            onClick={() => {
              if (!valid) {
                setShowErrors(true);
                return;
              }
              save.mutate(undefined, { onSuccess: onClose });
            }}
          >
            Guardar borrador
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
        <Field
          label={`Rinde por bache (${unitLabel(product.stockUnit)})`}
          hint={
            product.type === 'BULK'
              ? 'Litros que salen de un bache con estas cantidades.'
              : 'Normalmente 1: las cantidades son por unidad.'
          }
          error={showErrors && !(Number(parsedYield ?? 0) > 0) ? 'Mayor que cero.' : undefined}
        >
          {(props) => (
            <Input
              {...props}
              inputMode="decimal"
              value={batchYield}
              onChange={(event) => {
                setBatchYield(event.target.value);
              }}
            />
          )}
        </Field>
        <Field label="Notas (opcional)" hint="Qué cambió respecto a la versión anterior.">
          {(props) => (
            <Input
              {...props}
              value={notes}
              maxLength={500}
              onChange={(event) => {
                setNotes(event.target.value);
              }}
            />
          )}
        </Field>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            Componentes{' '}
            <span className="font-normal text-ink-3">
              ({product.type === 'BULK' ? 'solo materias primas' : 'granel y materias primas'})
            </span>
          </h3>
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus className="size-3.5" />}
            onClick={() => {
              setLines((current) => [
                ...current,
                { key: lineKey++, componentId: '', quantity: '' },
              ]);
            }}
          >
            Agregar
          </Button>
        </div>
        <ul className="flex flex-col gap-3">
          {lines.map((line, index) => {
            const component = byId.get(line.componentId);
            const errors = lineErrors[index];
            return (
              <li
                key={line.key}
                className="grid grid-cols-[1fr_auto] items-start gap-2 rounded-lg border border-line p-3 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:border-0 sm:p-0"
              >
                <Field
                  label={`Componente ${String(index + 1)}`}
                  className="col-span-2 sm:col-span-1"
                  error={showErrors ? errors?.component : undefined}
                >
                  {(props) => (
                    <Select
                      {...props}
                      value={line.componentId}
                      onChange={(event) => {
                        update(line.key, { componentId: event.target.value });
                      }}
                    >
                      <option value="">Elige…</option>
                      {options.map((group) => (
                        <optgroup key={group.type} label={GROUP_LABELS[group.type]}>
                          {group.items.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.code} · {item.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field
                  label={`Cantidad${component ? ` (${unitLabel(component.stockUnit)})` : ''}`}
                  error={showErrors ? errors?.quantity : undefined}
                >
                  {(props) => (
                    <Input
                      {...props}
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(event) => {
                        update(line.key, { quantity: event.target.value });
                      }}
                    />
                  )}
                </Field>
                <Button
                  variant="ghost"
                  className="mt-6 hidden sm:inline-flex"
                  aria-label={`Quitar componente ${String(index + 1)}`}
                  icon={<Trash2 className="size-4" />}
                  disabled={lines.length === 1}
                  onClick={() => {
                    setLines((current) => current.filter((l) => l.key !== line.key));
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="col-span-2 justify-self-start sm:hidden"
                  icon={<Trash2 className="size-3.5" />}
                  disabled={lines.length === 1}
                  onClick={() => {
                    setLines((current) => current.filter((l) => l.key !== line.key));
                  }}
                >
                  Quitar
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
      {product.type === 'FINISHED_GOOD' ? (
        <p className="mt-4 text-[13px] text-ink-3">
          Ejemplo: la caja 00224 lleva 12 L de granel, 6 envases, 6 tapas, 6 etiquetas y 1 caja.
        </p>
      ) : null}
    </Dialog>
  );
}
