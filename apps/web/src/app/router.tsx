import type { ReactNode } from 'react';
import { createBrowserRouter, Navigate, useLocation } from 'react-router';
import { useSession } from '../auth/session';
import { EmptyDesk } from '../components/erp/work-tabs';
import { EmptyState, Spinner } from '../components/ui';
import { LoginPage } from '../features/auth/login-page';
import { DisbursementsPage } from '../features/accounting/disbursements-page';
import { FinancePage } from '../features/accounting/finance-page';
import { PayablesPage } from '../features/accounting/payables-page';
import { ReceiptsPage } from '../features/accounting/receipts-page';
import { ReceivablesPage } from '../features/accounting/receivables-page';
import { TrailPage } from '../features/accounting/trail-page';
import { ConsolidationPage } from '../features/billing/consolidation-page';
import { InvoicePage } from '../features/billing/invoice-page';
import { InvoicesPage } from '../features/billing/invoices-page';
import { CatalogPage } from '../features/catalog/catalog-page';
import { CustomerPage } from '../features/customers/customer-page';
import { CustomersPage } from '../features/customers/customers-page';
import { InventoryDocsPage } from '../features/inventory/inventory-docs-page';
import { InventoryPage } from '../features/inventory/inventory-page';
import { KardexPage } from '../features/inventory/kardex-page';
import { ShipmentFormPage } from '../features/logistics/shipment-form-page';
import { ShipmentPage } from '../features/logistics/shipment-page';
import { ShipmentsPage } from '../features/logistics/shipments-page';
import { OperationsPage } from '../features/operations/operations-page';
import { PlantPage } from '../features/plant/plant-page';
import { PreparePage } from '../features/plant/prepare-page';
import { ProductionOrderFormPage } from '../features/plant/production-order-form-page';
import { ProductionPage } from '../features/plant/production-page';
import { ProductionOrderPage } from '../features/plant/production-order-page';
import { ProductPage } from '../features/products/product-page';
import { EntryFormPage } from '../features/purchasing/entry-form-page';
import { MonthlyPlanPage } from '../features/purchasing/monthly-plan-page';
import { PurchaseOrderFormPage } from '../features/purchasing/purchase-order-form-page';
import { PurchaseOrderPage } from '../features/purchasing/purchase-order-page';
import { PurchasingPage } from '../features/purchasing/purchasing-page';
import { ReceivingPage } from '../features/purchasing/receiving-page';
import { SuppliersPage } from '../features/purchasing/suppliers-page';
import { OrderDetailPage } from '../features/sales/order-detail-page';
import { OrderFormPage } from '../features/sales/order-form-page';
import { OrdersPage } from '../features/sales/orders-page';
import { SalesHomePage } from '../features/sales/sales-home-page';
import { SummaryPage } from '../features/summary/summary-page';
import { TasksPage } from '../features/tasks/tasks-page';
import { UsersPage } from '../features/users/users-page';
import { VisitsPage } from '../features/visits/visits-page';
import { type Entity, useAccess } from './access';
import type { Panel } from './nav';
import { Shell } from './shell';

