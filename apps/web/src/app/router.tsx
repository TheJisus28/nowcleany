import type { ReactNode } from 'react';
import { createBrowserRouter, Navigate, useLocation } from 'react-router';
import { useSession } from '../auth/session';
import { EmptyState, Spinner } from '../components/ui';
import { LoginPage } from '../features/auth/login-page';
import { CatalogPage } from '../features/catalog/catalog-page';
import { InventoryPage } from '../features/inventory/inventory-page';
import { PlantPage } from '../features/plant/plant-page';
import { PurchasingPage } from '../features/purchasing/purchasing-page';
import { OrderDetailPage } from '../features/sales/order-detail-page';
import { OrderFormPage } from '../features/sales/order-form-page';
import { OrdersPage } from '../features/sales/orders-page';
import { SummaryPage } from '../features/summary/summary-page';
import { UsersPage } from '../features/users/users-page';
import { homeFor } from './nav';
import { Shell } from './shell';

function RequireSession({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const location = useLocation();
  if (status === 'loading') return <Spinner label="Abriendo tu sesión…" />;
  if (status === 'anonymous')
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const { can } = useSession();
  if (!can(permission)) {
    return (
      <EmptyState
        title="No tienes acceso a este panel"
        description="Pide a un administrador que te asigne el rol correspondiente."
      />
    );
  }
  return <>{children}</>;
}

function Home() {
  const { profile, can } = useSession();
  return <Navigate to={homeFor(profile?.roles ?? [], can)} replace />;
}

const guarded = (permission: string, element: ReactNode) => (
  <RequirePermission permission={permission}>{element}</RequirePermission>
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
      { path: 'resumen', element: guarded('planning:read', <SummaryPage />) },
      { path: 'ventas', element: guarded('sales-orders:read', <OrdersPage />) },
      { path: 'ventas/nueva', element: guarded('sales-orders:write', <OrderFormPage />) },
      { path: 'ventas/:id', element: guarded('sales-orders:read', <OrderDetailPage />) },
      { path: 'ventas/:id/editar', element: guarded('sales-orders:write', <OrderFormPage />) },
      { path: 'planta', element: guarded('production:read', <PlantPage />) },
      { path: 'compras', element: guarded('purchasing:read', <PurchasingPage />) },
      { path: 'inventario', element: guarded('inventory:read', <InventoryPage />) },
      { path: 'catalogo', element: guarded('products:read', <CatalogPage />) },
      { path: 'usuarios', element: guarded('users:read', <UsersPage />) },
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
