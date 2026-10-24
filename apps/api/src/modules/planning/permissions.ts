import { Injectable } from '@nestjs/common';
import {
  DeclaresPermissions,
  type PermissionDefinition,
} from '../../platform/security/permission-registry.js';

// Planning composes read APIs: every role holding planning:read also holds products:read,
// inventory:read, sales-orders:read, production:read and purchasing:read.
export const PLANNING_PERMISSIONS = [
  {
    code: 'planning:read',
    description: 'Ver el reporte de sobreventa y las necesidades de producción y compra',
    defaultRoles: ['manager', 'sales', 'plant', 'purchasing', 'warehouse'],
  },
] as const satisfies readonly PermissionDefinition[];

@DeclaresPermissions(PLANNING_PERMISSIONS)
@Injectable()
export class PlanningPermissions {}
