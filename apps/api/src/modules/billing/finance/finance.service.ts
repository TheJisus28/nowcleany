import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { CurrentActor } from '../../../platform/security/current-actor.js';
import { PurchasingBook } from '../../purchasing/index.js';
import {
  AGING_LABELS,
  type AgingBucket,
  agingBucket,
  invoiceLabel,
  PAYMENT_METHOD_LABELS,
  todayInColombia,
} from '../domain/invoice.js';
import { InvoicesRepository } from '../invoices/invoices.repository.js';

const BUCKETS: readonly AgingBucket[] = ['CURRENT', 'D1_30', 'D31_60', 'D60_PLUS'];

interface Party {
  id: string;
  name: string;
  balance: bigint;
  overdue: bigint;
  documents: number;
}

export interface AgingView {
  readonly total: string;
  readonly overdue: string;
  readonly buckets: readonly {
    bucket: AgingBucket;
    label: string;
    amount: string;
    documents: number;
  }[];
  readonly parties: readonly {
    id: string;
    name: string;
    balance: string;
    overdue: string;
    documents: number;
  }[];
}

export interface MovementView {
  readonly date: string;
  readonly direction: 'IN' | 'OUT';
  readonly party: string;
  readonly document: string;
  readonly method: string;
  readonly reference: string | null;
  readonly amount: string;
  readonly recordedBy: string;
}

export interface FinanceSummary {
  readonly generatedAt: string;
  readonly period: { from: string; to: string };
  readonly receivables: AgingView;
  readonly payables: AgingView;
  readonly movements: readonly MovementView[];
  readonly totals: { collected: string; paid: string; net: string };
  /** Last six months: invoiced, collected, bought (supplier invoices) and paid, in pesos. */
  readonly months: readonly {
    month: string;
    invoiced: string;
    collected: string;
    bought: string;
    paid: string;
  }[];
}

const METHOD = (method: string) => PAYMENT_METHOD_LABELS[method] ?? method;

/** The accountant's report: what customers owe, what is owed to suppliers, and the money that moved. */
@Injectable()
export class FinanceService {
  constructor(
    private readonly invoices: InvoicesRepository,
    private readonly purchasing: PurchasingBook,
    private readonly currentActor: CurrentActor,
  ) {}

