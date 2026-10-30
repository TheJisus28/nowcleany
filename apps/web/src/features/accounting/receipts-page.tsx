import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../../api/client';
import { useInvoices } from '../../api/hooks';
import { useAccess } from '../../app/access';
import { useSession } from '../../auth/session';
import { useWorkTab } from '../../components/erp';
import { EntityLink } from '../../components/links';
import { QueryView } from '../../components/ui';
import { colombiaDay } from '../billing/billing-format';
import { type OpenDocument, PaymentVoucher } from './payment-voucher';
import { RecentMovements } from './recent-movements';

/** "Recibo de caja": a customer's payment applied to one or several open sales invoices. */
export function ReceiptsPage() {
  useWorkTab('Recibo de caja');
  const { can } = useSession();
  const { has } = useAccess();
  const [params, setParams] = useSearchParams();
  const invoices = useInvoices({ open: true, limit: '2000' });
  const documents = useMemo<OpenDocument[]>(
    () =>
      (invoices.data ?? []).map((invoice) => ({
        id: invoice.id,
        partyId: invoice.customer.id,
        partyName: invoice.customer.name,
        partyCode: invoice.customer.document,
        label: (
          <EntityLink to="invoice" id={invoice.id}>
            {invoice.label}
          </EntityLink>
        ),
        labelText: invoice.label,
        reference: (
          <EntityLink to="order" id={invoice.order.id}>
            {invoice.order.label}
          </EntityLink>
        ),
        date: colombiaDay(invoice.issuedAt),
        dueDate: invoice.dueDate,
        total: invoice.total,
        paid: invoice.paid,
        balance: invoice.balance,
      })),
    [invoices.data],
  );
  return (
    <QueryView query={invoices}>
      {() => (
        <PaymentVoucher
          kind="Recibo de caja"
          partyLabel="Cliente"
          documentHeader="Factura de venta"
          referenceHeader="Pedido"
          documents={documents}
          preselect={params.get('factura')}
          draftKey="receipt"
          closeTo={has('receivables') ? '/contabilidad/cartera' : '/'}
          pay={(id, body) => api.post(`/v1/invoices/${id}/payments`, { ...body })}
          onSaved={() => {
            if (params.has('factura')) setParams({}, { replace: true });
          }}
        >
          {can('finance:read') ? <RecentMovements direction="IN" /> : null}
        </PaymentVoucher>
      )}
    </QueryView>
  );
}
