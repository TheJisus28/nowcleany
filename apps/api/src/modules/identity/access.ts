/**
 * Roles and permissions, in code. A route declares `@Permission('<code>')`; a user holds the
 * permissions of their roles (the administrator holds all of them).
 */

export const ROLES = [
  {
    code: 'admin',
    name: 'Administrador',
    description: 'Acceso total, incluida la administración de usuarios.',
  },
  {
    code: 'manager',
    name: 'Gerencia',
    description: 'Ve todos los paneles y el reporte de sobreventa.',
  },
  {
    code: 'formulator',
    name: 'Formulador',
    description: 'Define productos y borradores de fórmulas.',
  },
  { code: 'technical_lead', name: 'Jefe técnico', description: 'Revisa y publica fórmulas.' },
  { code: 'sales', name: 'Ventas', description: 'Registra y gestiona preventas.' },
  { code: 'plant', name: 'Planta', description: 'Programa y registra producción y envasado.' },
  {
    code: 'purchasing',
    name: 'Compras',
    description: 'Gestiona órdenes de compra según los faltantes.',
  },
  {
    code: 'warehouse',
    name: 'Bodega',
    description: 'Recepciones, traslados, despachos y ajustes de inventario.',
  },
] as const;

export type RoleCode = (typeof ROLES)[number]['code'];

const EVERYONE: readonly RoleCode[] = ROLES.map((role) => role.code);
const READERS: readonly RoleCode[] = [
  'manager',
  'formulator',
  'technical_lead',
  'sales',
  'plant',
  'purchasing',
  'warehouse',
];
const OPERATIONS: readonly RoleCode[] = ['manager', 'sales', 'plant', 'purchasing', 'warehouse'];

export const PERMISSIONS: readonly {
  code: string;
  description: string;
  roles: readonly RoleCode[];
}[] = [
  { code: 'profile:read', description: 'Ver su propio perfil y permisos', roles: EVERYONE },
  { code: 'users:read', description: 'Ver usuarios y roles', roles: ['manager'] },
  { code: 'users:manage', description: 'Crear, editar y desactivar usuarios', roles: [] },
  {
    code: 'products:read',
    description: 'Ver productos, fórmulas y requerimientos',
    roles: READERS,
  },
  {
    code: 'products:write',
    description: 'Crear, editar, importar y desactivar productos',
    roles: ['formulator', 'technical_lead'],
  },
  {
    code: 'formulas:draft',
    description: 'Crear y editar borradores de fórmulas',
    roles: ['formulator', 'technical_lead'],
  },
  {
    code: 'formulas:publish',
    description: 'Publicar fórmulas definidas por otra persona',
    roles: ['technical_lead'],
  },
  {
    code: 'formulas:publish-own',
    description: 'Publicar fórmulas definidas por uno mismo (excepción a los cuatro ojos)',
    roles: [],
  },
  { code: 'inventory:read', description: 'Ver existencias, kardex y reservas', roles: READERS },
  {
    code: 'inventory:receive',
    description: 'Registrar recepciones de materia prima',
    roles: ['warehouse', 'purchasing'],
  },
  {
    code: 'inventory:transfer',
    description: 'Trasladar producto entre bodegas (entrega a despacho)',
    roles: ['warehouse', 'plant'],
  },
  {
    code: 'inventory:adjust',
    description: 'Ajustar existencias por conteo físico (restringido y auditado)',
    roles: [],
  },
  {
    code: 'inventory:initial-load',
    description: 'Cargar el inventario inicial desde archivo',
    roles: [],
  },
  {
    code: 'inventory:waste',
    description: 'Registrar merma (lo que queda en el tanque, producto dañado)',
    roles: ['plant', 'warehouse'],
  },
  {
    code: 'inventory:dispatch',
    description: 'Registrar la salida de producto despachado',
    roles: ['warehouse'],
  },
  {
    code: 'inventory:produce',
    description: 'Registrar producción y consumos de fórmula',
    roles: ['plant'],
  },
  { code: 'customers:read', description: 'Ver clientes', roles: ['manager', 'sales', 'warehouse'] },
  {
    code: 'customers:read-all',
    description: 'Ver los clientes de todos los vendedores (sin esto, solo su cartera)',
    roles: ['manager', 'warehouse'],
  },
  {
    code: 'customers:write',
    description: 'Crear y editar clientes y sucursales',
    roles: ['sales', 'manager'],
  },
  {
    code: 'customers:assign',
    description: 'Asignar o reasignar el vendedor de un cliente',
    roles: ['manager'],
  },
  {
    code: 'sales-orders:read',
    description: 'Ver preventas (solo las propias, salvo con read-all)',
    roles: OPERATIONS,
  },
  {
    code: 'sales-orders:read-all',
    description: 'Ver las preventas de todos los vendedores',
    roles: ['manager', 'plant', 'purchasing', 'warehouse'],
  },
  {
    code: 'sales-orders:write',
    description: 'Registrar, confirmar y anular sus propias preventas',
    roles: ['sales'],
  },
  {
    code: 'sales-orders:manage-all',
    description: 'Modificar, confirmar o anular preventas de cualquier vendedor',
    roles: ['manager'],
  },
  {
    code: 'sales-orders:dispatch',
    description: 'Despachar preventas confirmadas',
    roles: ['warehouse'],
  },
  {
    code: 'production:read',
    description: 'Ver órdenes de producción y envasado',
    roles: OPERATIONS,
  },
  {
    code: 'production:write',
    description: 'Programar, terminar y anular órdenes de producción y envasado',
    roles: ['plant'],
  },
  {
    code: 'purchasing:read',
    description: 'Ver órdenes de compra y lo que está en tránsito',
    roles: OPERATIONS,
  },
  {
    code: 'purchasing:write',
    description: 'Crear y anular órdenes de compra',
    roles: ['purchasing'],
  },
  {
    code: 'suppliers:read',
    description: 'Ver proveedores',
    roles: ['manager', 'purchasing', 'warehouse'],
  },
  { code: 'suppliers:write', description: 'Crear y editar proveedores', roles: ['purchasing'] },
  {
    code: 'visits:write',
    description: 'Registrar sus visitas a clientes con el GPS del celular',
    roles: ['sales'],
  },
  {
    code: 'visits:read',
    description: 'Ver visitas (solo las propias, salvo con read-all)',
    roles: ['sales', 'manager'],
  },
  {
    code: 'visits:read-all',
    description: 'Ver en el mapa las visitas de todos los vendedores',
    roles: ['manager'],
  },
  {
    code: 'purchasing:receive',
    description: 'Recibir órdenes de compra en bodega',
    roles: ['warehouse', 'purchasing'],
  },
  {
    code: 'planning:read',
    description: 'Ver el reporte de sobreventa y las necesidades de producción y compra',
    roles: OPERATIONS,
  },
];

const ALL_CODES = PERMISSIONS.map((permission) => permission.code);

export function isRole(code: string): code is RoleCode {
  return ROLES.some((role) => role.code === code);
}

/** Permissions of a set of roles (sorted); the administrator holds every permission. */
export function permissionsOf(roles: readonly string[]): string[] {
  if (roles.includes('admin')) return [...ALL_CODES].sort();
  return PERMISSIONS.filter((permission) => permission.roles.some((role) => roles.includes(role)))
    .map((permission) => permission.code)
    .sort();
}

export function allPermissions(): string[] {
  return [...ALL_CODES];
}