  @Transactional()
  async summary(period: { from?: string; to?: string }): Promise<FinanceSummary> {
    this.currentActor.requirePermission('finance:read');
    const today = todayInColombia();
    const to = period.to ?? today;
    const from = period.from ?? `${to.slice(0, 7)}-01`;
    const sixMonthsAgo = shiftMonth(`${today.slice(0, 7)}-01`, -5);

    const invoices = await this.invoices.list({ limit: 20_000 });
    const payments = await this.invoices.payments({ from: sixMonthsAgo });
    const payables = await this.purchasing.payables({ from: sixMonthsAgo });

    const receivables = aging(
      invoices.map((invoice) => ({
        partyId: invoice.customer.id,
        partyName: invoice.customer.name,
        balance: invoice.total - invoice.paid,
        dueDate: invoice.dueDate,
      })),
      today,
    );
    const owed = aging(
      payables.invoices.map((invoice) => ({
        partyId: invoice.supplier.id,
        partyName: invoice.supplier.name,
        balance: invoice.total - invoice.paid,
        dueDate: invoice.dueDate,
      })),
      today,
    );

    const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
    const supplierInvoiceById = new Map(payables.invoices.map((invoice) => [invoice.id, invoice]));
    const inPeriod = (date: string) => date >= from && date <= to;
    const movements: MovementView[] = [
      ...payments
        .filter((payment) => inPeriod(payment.paidOn))
        .map((payment) => {
          const invoice = invoiceById.get(payment.invoiceId);
          return {
            date: payment.paidOn,
            direction: 'IN' as const,
            party: invoice?.customer.name ?? '—',
            document: invoice ? invoiceLabel(invoice.number) : '—',
            method: METHOD(payment.method),
            reference: payment.reference,
            amount: payment.amount.toString(),
            recordedBy: payment.recordedByName,
          };
        }),
      ...payables.payments
        .filter((payment) => inPeriod(payment.paidOn))
        .map((payment) => {
          const invoice = supplierInvoiceById.get(payment.supplierInvoiceId);
          return {
            date: payment.paidOn,
            direction: 'OUT' as const,
            party: invoice?.supplier.name ?? '—',
            document: invoice ? `Factura ${invoice.documentNumber}` : '—',
            method: METHOD(payment.method),
            reference: payment.reference,
            amount: payment.amount.toString(),
            recordedBy: payment.recordedByName,
          };
        }),
    ].sort((a, b) => b.date.localeCompare(a.date));
    const collected = sum(
      movements.filter((m) => m.direction === 'IN').map((m) => BigInt(m.amount)),
    );
    const paid = sum(movements.filter((m) => m.direction === 'OUT').map((m) => BigInt(m.amount)));

    const months = Array.from({ length: 6 }, (_, index) => shiftMonth(sixMonthsAgo, index));
    const monthOf = (date: string) => `${date.slice(0, 7)}-01`;
    const series = months.map((month) => ({
      month: month.slice(0, 7),
      invoiced: sum(
        invoices
          .filter((invoice) => monthOf(todayInColombia(invoice.issuedAt)) === month)
          .map((invoice) => invoice.total),
      ).toString(),
      collected: sum(
        payments.filter((payment) => monthOf(payment.paidOn) === month).map((p) => p.amount),
      ).toString(),
      bought: sum(
        payables.invoices
          .filter((invoice) => monthOf(invoice.invoiceDate) === month)
          .map((invoice) => invoice.total),
      ).toString(),
      paid: sum(
        payables.payments
          .filter((payment) => monthOf(payment.paidOn) === month)
          .map((p) => p.amount),
      ).toString(),
    }));

    return {
      generatedAt: new Date().toISOString(),
      period: { from, to },
      receivables,
      payables: owed,
      movements,
      totals: {
        collected: collected.toString(),
        paid: paid.toString(),
        net: (collected - paid).toString(),
      },
      months: series,
    };
  }
}

function aging(
  documents: readonly { partyId: string; partyName: string; balance: bigint; dueDate: string }[],
  today: string,
): AgingView {
  const buckets = new Map<AgingBucket, { amount: bigint; documents: number }>(
    BUCKETS.map((bucket) => [bucket, { amount: 0n, documents: 0 }]),
  );
  const parties = new Map<string, Party>();
  let total = 0n;
  let overdue = 0n;
  for (const document of documents) {
    if (document.balance <= 0n) continue;
    const bucket = agingBucket(document.dueDate, today);
    const entry = buckets.get(bucket) ?? { amount: 0n, documents: 0 };
    buckets.set(bucket, {
      amount: entry.amount + document.balance,
      documents: entry.documents + 1,
    });
    total += document.balance;
    const late = bucket === 'CURRENT' ? 0n : document.balance;
    overdue += late;
    const party = parties.get(document.partyId) ?? {
      id: document.partyId,
      name: document.partyName,
      balance: 0n,
      overdue: 0n,
      documents: 0,
    };
    parties.set(document.partyId, {
      ...party,
      balance: party.balance + document.balance,
      overdue: party.overdue + late,
      documents: party.documents + 1,
    });
  }
  return {
    total: total.toString(),
    overdue: overdue.toString(),
    buckets: BUCKETS.map((bucket) => ({
      bucket,
      label: AGING_LABELS[bucket],
      amount: (buckets.get(bucket)?.amount ?? 0n).toString(),
      documents: buckets.get(bucket)?.documents ?? 0,
    })),
    parties: [...parties.values()]
      .sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0))
      .map((party) => ({
        id: party.id,
        name: party.name,
        balance: party.balance.toString(),
        overdue: party.overdue.toString(),
        documents: party.documents,
      })),
  };
}

function sum(values: readonly bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n);
}

/** "2026-11-01" shifted by whole months. */
function shiftMonth(month: string, delta: number): string {
  const [year = 0, mon = 1] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return date.toISOString().slice(0, 10);
}
