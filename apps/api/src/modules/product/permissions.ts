import { Injectable } from '@nestjs/common';
import {
  DeclaresPermissions,
  type PermissionDefinition,
} from '../../platform/security/permission-registry.js';

export const PRODUCT_PERMISSIONS = [
  {
    code: 'products:read',
    description: 'Ver productos, fórmulas y requerimientos',
    defaultRoles: [
      'manager',
      'formulator',
      'technical_lead',
      'sales',
      'plant',
      'purchasing',
      'warehouse',
    ],
  },
  {
    code: 'products:write',
    description: 'Crear, editar, importar y desactivar productos',
    defaultRoles: ['formulator', 'technical_lead'],
  },
  {
    code: 'formulas:draft',
    description: 'Crear y editar borradores de fórmulas',
    defaultRoles: ['formulator', 'technical_lead'],
  },
  {
    code: 'formulas:publish',
    description: 'Publicar fórmulas definidas por otra persona',
    defaultRoles: ['technical_lead'],
  },
  {
    code: 'formulas:publish-own',
    description: 'Publicar fórmulas definidas por uno mismo (excepción a los cuatro ojos)',
    defaultRoles: [],
  },
] as const satisfies readonly PermissionDefinition[];

@DeclaresPermissions(PRODUCT_PERMISSIONS)
@Injectable()
export class ProductPermissions {}
