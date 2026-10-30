import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../api/client';
import { useAction } from '../../api/hooks';
import type { Product, ProductType } from '../../api/types';
import { useSession } from '../../auth/session';
import { Dialog } from '../../components/dialog';
import { pathTo } from '../../components/links';
import { Button, Field, Input, Segmented, Select } from '../../components/ui';
import { formatDecimal, parseDecimalInput, unitLabel } from '../../lib/format';
import { moneyInput, parseMoneyInput } from '../purchasing/money';

const TYPES: { value: ProductType; label: string; hint: string }[] = [
  {
    value: 'RAW_MATERIAL',
    label: 'Materia prima',
    hint: 'Se compra: químicos, envases, tapas, etiquetas.',
  },
  {
    value: 'BULK',
    label: 'Granel',
    hint: 'Líquido que se fabrica por baches con una fórmula química.',
  },
  {
    value: 'FINISHED_GOOD',
    label: 'Terminado',
    hint: 'Lo que se vende: granel envasado con su envase, tapa y etiqueta.',
  },
  {
    value: 'RESALE',
    label: 'Reventa',
    hint: 'Se compra y se vende tal cual: escobas, recogedores, traperos.',
  },
];

const UNITS = ['un', 'kg', 'g', 'L', 'mL'] as const;
const DEFAULT_UNIT: Record<ProductType, string> = {
  RAW_MATERIAL: 'kg',
  BULK: 'L',
  FINISHED_GOOD: 'un',
  RESALE: 'un',
};

/** What is sold carries a sale price; what is bought, a purchase cost (resale goods, both). */
const SOLD: readonly ProductType[] = ['FINISHED_GOOD', 'RESALE'];
const BOUGHT: readonly ProductType[] = ['RAW_MATERIAL', 'RESALE'];

/**
 * Creates a product (code, type and unit are fixed afterwards) or edits its name, batch size, sale
 * price and purchase cost.
 */
