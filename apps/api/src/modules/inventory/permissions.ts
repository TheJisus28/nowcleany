import { Injectable } from '@nestjs/common';
import {
  DeclaresPermissions,
  type PermissionDefinition,
} from '../../platform/security/permission-registry.js';

export const INVENTORY_PERMISSIONS = [
  {
    code: 'inventory:read',
    description: 'Ver existencias, kardex y reservas',
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
    code: 'inventory:receive',
    description: 'Registrar recepciones de materia prima',
    defaultRoles: ['warehouse', 'purchasing'],
  },
  {
    code: 'inventory:transfer',
    description: 'Trasladar producto entre bodegas (entrega a despacho)',
    defaultRoles: ['warehouse', 'plant'],
  },
  {
    code: 'inventory:adjust',
    description: 'Ajustar existencias por conteo físico (restringido y auditado)',
    defaultRoles: [],
  },
  {
    code: 'inventory:initial-load',
    description: 'Cargar el inventario inicial desde archivo',
    defaultRoles: [],
  },
  {
    code: 'inventory:reserve',
    description: 'Comprometer y liberar producto terminado para preventas',
    defaultRoles: ['sales'],
  },
  {
    code: 'inventory:dispatch',
    description: 'Registrar la salida de producto despachado',
    defaultRoles: ['warehouse'],
  },
  {
    code: 'inventory:produce',
    description: 'Registrar producción y consumos de fórmula',
    defaultRoles: ['plant'],
  },
] as const satisfies readonly PermissionDefinition[];

@DeclaresPermissions(INVENTORY_PERMISSIONS)
@Injectable()
export class InventoryPermissions {}
