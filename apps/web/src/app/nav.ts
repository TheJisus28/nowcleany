import {
  BookOpen,
  ChartColumn,
  Contact,
  Factory,
  House,
  type LucideIcon,
  MapPinned,
  ShoppingCart,
  Tags,
  Truck,
  Users,
  Warehouse,
} from 'lucide-react';

/** A work area. Each role sees only the panels it works with (see PANELS_BY_ROLE). */
export type Panel =
  | 'summary'
  | 'home'
  | 'customers'
  | 'sales'
  | 'visits'
  | 'plant'
  | 'inventory'
  | 'purchasing'
  | 'suppliers'
  | 'catalog'
  | 'users';

export interface NavItem {
  panel: Panel;
  to: string;
  label: string;
  icon: LucideIcon;
}

/** An ERP module: the menu groups its panels under it. */
export interface NavGroup {
  /** Null for the first group (the role's start page needs no heading). */
  label: string | null;
  items: readonly NavItem[];
}

/** Menu order; a role's home is the first panel it has. */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: null,
    items: [
      { panel: 'summary', to: '/resumen', label: 'Resumen', icon: ChartColumn },
      { panel: 'home', to: '/inicio', label: 'Mi día', icon: House },
    ],
  },
  {
    label: 'Ventas',
    items: [
      { panel: 'customers', to: '/clientes', label: 'Clientes', icon: Contact },
      { panel: 'sales', to: '/ventas', label: 'Preventas', icon: Tags },
      { panel: 'visits', to: '/visitas', label: 'Visitas', icon: MapPinned },
    ],
  },
  {
    label: 'Producción',
    items: [{ panel: 'plant', to: '/planta', label: 'Planta', icon: Factory }],
  },
  {
    label: 'Inventario',
    items: [{ panel: 'inventory', to: '/inventario', label: 'Existencias', icon: Warehouse }],
  },
  {
    label: 'Compras',
    items: [
      { panel: 'purchasing', to: '/compras', label: 'Necesidades y órdenes', icon: ShoppingCart },
      { panel: 'suppliers', to: '/proveedores', label: 'Proveedores', icon: Truck },
    ],
  },
  {
    label: 'Catálogo',
    items: [{ panel: 'catalog', to: '/catalogo', label: 'Productos y fórmulas', icon: BookOpen }],
  },
  {
    label: 'Administración',
    items: [{ panel: 'users', to: '/usuarios', label: 'Usuarios', icon: Users }],
  },
];

export const NAV: readonly (NavItem & { group: string | null })[] = NAV_GROUPS.flatMap((group) =>
  group.items.map((item) => ({ ...item, group: group.label })),
);

/**
 * What each role works with day to day. Read permissions are broader on purpose (planning reads
 * every module, a seller may read stock), but the menu and the links only open these panels.
 * The API still enforces every permission: this decides what is shown, not what is allowed.
 */
export const PANELS_BY_ROLE: Record<string, readonly Panel[]> = {
  admin: NAV.map((item) => item.panel).filter((panel) => panel !== 'home'),
  manager: [
    'summary',
    'customers',
    'sales',
    'visits',
    'plant',
    'inventory',
    'purchasing',
    'suppliers',
    'catalog',
  ],
  sales: ['home', 'customers', 'sales', 'visits'],
  plant: ['plant', 'inventory', 'catalog'],
  purchasing: ['purchasing', 'suppliers', 'inventory'],
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

/** The menu entry a path belongs to (detail pages belong to their list). */
export function navItemFor(pathname: string): (NavItem & { group: string | null }) | undefined {
  const aliases: Record<string, string> = { '/productos': '/catalogo' };
  const first = `/${pathname.split('/')[1] ?? ''}`;
  const base = aliases[first] ?? first;
  return NAV.find((item) => item.to === base);
}
