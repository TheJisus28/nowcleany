import { Banknote } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useSupplierInvoices, useSuppliers } from '../../api/hooks';
import { useAccess } from '../../app/access';
import { useSession } from '../../auth/session';
import { useWorkTab } from '../../components/erp';
import { EntityLink, pathTo } from '../../components/links';
import { QueryView } from '../../components/ui';
import { type AgingDocument, AgingConsultation } from './aging-grid';

/** "Cuentas por pagar": open supplier invoices by age; a row leads to the disbursement voucher. */
export function PayablesPage() {
  useWorkTab('Cuentas por pagar');
  const navigate = useNavigate();
  const { can } = useSession();
  const { has, canOpen } = useAccess();
  const canPay = can('payments:write') && has('disbursements');
  const invoices = useSupplierInvoices({ open: true });
  const suppliers = useSuppliers(undefined, can('suppliers:read'));
  const documents = useMemo<AgingDocument[]>(() => {
    const nit = new Map((suppliers.data ?? []).map((item) => [item.id, item.documentNumber]));
    return (invoices.data ?? []).map((invoice) => ({
      id: invoice.id,
      partyId: invoice.supplier.id,
      partyName: invoice.supplier.name,
      partyCode: nit.get(invoice.supplier.id) ?? '',
      label: <span className="tabular-nums">N.º {invoice.documentNumber}</span>,
      labelText: `Factura ${invoice.documentNumber}`,
      reference: (
        <EntityLink to="purchase-order" id={invoice.purchaseOrder.id}>
          {invoice.purchaseOrder.label}
        </EntityLink>
      ),
      referenceText: invoice.purchaseOrder.label,
      date: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      total: invoice.total,
      balance: invoice.balance,
    }));
  }, [invoices.data, suppliers.data]);
  const byId = useMemo(
    () => new Map((invoices.data ?? []).map((invoice) => [invoice.id, invoice])),
    [invoices.data],
  );
  return (
    <QueryView query={invoices}>
      {() => (
        <AgingConsultation
          title="Cuentas por pagar"
          description="Facturas de proveedor con saldo por pagar, por antigüedad de vencimiento."
          partyLabel="Proveedor"
          documentHeader="Factura de proveedor"
          referenceHeader="Orden de compra"
          documents={documents}
          openLabel={
            canPay ? 'registra el comprobante de egreso de la factura' : 'abre la orden de compra'
          }
          onOpen={(document) => {
            if (canPay) {
              void navigate(`/contabilidad/egresos?factura=${document.id}`);
              return;
            }
            const invoice = byId.get(document.id);
            if (invoice && canOpen('purchase-order'))
              void navigate(pathTo('purchase-order', invoice.purchaseOrder.id));
          }}
          action={
            canPay
              ? {
                  label: 'Registrar comprobante de egreso',
                  icon: Banknote,
                  to: '/contabilidad/egresos',
                }
              : null
          }
        />
      )}
    </QueryView>
  );
}
