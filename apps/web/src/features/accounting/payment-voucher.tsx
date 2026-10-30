import { CircleCheck, Eraser, FilePlus2, ListChecks, Printer, Save, X } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { useAction } from '../../api/hooks';
import type { PaymentMethod } from '../../api/types';
import { useProfile } from '../../auth/session';
import {
  DocumentScreen,
  DocumentSection,
  DocumentToolbar,
  DraftBanner,
  HeaderField,
  HeaderGrid,
  LookupField,
  type LookupItem,
  useDraft,
} from '../../components/erp';
import { cn } from '../../components/ui';
import { formatCop, formatDate, formatDecimal, plural, todayIso } from '../../lib/format';
import { daysOverdue, PAYMENT_METHODS, pesosInput, sumPesos } from '../billing/billing-format';
import { type DocColumn, DocTable, FILTER_INPUT, Money } from '../billing/erp-kit';

/** An open document of a customer or supplier that a payment can be applied to. */
export interface OpenDocument {
  id: string;
  partyId: string;
  partyName: string;
  /** NIT or name the user types to find the party. */
  partyCode: string;
  label: ReactNode;
  labelText: string;
  /** Related document (the purchase order of a supplier invoice). */
  reference?: ReactNode;
  /** Issue date, YYYY-MM-DD. */
  date: string;
  dueDate: string;
  total: string;
  paid: string;
  balance: string;
}

export interface PaymentBody {
  amount: string;
  paidOn: string;
  method: PaymentMethod;
  reference?: string;
}

interface VoucherDraft {
  partyId: string;
  paidOn: string;
  method: PaymentMethod;
  reference: string;
  amounts: Record<string, string> | null;
}

interface Saved {
  party: string;
  total: string;
  documents: string[];
  paidOn: string;
  method: string;
}

/**
 * A cash receipt (customer) or a disbursement voucher (supplier) as one document: the party, date,
 * payment method and reference, and the grid of its open invoices with the value to apply to each
 * (prefilled with the balance). Saving applies one payment per invoice with a value.
 */
