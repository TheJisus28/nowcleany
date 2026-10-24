import { Injectable } from '@nestjs/common';
import {
  DeclaresPermissions,
  type PermissionDefinition,
} from '../../platform/security/permission-registry.js';

export const PURCHASING_PERMISSIONS = [
  {
    code: 'purchasing:read',
    description: 'Ver órdenes de compra y lo que está en tránsito',
    defaultRoles: ['manager', 'purchasing', 'warehouse', 'plant', 'sales'],
  },
  {
    code: 'purchasing:write',
    description: 'Crear y anular órdenes de compra',
    defaultRoles: ['purchasing'],
  },
  {
    code: 'purchasing:receive',
    description: 'Recibir órdenes de compra en bodega',
    defaultRoles: ['warehouse', 'purchasing'],
  },
] as const satisfies readonly PermissionDefinition[];

@DeclaresPermissions(PURCHASING_PERMISSIONS)
@Injectable()
export class PurchasingPermissions {}
