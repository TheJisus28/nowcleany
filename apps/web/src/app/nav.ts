import {
  BookOpen,
  CalendarRange,
  ChartColumn,
  ClipboardCheck,
  Contact,
  Factory,
  FileText,
  History,
  House,
  Inbox,
  Landmark,
  type LucideIcon,
  MapPinned,
  PackageCheck,
  ShoppingCart,
  Tags,
  Truck,
  Users,
  Warehouse,
  Building2,
} from 'lucide-react';

/** A work area. Each role sees only the panels it works with (see PANELS_BY_ROLE). */
export type Panel =
  | 'summary'
  | 'home'
  | 'tasks'
  | 'customers'
  | 'sales'
  | 'visits'
  | 'consolidation'
  | 'invoices'
  | 'plant'
  | 'shipments'
  | 'inventory'
  | 'monthlyPlan'
  | 'purchasing'
  | 'receiving'
  | 'suppliers'
  | 'finance'
  | 'trail'
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
      { panel: 'tasks', to: '/bandeja', label: 'Mi bandeja', icon: Inbox },
    ],
  },
  {
    label: 'Ventas',
    items: [
      { panel: 'customers', to: '/clientes', label: 'Clientes', icon: Contact },
      { panel: 'sales', to: '/ventas', label: 'Preventas', icon: Tags },
      { panel: 'visits', to: '/visitas', label: 'Visitas', icon: MapPinned },
      { panel: 'consolidation', to: '/consolidado', label: 'Consolidado', icon: ClipboardCheck },
      { panel: 'invoices', to: '/facturas', label: 'Facturas', icon: FileText },
    ],
  },
  {
    label: 'Operación',
    items: [
      { panel: 'plant', to: '/planta', label: 'Planta', icon: Factory },
      { panel: 'shipments', to: '/logistica', label: 'Logística y guías', icon: Truck },
      { panel: 'inventory', to: '/inventario', label: 'Existencias', icon: Warehouse },
    ],
  },
  {
    label: 'Compras',
    items: [
      { panel: 'monthlyPlan', to: '/compras/plan', label: 'Plan del mes', icon: CalendarRange },
      { panel: 'purchasing', to: '/compras', label: 'Órdenes de compra', icon: ShoppingCart },
      { panel: 'receiving', to: '/recepcion', label: 'Recepción de facturas', icon: PackageCheck },
      { panel: 'suppliers', to: '/proveedores', label: 'Proveedores', icon: Building2 },
    ],
  },
  {
    label: 'Contabilidad',
    items: [
      { panel: 'finance', to: '/contabilidad', label: 'Cobros y pagos', icon: Landmark },
      { panel: 'trail', to: '/traza', label: 'Traza', icon: History },
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
  admin: NAV.map((item) => item.panel).filter((panel) => panel !== 'home' && panel !== 'tasks'),
  manager: [
    'summary',
    'customers',
    'sales',
    'visits',
    'consolidation',
    'invoices',
    'plant',
    'shipments',
    'inventory',
    'monthlyPlan',
    'purchasing',
    'suppliers',
    'finance',
    'trail',
    'catalog',
  ],
  sales: ['home', 'customers', 'sales', 'visits'],
  consolidator: ['tasks', 'consolidation', 'invoices', 'sales', 'customers', 'inventory'],
  plant: ['tasks', 'plant', 'inventory', 'catalog'],
  logistics: ['tasks', 'shipments', 'sales', 'inventory'],
  purchasing: ['tasks', 'monthlyPlan', 'purchasing', 'suppliers', 'inventory'],
  receiving: ['tasks', 'receiving', 'purchasing', 'inventory'],
  accountant: ['tasks', 'finance', 'invoices', 'trail'],
};

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  manager: 'Gerencia',
  sales: 'Vendedor',
  consolidator: 'Consolidado y facturación',
  plant: 'Planta',
  logistics: 'Logística',
  purchasing: 'Compras',
  receiving: 'Recepción de compras',
  accountant: 'Contable',
};

/** The menu entry a path belongs to (detail pages belong to their list). */
export function navItemFor(pathname: string): (NavItem & { group: string | null }) | undefined {
  const aliases: Record<string, string> = { '/productos': '/catalogo' };
  const parts = pathname.split('/');
  const two = `/${parts[1] ?? ''}/${parts[2] ?? ''}`;
  const exact = NAV.find((item) => item.to === two);
  if (exact) return exact;
  const first = `/${parts[1] ?? ''}`;
  const base = aliases[first] ?? first;
  return NAV.find((item) => item.to === base);
}
