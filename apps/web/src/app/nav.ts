import {
  BookOpen,
  ChartColumn,
  Contact,
  Factory,
  House,
  type LucideIcon,
  ShoppingCart,
  Tags,
  Users,
  Warehouse,
} from 'lucide-react';

/** A work area. Each role sees only the panels it works with (see PANELS_BY_ROLE). */
export type Panel =
  | 'summary'
  | 'home'
  | 'sales'
  | 'customers'
  | 'plant'
  | 'purchasing'
  | 'inventory'
  | 'catalog'
  | 'users';

export interface NavItem {
  panel: Panel;
  to: string;
  label: string;
  icon: LucideIcon;
}

/** Menu order; a role's home is the first panel it has. */
export const NAV: readonly NavItem[] = [
  { panel: 'summary', to: '/resumen', label: 'Resumen', icon: ChartColumn },
  { panel: 'home', to: '/inicio', label: 'Inicio', icon: House },
  { panel: 'sales', to: '/ventas', label: 'Preventas', icon: Tags },
  { panel: 'customers', to: '/clientes', label: 'Clientes', icon: Contact },
  { panel: 'plant', to: '/planta', label: 'Planta', icon: Factory },
  { panel: 'purchasing', to: '/compras', label: 'Compras', icon: ShoppingCart },
  { panel: 'inventory', to: '/inventario', label: 'Inventario', icon: Warehouse },
  { panel: 'catalog', to: '/catalogo', label: 'Catálogo', icon: BookOpen },
  { panel: 'users', to: '/usuarios', label: 'Usuarios', icon: Users },
];

/**
 * What each role works with day to day. Read permissions are broader on purpose (planning reads
 * every module, a seller may read stock), but the menu and the links only open these panels.
 * The API still enforces every permission: this decides what is shown, not what is allowed.
 */
export const PANELS_BY_ROLE: Record<string, readonly Panel[]> = {
  admin: ['summary', 'sales', 'customers', 'plant', 'purchasing', 'inventory', 'catalog', 'users'],
  manager: ['summary', 'sales', 'customers', 'plant', 'purchasing', 'inventory', 'catalog'],
  sales: ['home', 'sales', 'customers'],
  plant: ['plant', 'inventory', 'catalog'],
  purchasing: ['purchasing', 'inventory'],
  warehouse: ['inventory'],
  technical_lead: ['catalog'],
  formulator: ['catalog'],
};

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  manager: 'Gerencia',
  formulator: 'Formulador',
  technical_lead: 'Jefe técnico',
  sales: 'Ventas',
  plant: 'Planta',
  purchasing: 'Compras',
  warehouse: 'Bodega',
};
