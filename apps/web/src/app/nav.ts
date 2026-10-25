import {
  BookOpen,
  ChartColumn,
  Factory,
  type LucideIcon,
  ShoppingCart,
  Tags,
  Users,
  Warehouse,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission: string;
}

/** Panels, in menu order. Each one is shown only to whoever holds its permission. */
export const NAV: readonly NavItem[] = [
  { to: '/resumen', label: 'Resumen', icon: ChartColumn, permission: 'planning:read' },
  { to: '/ventas', label: 'Ventas', icon: Tags, permission: 'sales-orders:read' },
  { to: '/planta', label: 'Planta', icon: Factory, permission: 'production:read' },
  { to: '/compras', label: 'Compras', icon: ShoppingCart, permission: 'purchasing:read' },
  { to: '/inventario', label: 'Inventario', icon: Warehouse, permission: 'inventory:read' },
  { to: '/catalogo', label: 'Catálogo', icon: BookOpen, permission: 'products:read' },
  { to: '/usuarios', label: 'Usuarios', icon: Users, permission: 'users:read' },
];

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

/** Where each role lands after signing in: its own panel first. */
const HOME_BY_ROLE: readonly [role: string, path: string][] = [
  ['admin', '/resumen'],
  ['manager', '/resumen'],
  ['sales', '/ventas'],
  ['plant', '/planta'],
  ['purchasing', '/compras'],
  ['warehouse', '/inventario'],
  ['technical_lead', '/catalogo'],
  ['formulator', '/catalogo'],
];

export function homeFor(roles: readonly string[], can: (permission: string) => boolean): string {
  const byRole = HOME_BY_ROLE.find(([role]) => roles.includes(role))?.[1];
  if (byRole) return byRole;
  return NAV.find((item) => can(item.permission))?.to ?? '/sin-acceso';
}
