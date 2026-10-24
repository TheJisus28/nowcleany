import { Injectable } from '@nestjs/common';
import {
  DeclaresPermissions,
  type PermissionDefinition,
} from '../../platform/security/permission-registry.js';

export const PRODUCTION_PERMISSIONS = [
  {
    code: 'production:read',
    description: 'Ver órdenes de producción y envasado',
    defaultRoles: ['manager', 'plant', 'warehouse', 'purchasing', 'sales'],
  },
  {
    code: 'production:write',
    description: 'Programar, terminar y anular órdenes de producción y envasado',
    defaultRoles: ['plant'],
  },
] as const satisfies readonly PermissionDefinition[];

@DeclaresPermissions(PRODUCTION_PERMISSIONS)
@Injectable()
export class ProductionPermissions {}
