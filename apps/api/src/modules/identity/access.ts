/**
 * Roles and permissions, in code. A route declares `@Permission('<code>')`; a user holds the
 * permissions of their roles (the administrator holds all of them).
 *
 * The roles follow the company's flow: each one does its step, authorizes it and passes it on.
 * Seller (pre-sale) → consolidator (consolidates and invoices) → plant (prepares) → logistics (guide,
 * dispatch, delivery) → accountant (collections, payments, trail). Purchasing orders from suppliers;
 * receiving enters each supplier invoice against the order, and with it the goods.
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
    description: 'Ve todos los módulos, el tablero y la traza; publica fórmulas.',
  },
  {
    code: 'sales',
    name: 'Vendedor',
    description: 'Atiende su cartera: visitas, clientes y preventas.',
  },
  {
    code: 'consolidator',
    name: 'Facturación',
    description:
      'Factura las preventas guardadas (factura electrónica o remisión) y decide el turno.',
  },
  {
    code: 'plant',
    name: 'Planta',
    description: 'Produce, envasa, alista los pedidos y los entrega a despacho.',
  },
  {
    code: 'logistics',
    name: 'Logística',
    description: 'Arma las guías, despacha y confirma las entregas.',
  },
  {
    code: 'purchasing',
    name: 'Compras',
    description: 'Hace las órdenes de compra a los proveedores con la sugerencia del mes.',
  },
  {
    code: 'receiving',
    name: 'Recepción de compras',
    description: 'Ingresa las facturas de proveedor y, con ellas, la mercancía que llegó.',
  },
  {
    code: 'accountant',
    name: 'Contable',
    description:
      'Registra cobros a clientes y pagos a proveedores; revisa la traza y los reportes.',
  },
] as const;

export type RoleCode = (typeof ROLES)[number]['code'];

const EVERYONE: readonly RoleCode[] = ROLES.map((role) => role.code);
/** Everyone who works in the operation (all but admin, who holds everything anyway). */
const STAFF: readonly RoleCode[] = [
  'manager',
  'sales',
  'consolidator',
  'plant',
  'logistics',
  'purchasing',
  'receiving',
  'accountant',
];
/** Roles that see every seller's orders and customers (sellers only see their portfolio). */
const BACK_OFFICE: readonly RoleCode[] = [
  'manager',
  'consolidator',
  'plant',
  'logistics',
  'purchasing',
  'receiving',
  'accountant',
];

