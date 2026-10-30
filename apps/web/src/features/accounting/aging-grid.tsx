import type { LucideIcon } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import {
  DocumentToolbar,
  FilterBar,
  FilterField,
  type QueryColumn,
  QueryGrid,
} from '../../components/erp';
import { formatDate } from '../../lib/format';
import {
  AGING_BUCKETS,
  type AgingBucket,
  agingOf,
  daysOverdue,
  normalizeText,
  sumPesos,
} from '../billing/billing-format';
import { FILTER_INPUT, Money, ScreenTitle, useQueryFilters } from '../billing/erp-kit';

/** An open document (sales invoice or supplier invoice) in the aging consultation. */
export interface AgingDocument {
  id: string;
  partyId: string;
  partyName: string;
  partyCode: string;
  label: ReactNode;
  labelText: string;
  reference?: ReactNode;
  referenceText?: string;
  seller?: string;
  date: string;
  dueDate: string;
  total: string;
  balance: string;
}

interface PartyRow {
  id: string;
  name: string;
  code: string;
  documents: number;
  buckets: Record<AgingBucket, bigint>;
  balance: bigint;
  oldest: number;
}

const bucketValue = (row: AgingDocument, bucket: AgingBucket) =>
  agingOf(row.dueDate) === bucket ? row.balance : '0';

/**
 * Cartera / Cuentas por pagar: open documents with their aging (not due, 1–30, 31–60, more than
 * 60 days overdue), filtered by party, by document or summarized per party, with totals.
 */
