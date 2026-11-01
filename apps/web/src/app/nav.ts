import {
  BadgeDollarSign,
  BookOpen,
  Building2,
  ChartColumn,
  ClipboardCheck,
  Contact,
  Factory,
  FilePlus2,
  FileText,
  Gauge,
  HandCoins,
  History,
  House,
  Inbox,
  type LucideIcon,
  MapPinned,
  NotebookTabs,
  PackageCheck,
  PackageSearch,
  Receipt,
  ScrollText,
  ShoppingCart,
  Tags,
  TrendingDown,
  Truck,
  Users,
  Wallet,
  Warehouse,
  Wrench,
} from 'lucide-react';

/** A work area. Each role sees only the panels it works with (see PANELS_BY_ROLE). */
export type Panel =
  | 'operations'
  | 'tasks'
  | 'home'
  | 'newOrder'
  | 'consolidation'
  | 'sales'
  | 'invoices'
  | 'visits'
  | 'customers'
  | 'plant'
  | 'production'
  | 'catalog'
  | 'shipments'
  | 'inventory'
  | 'kardex'
  | 'inventoryDocs'
  | 'warehouses'
  | 'purchasing'
  | 'receiving'
  | 'monthlyPlan'
  | 'suppliers'
  | 'receipts'
  | 'disbursements'
  | 'receivables'
  | 'payables'
  | 'finance'
  | 'trail'
  | 'oversell'
  | 'users';

export interface NavItem {
  panel: Panel;
  to: string;
  label: string;
  icon: LucideIcon;
}

export type SectionKind = 'Documentos' | 'Consultas' | 'Informes' | 'Maestros';

/** An ERP module: its options grouped as Documentos / Consultas / Informes / Maestros. */
export interface NavGroup {
  /** Null for the start group (the role's landing page needs no heading). */
  label: string | null;
  icon?: LucideIcon;
  sections: readonly { kind: SectionKind | null; items: readonly NavItem[] }[];
}

/** Menu tree; a role's home is the first panel it has. */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: null,
    sections: [
      {
        kind: null,
        items: [
          { panel: 'operations', to: '/operacion', label: 'Tablero de operación', icon: Gauge },
          { panel: 'tasks', to: '/pendientes', label: 'Pendientes', icon: Inbox },
          { panel: 'home', to: '/inicio', label: 'Mi día', icon: House },
        ],
      },
    ],
  },
  {
    label: 'Ventas',
    icon: Tags,
    sections: [
      {
        kind: 'Documentos',
        items: [
          { panel: 'newOrder', to: '/ventas/nueva', label: 'Pedido (preventa)', icon: FilePlus2 },
          {
            panel: 'consolidation',
            to: '/consolidado',
            label: 'Facturación de pedidos',
            icon: ClipboardCheck,
          },
        ],
      },
      {
        kind: 'Consultas',
        items: [
          { panel: 'sales', to: '/ventas', label: 'Pedidos', icon: NotebookTabs },
          { panel: 'invoices', to: '/facturas', label: 'Facturas y remisiones', icon: FileText },
          { panel: 'visits', to: '/visitas', label: 'Visitas de vendedores', icon: MapPinned },
        ],
      },
      {
        kind: 'Maestros',
        items: [{ panel: 'customers', to: '/clientes', label: 'Clientes', icon: Contact }],
      },
    ],
  },
  {
    label: 'Producción',
    icon: Factory,
    sections: [
      {
        kind: 'Documentos',
        items: [
          { panel: 'plant', to: '/planta', label: 'Alistamiento de pedidos', icon: PackageCheck },
          {
            panel: 'production',
            to: '/planta/produccion',
            label: 'Órdenes de producción',
            icon: Factory,
          },
        ],
      },
      {
        kind: 'Maestros',
        items: [
          { panel: 'catalog', to: '/catalogo', label: 'Productos y fórmulas', icon: BookOpen },
        ],
      },
    ],
  },
  {
    label: 'Logística',
    icon: Truck,
    sections: [
      {
        kind: 'Documentos',
        items: [{ panel: 'shipments', to: '/logistica', label: 'Guías de despacho', icon: Truck }],
      },
    ],
  },
  {
    label: 'Inventario',
    icon: Warehouse,
    sections: [
      {
        kind: 'Documentos',
        items: [
          {
            panel: 'inventoryDocs',
            to: '/inventario/documentos',
            label: 'Ajustes, traslados y mermas',
            icon: Wrench,
          },
        ],
      },
      {
        kind: 'Consultas',
        items: [
          { panel: 'inventory', to: '/inventario', label: 'Existencias', icon: Warehouse },
          { panel: 'kardex', to: '/inventario/kardex', label: 'Kárdex', icon: PackageSearch },
        ],
      },
      {
        kind: 'Maestros',
        items: [
          { panel: 'warehouses', to: '/inventario/bodegas', label: 'Bodegas', icon: Warehouse },
        ],
      },
    ],
  },
  {
    label: 'Compras',
    icon: ShoppingCart,
    sections: [
      {
        kind: 'Documentos',
        items: [
          { panel: 'purchasing', to: '/compras', label: 'Órdenes de compra', icon: ShoppingCart },
          {
            panel: 'receiving',
            to: '/recepcion',
            label: 'Entradas de almacén',
            icon: PackageCheck,
          },
        ],
      },
      {
        kind: 'Informes',
        items: [
          {
            panel: 'monthlyPlan',
            to: '/compras/plan',
            label: 'Plan de compras del mes',
            icon: ChartColumn,
          },
        ],
      },
      {
        kind: 'Maestros',
        items: [{ panel: 'suppliers', to: '/proveedores', label: 'Proveedores', icon: Building2 }],
      },
    ],
  },
  {
    label: 'Contabilidad',
    icon: BadgeDollarSign,
    sections: [
      {
        kind: 'Documentos',
        items: [
          {
            panel: 'receipts',
            to: '/contabilidad/recibos',
            label: 'Recibos de caja',
            icon: Receipt,
          },
          {
            panel: 'disbursements',
            to: '/contabilidad/egresos',
            label: 'Comprobantes de egreso',
            icon: HandCoins,
          },
        ],
      },
      {
        kind: 'Consultas',
        items: [
          { panel: 'receivables', to: '/contabilidad/cartera', label: 'Cartera', icon: Wallet },
          {
            panel: 'payables',
            to: '/contabilidad/por-pagar',
            label: 'Cuentas por pagar',
            icon: ScrollText,
          },
        ],
      },
      {
        kind: 'Informes',
        items: [
          { panel: 'finance', to: '/contabilidad', label: 'Cobros y pagos', icon: ChartColumn },
          { panel: 'trail', to: '/traza', label: 'Auditoría (traza)', icon: History },
        ],
      },
    ],
  },
  {
    label: 'Gerencia',
    icon: Gauge,
    sections: [
      {
        kind: 'Informes',
        items: [
          {
            panel: 'oversell',
            to: '/informes/sobreventa',
            label: 'Sobreventa y cobertura',
            icon: TrendingDown,
          },
        ],
      },
    ],
  },
  {
    label: 'Administración',
    icon: Users,
    sections: [
      {
        kind: 'Maestros',
        items: [{ panel: 'users', to: '/usuarios', label: 'Usuarios', icon: Users }],
      },
    ],
  },
];