export function ProductFormDialog({
  product,
  onClose,
}: {
  product?: Product | undefined;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { can } = useSession();
  const canPrice = can('products:write');
  const [code, setCode] = useState(product?.code ?? '');
  const [name, setName] = useState(product?.name ?? '');
  const [type, setType] = useState<ProductType>(product?.type ?? 'FINISHED_GOOD');
  const [unit, setUnit] = useState(product?.stockUnit ?? DEFAULT_UNIT.FINISHED_GOOD);
  const [batch, setBatch] = useState(
    product?.batchCapacity ? formatDecimal(product.batchCapacity.quantity) : '',
  );
  const parsedBatch = batch.trim() === '' ? '' : parseDecimalInput(batch);
  const [price, setPrice] = useState(moneyInput(product?.price));
  const [cost, setCost] = useState(moneyInput(product?.cost));
  const parsedPrice = price.trim() === '' ? '' : parseMoneyInput(price);
  const parsedCost = cost.trim() === '' ? '' : parseMoneyInput(cost);
  const currentType = product?.type ?? type;
  const showPrice = canPrice && SOLD.includes(currentType);
  const showCost = canPrice && BOUGHT.includes(currentType);
  const money = {
    ...(showPrice && (product || parsedPrice) ? { price: parsedPrice ?? '' } : {}),
    ...(showCost && (product || parsedCost) ? { cost: parsedCost ?? '' } : {}),
  };

  const save = useAction(
    () =>
      product
        ? api.patch<Product>(`/v1/products/${product.id}`, {
            name,
            ...(product.type === 'BULK' ? { batchCapacity: parsedBatch ?? '' } : {}),
            ...money,
          })
        : api.post<Product>('/v1/products', {
            code,
            name,
            type,
            stockUnit: unit,
            ...(type === 'BULK' && parsedBatch ? { batchCapacity: parsedBatch } : {}),
            ...money,
          }),
    {
      success: (saved) =>
        product
          ? `${saved.name} actualizado`
          : saved.type === 'RAW_MATERIAL' || saved.type === 'RESALE'
            ? `${saved.code} creado`
            : `${saved.code} creado: ahora define su fórmula`,
    },
  );

  const valid =
    name.trim().length >= 2 &&
    (product !== undefined || /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(code.trim())) &&
    parsedBatch !== null &&
    (!showPrice || parsedPrice !== null) &&
    (!showCost || parsedCost !== null);

  return (
    <Dialog
      open
      onClose={onClose}
      title={product ? `Editar ${product.code}` : 'Nuevo producto'}
      description={
        product
          ? 'El código, el tipo y la unidad no cambian: el historial depende de ellos.'
          : 'Granel y terminados: después de crearlo podrás definir su fórmula.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={save.isPending}
            disabled={!valid}
            onClick={() => {
              save.mutate(undefined, {
                onSuccess: (saved) => {
                  onClose();
                  if (!product) void navigate(pathTo('product', saved.id));
                },
              });
            }}
          >
            {product ? 'Guardar cambios' : 'Crear producto'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {product ? null : (
          <>
            <fieldset>
              <legend className="mb-2 text-[13px] font-medium text-ink-2">Tipo</legend>
              <Segmented
                label="Tipo de producto"
                value={type}
                onChange={(value) => {
                  setType(value);
                  setUnit(DEFAULT_UNIT[value]);
                }}
                options={TYPES}
              />
              <p className="mt-2 text-[13px] text-ink-3">
                {TYPES.find((option) => option.value === type)?.hint}
              </p>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
              <Field
                label="Código"
                hint="Único; se guarda en mayúsculas (p. ej. 00412 o MP-ENV-5L)."
              >
                {(props) => (
                  <Input
                    {...props}
                    value={code}
                    autoFocus
                    maxLength={40}
                    onChange={(event) => {
                      setCode(event.target.value.toUpperCase());
                    }}
                  />
                )}
              </Field>
              <Field label="Unidad de inventario">
                {(props) => (
                  <Select
                    {...props}
                    value={unit}
                    onChange={(event) => {
                      setUnit(event.target.value);
                    }}
                  >
                    {UNITS.map((option) => (
                      <option key={option} value={option}>
                        {unitLabel(option)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          </>
        )}
        <Field label="Nombre">
          {(props) => (
            <Input
              {...props}
              value={name}
              maxLength={160}
              autoFocus={Boolean(product)}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          )}
        </Field>
        {(product?.type ?? type) === 'BULK' ? (
          <Field
            label={`Capacidad máxima de bache (${unitLabel(product?.stockUnit ?? unit)})`}
            hint="Lo que cabe en el tanque: planta programa en baches de este tamaño."
            error={parsedBatch === null ? 'Escribe una cantidad válida.' : undefined}
          >
            {(props) => (
              <Input
                {...props}
                inputMode="decimal"
                value={batch}
                placeholder="25.000"
                onChange={(event) => {
                  setBatch(event.target.value);
                }}
              />
            )}
          </Field>
        ) : null}
        {showPrice || showCost ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {showPrice ? (
              <Field
                label={`Precio de venta (pesos por ${unitLabel(product?.stockUnit ?? unit)})`}
                hint="Antes de IVA. Con este precio factura el consolidado."
                error={parsedPrice === null ? 'Escribe pesos enteros, p. ej. 12.500.' : undefined}
              >
                {(props) => (
                  <Input
                    {...props}
                    inputMode="numeric"
                    value={price}
                    placeholder="12.500"
                    onChange={(event) => {
                      setPrice(event.target.value);
                    }}
                    onBlur={() => {
                      if (parsedPrice) setPrice(moneyInput(parsedPrice));
                    }}
                  />
                )}
              </Field>
            ) : null}
            {showCost ? (
              <Field
                label={`Costo de compra (pesos por ${unitLabel(product?.stockUnit ?? unit)})`}
                hint="Antes de IVA. Prellena las órdenes de compra y el plan del mes."
                error={parsedCost === null ? 'Escribe pesos enteros, p. ej. 2.400.' : undefined}
              >
                {(props) => (
                  <Input
                    {...props}
                    inputMode="numeric"
                    value={cost}
                    placeholder="2.400"
                    onChange={(event) => {
                      setCost(event.target.value);
                    }}
                    onBlur={() => {
                      if (parsedCost) setCost(moneyInput(parsedCost));
                    }}
                  />
                )}
              </Field>
            ) : null}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