export function AgingConsultation({
  title,
  description,
  partyLabel,
  documentHeader,
  referenceHeader,
  documents,
  showSeller = false,
  openLabel,
  onOpen,
  action,
}: {
  title: string;
  description: string;
  partyLabel: string;
  documentHeader: string;
  referenceHeader?: string;
  documents: readonly AgingDocument[];
  showSeller?: boolean;
  /** What Enter / double click does on a document ("registra el recibo de caja"). */
  openLabel: string;
  onOpen: (document: AgingDocument) => void;
  action?: { label: string; icon: LucideIcon; to: string } | null;
}) {
  const filters = useQueryFilters({ tercero: '', estado: 'all', ver: 'documento' });
  const { draft, set } = filters;
  const { tercero, estado, ver } = filters.applied;

  const rows = useMemo(() => {
    const party = normalizeText(tercero.trim());
    return documents.filter(
      (row) =>
        (!party || normalizeText(`${row.partyName} ${row.partyCode}`).includes(party)) &&
        (estado === 'all' ||
          (estado === 'overdue' ? daysOverdue(row.dueDate) > 0 : daysOverdue(row.dueDate) === 0)),
    );
  }, [documents, tercero, estado]);

  const parties = useMemo<PartyRow[]>(() => {
    const byParty = new Map<string, PartyRow>();
    for (const row of rows) {
      const entry = byParty.get(row.partyId) ?? {
        id: row.partyId,
        name: row.partyName,
        code: row.partyCode,
        documents: 0,
        buckets: { CURRENT: 0n, D1_30: 0n, D31_60: 0n, D60_PLUS: 0n },
        balance: 0n,
        oldest: 0,
      };
      entry.documents += 1;
      entry.buckets[agingOf(row.dueDate)] += BigInt(row.balance);
      entry.balance += BigInt(row.balance);
      entry.oldest = Math.max(entry.oldest, daysOverdue(row.dueDate));
      byParty.set(row.partyId, entry);
    }
    return [...byParty.values()];
  }, [rows]);

  const bucketColumns: QueryColumn<AgingDocument>[] = AGING_BUCKETS.map((bucket) => ({
    key: bucket.key,
    header: bucket.label,
    align: 'right' as const,
    render: (row: AgingDocument) => {
      const value = bucketValue(row, bucket.key);
      return value === '0' ? (
        <span className="text-ink-3">—</span>
      ) : (
        <span className={bucket.key === 'CURRENT' ? undefined : 'text-critical'}>
          <Money value={value} />
        </span>
      );
    },
    sort: (row: AgingDocument) => Number(bucketValue(row, bucket.key)),
    csv: (row: AgingDocument) => bucketValue(row, bucket.key),
    total: (list: readonly AgingDocument[]) => (
      <Money value={sumPesos(list.map((row) => bucketValue(row, bucket.key)))} />
    ),
  }));

  const documentColumns: QueryColumn<AgingDocument>[] = [
    {
      key: 'label',
      header: documentHeader,
      className: 'whitespace-nowrap font-medium',
      render: (row) => row.label,
      sort: (row) => row.labelText,
      csv: (row) => row.labelText,
    },
    ...(referenceHeader
      ? [
          {
            key: 'reference',
            header: referenceHeader,
            hideOnMobile: true,
            className: 'whitespace-nowrap',
            render: (row: AgingDocument) => row.reference ?? '—',
            csv: (row: AgingDocument) => row.referenceText ?? '',
          },
        ]
      : []),
    {
      key: 'party',
      header: partyLabel,
      render: (row) => row.partyName,
      sort: (row) => row.partyName,
      csv: (row) => row.partyName,
    },
    {
      key: 'code',
      header: 'NIT / C.C.',
      hideOnMobile: true,
      className: 'tabular-nums text-ink-2',
      render: (row) => row.partyCode,
      csv: (row) => row.partyCode,
    },
    ...(showSeller
      ? [
          {
            key: 'seller',
            header: 'Vendedor',
            hideOnMobile: true,
            render: (row: AgingDocument) => row.seller ?? '—',
            sort: (row: AgingDocument) => row.seller ?? '',
            csv: (row: AgingDocument) => row.seller ?? '',
          },
        ]
      : []),
    {
      key: 'date',
      header: 'Fecha',
      hideOnMobile: true,
      render: (row) => <span className="whitespace-nowrap">{formatDate(row.date)}</span>,
      sort: (row) => row.date,
      csv: (row) => row.date,
    },
    {
      key: 'due',
      header: 'Vence',
      render: (row) => <span className="whitespace-nowrap">{formatDate(row.dueDate)}</span>,
      sort: (row) => row.dueDate,
      csv: (row) => row.dueDate,
    },
    {
      key: 'days',
      header: 'Días vencida',
      align: 'right',
      render: (row) => {
        const days = daysOverdue(row.dueDate);
        return days > 0 ? <span className="font-medium text-critical">{days}</span> : '0';
      },
      sort: (row) => daysOverdue(row.dueDate),
      csv: (row) => daysOverdue(row.dueDate),
    },
    ...bucketColumns,
    {
      key: 'balance',
      header: 'Saldo',
      align: 'right',
      render: (row) => <Money value={row.balance} strong />,
      sort: (row) => Number(row.balance),
      csv: (row) => row.balance,
      total: (list) => <Money value={sumPesos(list.map((row) => row.balance))} strong />,
    },
  ];

  const partyColumns: QueryColumn<PartyRow>[] = [
    {
      key: 'name',
      header: partyLabel,
      className: 'font-medium',
      render: (row) => row.name,
      sort: (row) => row.name,
      csv: (row) => row.name,
    },
    {
      key: 'code',
      header: 'NIT / C.C.',
      className: 'tabular-nums text-ink-2',
      render: (row) => row.code,
      csv: (row) => row.code,
    },
    {
      key: 'documents',
      header: 'Documentos',
      align: 'right',
      render: (row) => row.documents,
      sort: (row) => row.documents,
      csv: (row) => row.documents,
      total: (list) => list.reduce((sum, row) => sum + row.documents, 0),
    },
    {
      key: 'oldest',
      header: 'Mayor atraso (días)',
      align: 'right',
      render: (row) =>
        row.oldest > 0 ? <span className="font-medium text-critical">{row.oldest}</span> : '0',
      sort: (row) => row.oldest,
      csv: (row) => row.oldest,
    },
    ...AGING_BUCKETS.map((bucket) => ({
      key: bucket.key,
      header: bucket.label,
      align: 'right' as const,
      render: (row: PartyRow) =>
        row.buckets[bucket.key] === 0n ? (
          <span className="text-ink-3">—</span>
        ) : (
          <span className={bucket.key === 'CURRENT' ? undefined : 'text-critical'}>
            <Money value={row.buckets[bucket.key]} />
          </span>
        ),
      sort: (row: PartyRow) => Number(row.buckets[bucket.key]),
      csv: (row: PartyRow) => row.buckets[bucket.key].toString(),
      total: (list: readonly PartyRow[]) => (
        <Money value={sumPesos(list.map((row) => row.buckets[bucket.key]))} />
      ),
    })),
    {
      key: 'balance',
      header: 'Saldo',
      align: 'right',
      render: (row) => <Money value={row.balance} strong />,
      sort: (row) => Number(row.balance),
      csv: (row) => row.balance.toString(),
      total: (list) => <Money value={sumPesos(list.map((row) => row.balance))} strong />,
    },
  ];

  return (
    <>
      {action ? (
        <DocumentToolbar
          actions={[{ label: action.label, icon: action.icon, to: action.to, primary: true }]}
        />
      ) : null}
      <ScreenTitle
        title={title}
        description={
          <>
            {description}{' '}
            {ver === 'tercero'
              ? `Enter o doble clic muestra las facturas del ${partyLabel.toLowerCase()}.`
              : `Enter o doble clic ${openLabel}.`}
          </>
        }
      />
      <FilterBar onSubmit={filters.submit}>
        <FilterField label={`${partyLabel} (nombre o NIT)`}>
          <input
            value={draft.tercero}
            onChange={(event) => {
              set('tercero', event.target.value);
            }}
            className={`${FILTER_INPUT} w-56`}
          />
        </FilterField>
        <FilterField label="Estado">
          <select
            value={draft.estado}
            onChange={(event) => {
              set('estado', event.target.value);
            }}
            className={FILTER_INPUT}
          >
            <option value="all">Todos los documentos abiertos</option>
            <option value="overdue">Solo vencidos</option>
            <option value="current">Solo al día</option>
          </select>
        </FilterField>
        <FilterField label="Ver">
          <select
            value={draft.ver}
            onChange={(event) => {
              set('ver', event.target.value);
            }}
            className={FILTER_INPUT}
          >
            <option value="documento">Detalle por documento</option>
            <option value="tercero">Resumen por {partyLabel.toLowerCase()}</option>
          </select>
        </FilterField>
      </FilterBar>
      {ver === 'tercero' ? (
        <QueryGrid
          title={`${title} por ${partyLabel.toLowerCase()}`}
          exportName={`${normalizeText(title).replace(/\s+/g, '-')}-por-tercero`}
          columns={partyColumns}
          rows={parties}
          rowKey={(row) => row.id}
          initialSort={{ key: 'balance', direction: 'desc' }}
          onOpen={(row) => {
            filters.apply({ tercero: row.code || row.name, ver: 'documento' });
          }}
          empty="No hay saldos abiertos con estos filtros."
        />
      ) : (
        <QueryGrid
          title={title}
          exportName={normalizeText(title).replace(/\s+/g, '-')}
          columns={documentColumns}
          rows={rows}
          rowKey={(row) => row.id}
          initialSort={{ key: 'due', direction: 'asc' }}
          onOpen={onOpen}
          empty="No hay documentos abiertos con estos filtros."
        />
      )}
    </>
  );
}
