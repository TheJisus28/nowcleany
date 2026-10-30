import { HandCoins } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useInvoices } from '../../api/hooks';
import { useAccess } from '../../app/access';
import { useSession } from '../../auth/session';
import { useWorkTab } from '../../components/erp';
import { EntityLink, pathTo } from '../../components/links';
import { QueryView } from '../../components/ui';
import { colombiaDay } from '../billing/billing-format';
import { type AgingDocument, AgingConsultation } from './aging-grid';

/** "Cartera": open sales invoices by age; a row leads to the cash receipt. */
export function ReceivablesPage() {
  useWorkTab('Cartera');
  const navigate = useNavigate();
  const { can } = useSession();
  const { has } = useAccess();
  const canCollect = can('payments:write') && has('receipts');
  const invoices = useInvoices({ open: true, limit: '2000' });
  const documents = useMemo<AgingDocument[]>(
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
        referenceText: invoice.order.label,
        seller: invoice.seller.name,
        date: colombiaDay(invoice.issuedAt),
        dueDate: invoice.dueDate,
        total: invoice.total,
        balance: invoice.balance,
      })),
    [invoices.data],
  );
  return (
    <QueryView query={invoices}>
      {() => (
        <AgingConsultation
          title="Cartera"
          description="Facturas de venta con saldo por cobrar, por antigüedad de vencimiento."
          partyLabel="Cliente"
          documentHeader="Factura"
          referenceHeader="Pedido"
          documents={documents}
          showSeller
          openLabel={canCollect ? 'registra el recibo de caja de la factura' : 'abre la factura'}
          onOpen={(document) => {
            void navigate(
              canCollect
                ? `/contabilidad/recibos?factura=${document.id}`
                : pathTo('invoice', document.id),
            );
          }}
          action={
            canCollect
              ? { label: 'Registrar recibo de caja', icon: HandCoins, to: '/contabilidad/recibos' }
              : null
          }
        />
      )}
    </QueryView>
  );
}
