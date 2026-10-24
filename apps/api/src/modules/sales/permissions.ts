import { Injectable } from '@nestjs/common';
import {
  DeclaresPermissions,
  type PermissionDefinition,
} from '../../platform/security/permission-registry.js';

export const SALES_PERMISSIONS = [
  {
    code: 'customers:read',
    description: 'Ver clientes',
    defaultRoles: ['manager', 'sales', 'warehouse'],
  },
  { code: 'customers:write', description: 'Crear y editar clientes', defaultRoles: ['sales'] },
  {
    code: 'sales-orders:read',
    description: 'Ver las preventas del equipo',
    defaultRoles: ['manager', 'sales', 'plant', 'purchasing', 'warehouse'],
  },
  {
    code: 'sales-orders:write',
    description: 'Registrar, confirmar y anular sus propias preventas',
    defaultRoles: ['sales'],
  },
  {
    code: 'sales-orders:manage-all',
    description: 'Modificar, confirmar o anular preventas de cualquier vendedor',
    defaultRoles: ['manager'],
  },
  {
    code: 'sales-orders:dispatch',
    description: 'Despachar preventas confirmadas',
    defaultRoles: ['warehouse'],
  },
] as const satisfies readonly PermissionDefinition[];

@DeclaresPermissions(SALES_PERMISSIONS)
@Injectable()
export class SalesPermissions {}