export const NAV: readonly (NavItem & { group: string | null; kind: SectionKind | null })[] =
  NAV_GROUPS.flatMap((group) =>
    group.sections.flatMap((section) =>
      section.items.map((item) => ({ ...item, group: group.label, kind: section.kind })),
    ),
  );

/**
 * What each role works with day to day. Read permissions are broader on purpose (planning reads
 * every module, a seller may read stock), but the menu and the links only open these panels.
 * The API still enforces every permission: this decides what is shown, not what is allowed.
 */
export const PANELS_BY_ROLE: Record<string, readonly Panel[]> = {
  admin: NAV.map((item) => item.panel).filter((panel) => panel !== 'home' && panel !== 'tasks'),
  manager: [
    'operations',
    'consolidation',
    'sales',
    'invoices',
    'visits',
    'customers',
    'plant',
    'production',
    'catalog',
    'shipments',
    'inventory',
    'kardex',
    'warehouses',
    'purchasing',
    'monthlyPlan',
    'suppliers',
    'receivables',
    'payables',
    'finance',
    'trail',
    'oversell',
  ],
  sales: ['home', 'newOrder', 'sales', 'visits', 'customers'],
  consolidator: ['tasks', 'consolidation', 'sales', 'invoices', 'customers', 'inventory'],
  plant: [
    'tasks',
    'plant',
    'production',
    'catalog',
    'inventory',
    'kardex',
    'inventoryDocs',
    'warehouses',
  ],
  logistics: ['tasks', 'shipments', 'sales', 'inventory', 'kardex', 'inventoryDocs', 'warehouses'],
  purchasing: ['tasks', 'purchasing', 'monthlyPlan', 'suppliers', 'inventory', 'kardex'],
  receiving: ['tasks', 'receiving', 'purchasing', 'inventory', 'kardex', 'warehouses'],
  accountant: [
    'tasks',
    'receipts',
    'disbursements',
    'receivables',
    'payables',
    'finance',
    'invoices',
    'trail',
  ],
};

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  manager: 'Gerencia',
  sales: 'Vendedor',
  consolidator: 'Facturación',
  plant: 'Planta',
  logistics: 'Logística',
  purchasing: 'Compras',
  receiving: 'Recepción de compras',
  accountant: 'Contable',
};

/** The menu entry a path belongs to (the longest matching route; detail pages belong to their list). */
export function navItemFor(
  pathname: string,
): (NavItem & { group: string | null; kind: SectionKind | null }) | undefined {
  const aliases: Record<string, string> = { '/productos': '/catalogo', '/resumen': '/operacion' };
  const first = `/${pathname.split('/')[1] ?? ''}`;
  const path = aliases[first] ? pathname.replace(first, aliases[first]) : pathname;
  return [...NAV]
    .filter((item) => path === item.to || path.startsWith(`${item.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0];
}