export function PaymentVoucher({
  kind,
  partyLabel,
  documentHeader,
  referenceHeader,
  documents,
  preselect,
  draftKey,
  closeTo,
  pay,
  onSaved,
  children,
}: {
  /** "Recibo de caja" / "Comprobante de egreso". */
  kind: string;
  /** "Cliente" / "Proveedor". */
  partyLabel: string;
  documentHeader: string;
  referenceHeader?: string;
  documents: readonly OpenDocument[];
  /** Document id from the URL (?factura=): its party is chosen and only it gets a value. */
  preselect: string | null;
  draftKey: string;
  closeTo: string;
  pay: (documentId: string, body: PaymentBody) => Promise<unknown>;
  /** After saving (to drop ?factura= from the URL). */
  onSaved: () => void;
  /** Consultation of recent vouchers, under the document. */
  children?: ReactNode;
}) {
  const profile = useProfile();
  const preselected = documents.find((document) => document.id === preselect);
  const [partyId, setPartyId] = useState(preselected?.partyId ?? '');
  const [usePreselect, setUsePreselect] = useState(Boolean(preselected));
  const [paidOn, setPaidOn] = useState(todayIso());
  const [method, setMethod] = useState<PaymentMethod>('TRANSFER');
  const [reference, setReference] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string> | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  // Opened again from another invoice (?factura= changed while the tab stayed open).
  const [syncedPreselect, setSyncedPreselect] = useState(preselect);
  if (preselect !== syncedPreselect) {
    setSyncedPreselect(preselect);
    const target = documents.find((item) => item.id === preselect);
    if (target) {
      setPartyId(target.partyId);
      setUsePreselect(true);
      setAmounts(null);
      setShowErrors(false);
    }
  }

  const parties = useMemo<LookupItem[]>(() => {
    const byParty = new Map<string, { item: LookupItem; count: number; balance: bigint }>();
    for (const document of documents) {
      const entry = byParty.get(document.partyId) ?? {
        item: { id: document.partyId, code: document.partyCode, label: document.partyName },
        count: 0,
        balance: 0n,
      };
      entry.count += 1;
      entry.balance += BigInt(document.balance);
      byParty.set(document.partyId, entry);
    }
    return [...byParty.values()]
      .sort((a, b) => a.item.label.localeCompare(b.item.label, 'es'))
      .map(({ item, count, balance }) => ({
        ...item,
        detail: `${plural(count, 'factura abierta', 'facturas abiertas')} · saldo ${formatCop(balance.toString())}`,
      }));
  }, [documents]);

  const rows = useMemo(
    () =>
      documents
        .filter((document) => document.partyId === partyId)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [documents, partyId],
  );
  const partyName = rows[0]?.partyName ?? '';
  // Prefilled with the balance; from an invoice (?factura=), only that invoice.
  const defaults = useMemo(
    () =>
      Object.fromEntries(
        rows.map((row) => [
          row.id,
          usePreselect && preselect ? (row.id === preselect ? row.balance : '') : row.balance,
        ]),
      ),
    [rows, usePreselect, preselect],
  );
  const values: Record<string, string> = amounts ?? defaults;
  const valueOf = (id: string) => values[id] ?? '';

  // --- draft -----------------------------------------------------------------------------------
  const draftValue = useMemo<VoucherDraft>(
    () => ({ partyId, paidOn, method, reference, amounts }),
    [partyId, paidOn, method, reference, amounts],
  );
  const draft = useDraft(`${draftKey}.${profile.id}`, draftValue, {
    enabled: !preselect,
    isEmpty: (value) => !value.partyId,
  });
  const restoreDraft = () => {
    const value = draft.restore();
    if (!value) return;
    setPartyId(value.partyId);
    setPaidOn(value.paidOn);
    setMethod(value.method);
    setReference(value.reference);
    setAmounts(value.amounts);
    setUsePreselect(false);
  };

  // --- validation ------------------------------------------------------------------------------
  const errors = new Map<string, string>();
  for (const row of rows) {
    const value = valueOf(row.id);
    if (value && BigInt(value) > BigInt(row.balance))
      errors.set(row.id, `Supera el saldo de ${formatCop(row.balance)}`);
  }
  const applied = rows.filter((row) => valueOf(row.id) && BigInt(valueOf(row.id)) > 0n);
  const total = sumPesos(applied.map((row) => valueOf(row.id)));
  const balance = sumPesos(rows.map((row) => row.balance));
  const dateError = !paidOn
    ? 'Escribe la fecha.'
    : paidOn > todayIso()
      ? 'La fecha no puede ser futura.'
      : undefined;
  const problems = [
    ...(!partyId ? [`Elige el ${partyLabel.toLowerCase()} (F2 para buscar).`] : []),
    ...(partyId && applied.length === 0
      ? ['Escribe el valor a aplicar en al menos una factura.']
      : []),
    ...(dateError ? [dateError] : []),
    ...[...errors.entries()].map(([id, message]) => {
      const row = rows.find((item) => item.id === id);
      return `${row?.labelText ?? ''}: ${message.toLowerCase()}.`;
    }),
  ];

  const reset = () => {
    setPartyId('');
    setUsePreselect(false);
    setPaidOn(todayIso());
    setMethod('TRANSFER');
    setReference('');
    setAmounts(null);
    setShowErrors(false);
  };

  const save = useAction(
    async () => {
      const trimmed = reference.trim();
      for (const row of applied) {
        await pay(row.id, {
          amount: valueOf(row.id),
          paidOn,
          method,
          ...(trimmed ? { reference: trimmed } : {}),
        });
      }
      return {
        party: partyName,
        total: total.toString(),
        documents: applied.map((row) => row.labelText),
        paidOn,
        method: PAYMENT_METHODS.find((option) => option.value === method)?.label ?? method,
      } satisfies Saved;
    },
    {
      success: (result) =>
        `${kind} por ${formatCop(result.total)} registrado: ${result.documents.join(', ')}`,
    },
  );
  const submit = () => {
    setShowErrors(true);
    if (problems.length > 0 || save.isPending) return;
    save.mutate(undefined, {
      onSuccess: (result) => {
        setSaved(result);
        draft.clear();
        reset();
        onSaved();
      },
    });
  };

  const columns: DocColumn<OpenDocument>[] = [
    {
      key: 'label',
      header: documentHeader,
      className: 'whitespace-nowrap font-medium',
      render: (row) => row.label,
    },
    ...(referenceHeader
      ? [
          {
            key: 'reference',
            header: referenceHeader,
            className: 'whitespace-nowrap',
            render: (row: OpenDocument) => row.reference ?? '—',
          },
        ]
      : []),
    {
      key: 'date',
      header: 'Fecha',
      className: 'whitespace-nowrap',
      render: (row) => formatDate(row.date),
    },
    {
      key: 'due',
      header: 'Vence',
      className: 'whitespace-nowrap',
      render: (row) => formatDate(row.dueDate),
    },
    {
      key: 'days',
      header: 'Días vencida',
      align: 'right',
      render: (row) => {
        const days = daysOverdue(row.dueDate);
        return days > 0 ? (
          <span className="font-medium text-critical">{days}</span>
        ) : (
          <span className="text-ink-3">Al día</span>
        );
      },
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (row) => <Money value={row.total} />,
    },
    {
      key: 'paid',
      header: 'Abonos',
      align: 'right',
      render: (row) => <Money value={row.paid} />,
    },
    {
      key: 'balance',
      header: 'Saldo',
      align: 'right',
      render: (row) => <Money value={row.balance} strong />,
      total: <Money value={balance} strong />,
    },
    {
      key: 'apply',
      header: 'Valor a aplicar',
      align: 'right',
      className: 'w-40',
      render: (row) => {
        const error = showErrors || valueOf(row.id) ? errors.get(row.id) : undefined;
        return (
          <span className="flex flex-col items-end">
            <span className="relative">
              <span
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-[12.5px] text-ink-3"
              >
                $
              </span>
              <input
                inputMode="numeric"
                autoComplete="off"
                aria-label={`Valor a aplicar a ${row.labelText}`}
                aria-invalid={error ? true : undefined}
                value={valueOf(row.id) ? formatDecimal(valueOf(row.id)) : ''}
                placeholder="0"
                onChange={(event) => {
                  setAmounts({ ...values, [row.id]: pesosInput(event.target.value) });
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    const inputs = [
                      ...document.querySelectorAll<HTMLInputElement>('input[data-apply]'),
                    ];
                    inputs[inputs.indexOf(event.currentTarget) + 1]?.focus();
                  }
                }}
                data-apply
                className={cn(
                  FILTER_INPUT,
                  'h-7 w-36 pl-5 text-right tabular-nums print:border-0',
                  error && 'border-critical',
                )}
              />
            </span>
            {error ? <span className="text-[11.5px] text-critical">{error}</span> : null}
          </span>
        );
      },
      total: <Money value={total} strong />,
    },
  ];

  return (
    <>
      <DocumentToolbar
        actions={[
          {
            label: 'Nuevo',
            icon: FilePlus2,
            onClick: () => {
              draft.clear();
              reset();
              setSaved(null);
              onSaved();
            },
          },
          {
            label: `Guardar ${kind.toLowerCase()}`,
            icon: Save,
            shortcut: 'Ctrl+S',
            primary: true,
            loading: save.isPending,
            onClick: submit,
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
        closeTo={closeTo}
      />
      {saved ? (
        <div
          role="status"
          className="no-print mb-3 flex items-start gap-2.5 rounded-md border border-good/30 bg-good-soft px-3 py-2 text-[13.5px]"
        >
          <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-good" />
          <p className="flex-1">
            <span className="font-medium">
              {kind} registrado por {formatCop(saved.total)}
            </span>{' '}
            · {saved.party} · {saved.method} · {formatDate(saved.paidOn)} · aplicado a{' '}
            {saved.documents.join(', ')}.
          </p>
          <button
            type="button"
            onClick={() => {
              setSaved(null);
            }}
            aria-label="Cerrar aviso"
            className="rounded p-0.5 text-ink-3 hover:bg-surface hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}
      {draft.pending ? (
        <DraftBanner
          savedAt={draft.pending.savedAt}
          onRestore={restoreDraft}
          onDiscard={draft.discard}
        />
      ) : null}
      <DocumentScreen
        kind={kind}
        number="Nuevo"
        status={<span className="text-[12.5px] text-ink-3">Sin guardar</span>}
        notes={
          <div className="flex flex-col gap-1.5">
            <p>
              Cada valor se aplica como abono a su factura; con el saldo completo la factura queda
              saldada. Enter pasa al siguiente valor.
            </p>
            {showErrors && problems.length > 0 ? (
              <ul className="no-print rounded-md border border-critical/30 bg-critical-soft/50 px-3 py-2 text-[13px] text-ink">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            ) : null}
          </div>
        }
        totals={[
          { label: 'Saldo de las facturas', value: formatCop(balance.toString()) },
          {
            label: `Total del ${kind.toLowerCase().startsWith('recibo') ? 'recibo' : 'comprobante'}`,
            value: formatCop(total.toString()),
            strong: true,
          },
        ]}
        signatures={[{ label: 'Elaboró', name: profile.fullName, at: formatDate(paidOn) }]}
      >
        <HeaderGrid>
          <HeaderField label={`${partyLabel} (NIT o nombre)`} span={2} htmlFor="voucher-party">
            <LookupField
              id="voucher-party"
              title={`Buscar ${partyLabel.toLowerCase()} con facturas abiertas`}
              items={parties}
              value={partyId || null}
              placeholder="NIT o nombre (F2)"
              onChange={(id) => {
                setPartyId(id);
                setUsePreselect(false);
                setAmounts(null);
              }}
            />
          </HeaderField>
          <HeaderField label="Fecha" htmlFor="voucher-date">
            <input
              id="voucher-date"
              type="date"
              value={paidOn}
              max={todayIso()}
              onChange={(event) => {
                setPaidOn(event.target.value);
              }}
              className={cn(FILTER_INPUT, 'w-full', showErrors && dateError && 'border-critical')}
            />
          </HeaderField>
          <HeaderField label="Medio de pago" htmlFor="voucher-method">
            <select
              id="voucher-method"
              value={method}
              onChange={(event) => {
                setMethod(event.target.value as PaymentMethod);
              }}
              className={cn(FILTER_INPUT, 'w-full')}
            >
              {PAYMENT_METHODS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </HeaderField>
          <HeaderField
            label="Referencia (transferencia, consignación o cheque)"
            span={2}
            htmlFor="voucher-reference"
          >
            <input
              id="voucher-reference"
              value={reference}
              maxLength={80}
              placeholder={method === 'CASH' ? 'Opcional' : 'Ej. 000123456'}
              onChange={(event) => {
                setReference(event.target.value);
              }}
              className={cn(FILTER_INPUT, 'w-full')}
            />
          </HeaderField>
          <HeaderField label="Elaboró">
            <span className="block py-1">{profile.fullName}</span>
          </HeaderField>
        </HeaderGrid>
        <DocumentSection
          title={partyName ? `Facturas abiertas de ${partyName}` : 'Facturas abiertas'}
          flush
          actions={
            rows.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setAmounts(Object.fromEntries(rows.map((row) => [row.id, row.balance])));
                  }}
                  className="inline-flex h-7 items-center gap-1 rounded-[5px] px-2 text-[12.5px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
                >
                  <ListChecks aria-hidden className="size-3.5" />
                  Aplicar todos los saldos
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAmounts({});
                  }}
                  className="inline-flex h-7 items-center gap-1 rounded-[5px] px-2 text-[12.5px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
                >
                  <Eraser aria-hidden className="size-3.5" />
                  Limpiar valores
                </button>
              </>
            ) : null
          }
        >
          <DocTable
            label="Facturas abiertas"
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            minWidth={820}
            empty={
              partyId
                ? `${partyName || 'Este tercero'} no tiene facturas con saldo.`
                : `Elige el ${partyLabel.toLowerCase()}: aparecen sus facturas con saldo y el valor a aplicar.`
            }
          />
        </DocumentSection>
      </DocumentScreen>
      {children}
    </>
  );
}