function RequireSession({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const location = useLocation();
  if (status === 'loading') return <Spinner label="Abriendo tu sesión…" />;
  if (status === 'anonymous')
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function NoAccess() {
  return (
    <EmptyState
      title="Este panel no es parte de tu trabajo"
      description="Si lo necesitas, pide a un administrador que te asigne el rol correspondiente."
    />
  );
}

function RequirePanel({
  panel,
  permission,
  children,
}: {
  panel: Panel;
  permission?: string;
  children: ReactNode;
}) {
  const { has } = useAccess();
  const { can } = useSession();
  if (!has(panel) || (permission && !can(permission))) return <NoAccess />;
  return <>{children}</>;
}

function RequireEntity({ entity, children }: { entity: Entity; children: ReactNode }) {
  const { canOpen } = useAccess();
  return canOpen(entity) ? <>{children}</> : <NoAccess />;
}

function Home() {
  const { home } = useAccess();
  return <Navigate to={home} replace />;
}

const panel = (key: Panel, element: ReactNode, permission?: string) => (
  <RequirePanel panel={key} {...(permission ? { permission } : {})}>
    {element}
  </RequirePanel>
);

const entity = (key: Entity, element: ReactNode) => (
  <RequireEntity entity={key}>{element}</RequireEntity>
);

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <RequireSession>
        <Shell />
      </RequireSession>
    ),
    children: [
      { index: true, element: <Home /> },
      { path: 'escritorio', element: <EmptyDesk /> },
      { path: 'operacion', element: panel('operations', <OperationsPage />) },
      { path: 'resumen', element: <Navigate to="/operacion" replace /> },
      { path: 'informes/sobreventa', element: panel('oversell', <SummaryPage />) },
      { path: 'pendientes', element: panel('tasks', <TasksPage />) },
      { path: 'bandeja', element: <Navigate to="/pendientes" replace /> },
      { path: 'inicio', element: panel('home', <SalesHomePage />) },
      { path: 'consolidado', element: panel('consolidation', <ConsolidationPage />) },
      { path: 'facturas', element: panel('invoices', <InvoicesPage />) },
      { path: 'facturas/:id', element: entity('invoice', <InvoicePage />) },
      { path: 'logistica', element: panel('shipments', <ShipmentsPage />) },
      {
        path: 'logistica/nueva',
        element: panel('shipments', <ShipmentFormPage />, 'shipments:write'),
      },
      { path: 'logistica/guias/:id', element: entity('shipment', <ShipmentPage />) },
      { path: 'compras/plan', element: panel('monthlyPlan', <MonthlyPlanPage />) },
      { path: 'recepcion', element: panel('receiving', <ReceivingPage />) },
      {
        path: 'recepcion/nueva',
        element: panel('receiving', <EntryFormPage />, 'purchasing:receive'),
      },
      { path: 'contabilidad', element: panel('finance', <FinancePage />) },
      { path: 'contabilidad/recibos', element: panel('receipts', <ReceiptsPage />) },
      { path: 'contabilidad/egresos', element: panel('disbursements', <DisbursementsPage />) },
      { path: 'contabilidad/cartera', element: panel('receivables', <ReceivablesPage />) },
      { path: 'contabilidad/por-pagar', element: panel('payables', <PayablesPage />) },
      { path: 'traza', element: panel('trail', <TrailPage />) },
      { path: 'ventas', element: panel('sales', <OrdersPage />) },
      { path: 'ventas/nueva', element: panel('newOrder', <OrderFormPage />, 'sales-orders:write') },
      { path: 'ventas/:id', element: entity('order', <OrderDetailPage />) },
      {
        path: 'ventas/:id/editar',
        element: panel('sales', <OrderFormPage />, 'sales-orders:write'),
      },
      { path: 'clientes', element: panel('customers', <CustomersPage />) },
      { path: 'clientes/:id', element: entity('customer', <CustomerPage />) },
      { path: 'visitas', element: panel('visits', <VisitsPage />) },
      { path: 'planta', element: panel('plant', <PlantPage />) },
      { path: 'planta/produccion', element: panel('production', <ProductionPage />) },
      {
        path: 'planta/produccion/nueva',
        element: panel('production', <ProductionOrderFormPage />, 'production:write'),
      },
      {
        path: 'planta/alistar/:id',
        element: panel('plant', <PreparePage />, 'sales-orders:prepare'),
      },
      { path: 'planta/ordenes/:id', element: entity('production-order', <ProductionOrderPage />) },
      { path: 'compras', element: panel('purchasing', <PurchasingPage />) },
      {
        path: 'compras/nueva',
        element: panel('purchasing', <PurchaseOrderFormPage />, 'purchasing:write'),
      },
      { path: 'compras/ordenes/:id', element: entity('purchase-order', <PurchaseOrderPage />) },
      { path: 'proveedores', element: panel('suppliers', <SuppliersPage />) },
      { path: 'inventario', element: panel('inventory', <InventoryPage />) },
      { path: 'inventario/kardex', element: panel('kardex', <KardexPage />) },
      { path: 'inventario/documentos', element: panel('inventoryDocs', <InventoryDocsPage />) },
      { path: 'productos/:id', element: entity('product', <ProductPage />) },
      { path: 'catalogo', element: panel('catalog', <CatalogPage />) },
      { path: 'usuarios', element: panel('users', <UsersPage />) },
      {
        path: '*',
        element: (
          <EmptyState
            title="Esta página no existe"
            description="Revisa la dirección o vuelve al menú."
          />
        ),
      },
    ],
  },
]);
