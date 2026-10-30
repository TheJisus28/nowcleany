import { HandCoins } from 'lucide-react';
import { useId, useState } from 'react';
import { api } from '../../api/client';
import { useAction } from '../../api/hooks';
import type { PaymentMethod } from '../../api/types';
import { Dialog } from '../../components/dialog';
import { Button, Field, Input, Select } from '../../components/ui';
import { formatCop, formatDate, formatDecimal, todayIso } from '../../lib/format';
import { PAYMENT_METHODS, pesosInput } from './billing-format';

/** A document with a balance: a customer invoice (a collection) or a supplier invoice (a payment). */
export interface PaymentTarget {
  kind: 'invoice' | 'supplier-invoice';
  id: string;
  label: string;
  party: string;
  balance: string;
  dueDate?: string | undefined;
}

/** "Registrar cobro" / "Registrar pago": amount prefilled with the balance, today, a method. */
export function PaymentDialog({
  target,
  onClose,
}: {
  target: PaymentTarget | null;
  onClose: () => void;
}) {
  if (!target) return null;
  return <PaymentForm key={`${target.kind}-${target.id}`} target={target} onClose={onClose} />;
}

function PaymentForm({ target, onClose }: { target: PaymentTarget; onClose: () => void }) {
  const formId = useId();
  const collecting = target.kind === 'invoice';
  const [amount, setAmount] = useState(target.balance);
  const [paidOn, setPaidOn] = useState(todayIso());
  const [method, setMethod] = useState<PaymentMethod>('TRANSFER');
  const [reference, setReference] = useState('');

  const value = amount === '' ? 0n : BigInt(amount);
  const balance = BigInt(target.balance);
  const remaining = balance - value;
  const amountError =
    amount !== '' && value <= 0n
      ? 'El valor debe ser mayor que cero.'
      : remaining < 0n
        ? `No puede superar el saldo pendiente (${formatCop(target.balance)}).`
        : undefined;
  const dateError = paidOn > todayIso() ? 'La fecha no puede ser futura.' : undefined;
  const valid = amount !== '' && !amountError && paidOn !== '' && !dateError;

  const pay = useAction(
    (body: { amount: string; paidOn: string; method: PaymentMethod; reference?: string }) =>
      api.post<unknown>(
        collecting
          ? `/v1/invoices/${target.id}/payments`
          : `/v1/supplier-invoices/${target.id}/payments`,
        body,
      ),
    {
      success: () =>
        `${collecting ? 'Cobro' : 'Pago'} de ${formatCop(amount)} registrado en ${target.label}`,
    },
  );

  const submit = () => {
    if (!valid) return;
    const trimmed = reference.trim();
    pay.mutate(
      { amount, paidOn, method, ...(trimmed ? { reference: trimmed } : {}) },
      { onSuccess: onClose },
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={collecting ? 'Registrar cobro' : 'Registrar pago'}
      description={`${target.label} · ${target.party}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form={formId}
            icon={<HandCoins className="size-4" />}
            loading={pay.isPending}
            disabled={!valid || pay.isPending}
          >
            {collecting ? 'Registrar cobro' : 'Registrar pago'}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-line bg-surface-2/60 px-4 py-3 text-sm">
          <div>
            <p className="text-[12.5px] text-ink-3">Saldo pendiente</p>
            <p className="font-semibold tabular-nums">{formatCop(target.balance)}</p>
          </div>
          {target.dueDate ? (
            <div>
              <p className="text-[12.5px] text-ink-3">Vence</p>
              <p className="font-medium">{formatDate(target.dueDate)}</p>
            </div>
          ) : null}
        </div>

        <Field
          label={collecting ? 'Valor cobrado (pesos)' : 'Valor pagado (pesos)'}
          error={amountError}
          hint={
            amount === ''
              ? undefined
              : remaining === 0n
                ? collecting
                  ? 'Con este cobro la factura queda pagada.'
                  : 'Con este pago la factura queda saldada.'
                : remaining > 0n
                  ? `Queda un saldo de ${formatCop(remaining.toString())}.`
                  : undefined
          }
        >
          {(props) => (
            <div className="relative">
              <span
                aria-hidden
                className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-ink-3"
              >
                $
              </span>
              <Input
                {...props}
                inputMode="numeric"
                autoComplete="off"
                className="pl-7 tabular-nums"
                value={amount === '' ? '' : formatDecimal(amount)}
                onChange={(event) => {
                  setAmount(pesosInput(event.target.value));
                }}
              />
            </div>
          )}
        </Field>
        {amount !== target.balance ? (
          <button
            type="button"
            onClick={() => {
              setAmount(target.balance);
            }}
            className="-mt-2 self-start text-[13px] font-medium text-brand hover:underline"
          >
            Usar el saldo completo ({formatCop(target.balance)})
          </button>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={collecting ? 'Fecha del cobro' : 'Fecha del pago'} error={dateError}>
            {(props) => (
              <Input
                {...props}
                type="date"
                max={todayIso()}
                value={paidOn}
                onChange={(event) => {
                  setPaidOn(event.target.value);
                }}
              />
            )}
          </Field>
          <Field label="Medio de pago">
            {(props) => (
              <Select
                {...props}
                value={method}
                onChange={(event) => {
                  setMethod(event.target.value as PaymentMethod);
                }}
              >
                {PAYMENT_METHODS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <Field label="Referencia" hint="Opcional: número de transferencia, consignación o cheque.">
          {(props) => (
            <Input
              {...props}
              maxLength={80}
              value={reference}
              placeholder={method === 'CASH' ? 'Recibo de caja' : 'Ej. 000123456'}
              onChange={(event) => {
                setReference(event.target.value);
              }}
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}
