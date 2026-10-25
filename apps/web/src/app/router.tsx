import type { ReactNode } from 'react';
import { createBrowserRouter, Navigate, useLocation } from 'react-router';
import { useSession } from '../auth/session';
import { EmptyState, Spinner } from '../components/ui';
import { LoginPage } from '../features/auth/login-page';
import { CatalogPage } from '../features/catalog/catalog-page';
import { CustomerPage } from '../features/customers/customer-page';
import { CustomersPage } from '../features/customers/customers-page';
import { InventoryPage } from '../features/inventory/inventory-page';
import { PlantPage } from '../features/plant/plant-page';
import { ProductionOrderPage } from '../features/plant/production-order-page';
import { ProductPage } from '../features/products/product-page';
import { PurchaseOrderPage } from '../features/purchasing/purchase-order-page';
import { PurchasingPage } from '../features/purchasing/purchasing-page';
import { OrderDetailPage } from '../features/sales/order-detail-page';
import { OrderFormPage } from '../features/sales/order-form-page';
import { OrdersPage } from '../features/sales/orders-page';
import { SalesHomePage } from '../features/sales/sales-home-page';
import { SummaryPage } from '../features/summary/summary-page';
import { UsersPage } from '../features/users/users-page';
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
      { path: 'resumen', element: panel('summary', <SummaryPage />) },
      { path: 'inicio', element: panel('home', <SalesHomePage />) },
      { path: 'ventas', element: panel('sales', <OrdersPage />) },
      { path: 'ventas/nueva', element: panel('sales', <OrderFormPage />, 'sales-orders:write') },
      { path: 'ventas/:id', element: entity('order', <OrderDetailPage />) },
      {
        path: 'ventas/:id/editar',
        element: panel('sales', <OrderFormPage />, 'sales-orders:write'),
      },
      { path: 'clientes', element: panel('customers', <CustomersPage />) },
      { path: 'clientes/:id', element: entity('customer', <CustomerPage />) },
      { path: 'planta', element: panel('plant', <PlantPage />) },
      { path: 'planta/ordenes/:id', element: entity('production-order', <ProductionOrderPage />) },
      { path: 'compras', element: panel('purchasing', <PurchasingPage />) },
      { path: 'compras/ordenes/:id', element: entity('purchase-order', <PurchaseOrderPage />) },
      { path: 'inventario', element: panel('inventory', <InventoryPage />) },
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