export const PERMISSIONS: readonly {
  code: string;
  description: string;
  roles: readonly RoleCode[];
}[] = [
  { code: 'profile:read', description: 'Ver su propio perfil y permisos', roles: EVERYONE },
  { code: 'users:read', description: 'Ver usuarios y roles', roles: ['manager'] },
  { code: 'users:manage', description: 'Crear, editar y desactivar usuarios', roles: [] },
  // Catalog
  { code: 'products:read', description: 'Ver productos, fórmulas y precios', roles: STAFF },
  {
    code: 'products:write',
    description: 'Crear, editar, importar y desactivar productos, con precios y costos',
    roles: ['plant', 'manager'],
  },
  {
    code: 'formulas:draft',
    description: 'Crear y editar borradores de fórmulas',
    roles: ['plant'],
  },
  {
    code: 'formulas:publish',
    description: 'Publicar fórmulas definidas por otra persona',
    roles: ['manager'],
  },
  {
    code: 'formulas:publish-own',
    description: 'Publicar fórmulas definidas por uno mismo (excepción a los cuatro ojos)',
    roles: [],
  },
  // Inventory
  { code: 'inventory:read', description: 'Ver existencias y kardex', roles: STAFF },
  {
    code: 'inventory:receive',
    description: 'Registrar recepciones de mercancía',
    roles: ['receiving'],
  },
  {
    code: 'inventory:warehouses',
    description: 'Crear y renombrar bodegas',
    roles: ['manager'],
  },
  {
    code: 'inventory:transfer',
    description: 'Trasladar producto entre bodegas',
    roles: ['plant', 'logistics'],
  },
  {
    code: 'inventory:adjust',
    description: 'Ajustar existencias por conteo físico (restringido y auditado)',
    roles: ['logistics'],
  },
  {
    code: 'inventory:initial-load',
    description: 'Cargar el inventario inicial desde archivo',
    roles: [],
  },
  {
    code: 'inventory:waste',
    description: 'Registrar merma (lo que queda en el tanque, producto dañado)',
    roles: ['plant', 'logistics'],
  },
  {
    code: 'inventory:dispatch',
    description: 'Registrar la salida de producto despachado',
    roles: ['logistics'],
  },
  {
    code: 'inventory:produce',
    description: 'Registrar producción y consumos de fórmula',
    roles: ['plant'],
  },
  // Sales
  {
    code: 'customers:read',
    description: 'Ver clientes',
    roles: ['manager', 'sales', 'consolidator', 'logistics', 'accountant'],
  },
  {
    code: 'customers:read-all',
    description: 'Ver los clientes de todos los vendedores (sin esto, solo su cartera)',
    roles: ['manager', 'consolidator', 'logistics', 'accountant'],
  },
  {
    code: 'customers:write',
    description: 'Crear y editar clientes y sucursales',
    roles: ['sales', 'manager', 'consolidator'],
  },
  {
    code: 'customers:assign',
    description: 'Asignar o reasignar el vendedor de un cliente',
    roles: ['manager'],
  },
  {
    code: 'sales-orders:read',
    description: 'Ver preventas (solo las propias, salvo con read-all)',
    roles: STAFF,
  },
  {
    code: 'sales-orders:read-all',
    description: 'Ver las preventas de todos los vendedores',
    roles: BACK_OFFICE,
  },
  {
    code: 'sales-orders:write',
    description: 'Registrar, enviar y anular sus propias preventas',
    roles: ['sales'],
  },
  {
    code: 'sales-orders:manage-all',
    description: 'Modificar, enviar o anular preventas de cualquier vendedor',
    roles: ['manager'],
  },
  {
    code: 'sales-orders:prepare',
    description: 'Alistar pedidos facturados y entregarlos a despacho',
    roles: ['plant'],
  },
  {
    code: 'sales-orders:dispatch',
    description: 'Despachar pedidos y confirmar su entrega',
    roles: ['logistics'],
  },
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
  // Billing
  {
    code: 'invoices:read',
    description: 'Ver facturas y lo que deben los clientes',
    roles: ['manager', 'consolidator', 'accountant', 'logistics'],
  },
  {
    code: 'invoices:issue',
    description: 'Facturar las preventas guardadas',
    roles: ['consolidator'],
  },
  {
    code: 'payments:write',
    description: 'Registrar pagos de clientes y pagos a proveedores',
    roles: ['accountant'],
  },
  // Logistics
  {
    code: 'shipments:read',
    description: 'Ver guías de despacho',
    roles: ['manager', 'logistics', 'consolidator', 'accountant', 'plant'],
  },
  {
    code: 'shipments:write',
    description: 'Armar guías, despachar y confirmar entregas',
    roles: ['logistics'],
  },
  // Production and purchasing
  { code: 'production:read', description: 'Ver órdenes de producción y envasado', roles: STAFF },
  {
    code: 'production:write',
    description: 'Programar, terminar y anular órdenes de producción y envasado',
    roles: ['plant'],
  },
  {
    code: 'purchasing:read',
    description: 'Ver órdenes de compra, lo que está en tránsito y lo que se debe',
    roles: ['manager', 'purchasing', 'plant', 'receiving', 'accountant'],
  },
  {
    code: 'purchasing:write',
    description: 'Crear, cerrar y anular órdenes de compra y el plan de compras del mes',
    roles: ['purchasing'],
  },
  {
    code: 'purchasing:receive',
    description:
      'Ingresar facturas de proveedor y la mercancía que llegó contra una orden de compra',
    roles: ['receiving'],
  },
  {
    code: 'suppliers:read',
    description: 'Ver proveedores',
    roles: ['manager', 'purchasing', 'receiving', 'accountant', 'plant'],
  },
  {
    code: 'suppliers:write',
    description: 'Crear y editar proveedores',
    roles: ['purchasing'],
  },
  {
    code: 'planning:read',
    description: 'Ver la sobreventa, las necesidades y la sugerencia de compra del mes',
    roles: STAFF,
  },
  {
    code: 'finance:read',
    description: 'Ver cuentas por cobrar, cuentas por pagar y el reporte de cobros y pagos',
    roles: ['manager', 'accountant'],
  },
  // Audit
  {
    code: 'trail:read',
    description: 'Ver la traza: quién hizo y autorizó cada paso',
    roles: ['manager', 'accountant'],
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

/** Name of the first business role of a user, for the trail ("Planta", "Logística"…). */
export function roleNameOf(roles: readonly string[]): string | null {
  const role = ROLES.find((item) => roles.includes(item.code));
  return role?.name ?? null;
}
