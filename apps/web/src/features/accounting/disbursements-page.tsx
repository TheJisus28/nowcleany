import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../../api/client';
import { useSupplierInvoices, useSuppliers } from '../../api/hooks';
import { useAccess } from '../../app/access';
import { useSession } from '../../auth/session';
import { useWorkTab } from '../../components/erp';
import { EntityLink } from '../../components/links';
import { QueryView } from '../../components/ui';
import { type OpenDocument, PaymentVoucher } from './payment-voucher';
import { RecentMovements } from './recent-movements';

/** "Comprobante de egreso": a payment to a supplier applied to its open supplier invoices. */
export function DisbursementsPage() {
  useWorkTab('Comprobante de egreso');
  const { can } = useSession();
  const { has } = useAccess();
  const [params, setParams] = useSearchParams();
  const invoices = useSupplierInvoices({ open: true });
  const suppliers = useSuppliers(undefined, can('suppliers:read'));
  const documents = useMemo<OpenDocument[]>(() => {
    const nit = new Map((suppliers.data ?? []).map((item) => [item.id, item.documentNumber]));
    return (invoices.data ?? []).map((invoice) => ({
      id: invoice.id,
      partyId: invoice.supplier.id,
      partyName: invoice.supplier.name,
      partyCode: nit.get(invoice.supplier.id) ?? invoice.supplier.name,
      label: <span className="tabular-nums">N.º {invoice.documentNumber}</span>,
      labelText: `Factura ${invoice.documentNumber}`,
      reference: (
        <EntityLink to="purchase-order" id={invoice.purchaseOrder.id}>
          {invoice.purchaseOrder.label}
        </EntityLink>
      ),
      date: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      total: invoice.total,
      paid: invoice.paid,
      balance: invoice.balance,
    }));
  }, [invoices.data, suppliers.data]);
  return (
    <QueryView query={invoices}>
      {() => (
        <PaymentVoucher
          kind="Comprobante de egreso"
          partyLabel="Proveedor"
          documentHeader="Factura de proveedor"
          referenceHeader="Orden de compra"
          documents={documents}
          preselect={params.get('factura')}
          draftKey="disbursement"
          closeTo={has('payables') ? '/contabilidad/por-pagar' : '/'}
          pay={(id, body) => api.post(`/v1/supplier-invoices/${id}/payments`, { ...body })}
          onSaved={() => {
            if (params.has('factura')) setParams({}, { replace: true });
          }}
        >
          {can('finance:read') ? <RecentMovements direction="OUT" /> : null}
        </PaymentVoucher>
      )}
    </QueryView>
  );
}
