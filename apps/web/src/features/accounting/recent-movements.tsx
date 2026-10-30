import { useMemo } from 'react';
import { useFinance } from '../../api/hooks';
import type { FinanceSummary } from '../../api/types';
import { type QueryColumn, QueryGrid } from '../../components/erp';
import { QueryView } from '../../components/ui';
import { formatDate, todayIso } from '../../lib/format';
import { sumPesos } from '../billing/billing-format';
import { GridTitle, Money } from '../billing/erp-kit';

type Movement = FinanceSummary['movements'][number] & { key: string };

/** Cash receipts (IN) or disbursements (OUT) of the last 30 days, under the voucher document. */
export function RecentMovements({ direction }: { direction: 'IN' | 'OUT' }) {
  const finance = useFinance({ from: todayIso(-30), to: todayIso() });
  const rows = useMemo<Movement[]>(
    () =>
      (finance.data?.movements ?? [])
        .map((movement, index) => ({ ...movement, key: `${movement.date}-${String(index)}` }))
        .filter((movement) => movement.direction === direction),
    [finance.data, direction],
  );
  const title =
    direction === 'IN' ? 'Recibos de caja recientes' : 'Comprobantes de egreso recientes';
  const columns: QueryColumn<Movement>[] = [
    {
      key: 'date',
      header: 'Fecha',
      render: (row) => <span className="whitespace-nowrap">{formatDate(row.date)}</span>,
      sort: (row) => row.date,
      csv: (row) => row.date,
    },
    {
      key: 'party',
      header: direction === 'IN' ? 'Cliente' : 'Proveedor',
      render: (row) => row.party,
      sort: (row) => row.party,
      csv: (row) => row.party,
    },
    {
      key: 'document',
      header: 'Factura',
      className: 'whitespace-nowrap',
      render: (row) => row.document,
      sort: (row) => row.document,
      csv: (row) => row.document,
    },
    {
      key: 'method',
      header: 'Medio de pago',
      render: (row) => row.method,
      sort: (row) => row.method,
      csv: (row) => row.method,
    },
    {
      key: 'reference',
      header: 'Referencia',
      hideOnMobile: true,
      render: (row) => row.reference ?? <span className="text-ink-3">—</span>,
      csv: (row) => row.reference ?? '',
    },
    {
      key: 'amount',
      header: 'Valor',
      align: 'right',
      render: (row) => <Money value={row.amount} />,
      sort: (row) => Number(row.amount),
      csv: (row) => row.amount,
      total: (list) => <Money value={sumPesos(list.map((row) => row.amount))} strong />,
    },
    {
      key: 'recordedBy',
      header: 'Registró',
      hideOnMobile: true,
      render: (row) => <span className="text-ink-2">{row.recordedBy}</span>,
      sort: (row) => row.recordedBy,
      csv: (row) => row.recordedBy,
    },
  ];
  return (
    <div className="no-print">
      <GridTitle aside="Últimos 30 días">{title}</GridTitle>
      <QueryView query={finance}>
        {() => (
          <QueryGrid
            title={title}
            exportName={direction === 'IN' ? 'recibos-de-caja' : 'comprobantes-de-egreso'}
            columns={columns}
            rows={rows}
            rowKey={(row) => row.key}
            initialSort={{ key: 'date', direction: 'desc' }}
            pageSize={25}
            empty={
              direction === 'IN'
                ? 'Sin recibos de caja en los últimos 30 días.'
                : 'Sin comprobantes de egreso en los últimos 30 días.'
            }
          />
        )}
      </QueryView>
    </div>
  );
}
