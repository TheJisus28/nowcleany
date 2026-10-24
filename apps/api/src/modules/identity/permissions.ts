import { Injectable } from '@nestjs/common';
import {
  DeclaresPermissions,
  type PermissionDefinition,
} from '../../platform/security/permission-registry.js';

export const ALL_ROLES = [
  'admin',
  'manager',
  'formulator',
  'technical_lead',
  'sales',
  'plant',
  'purchasing',
  'warehouse',
] as const;

export const IDENTITY_PERMISSIONS = [
  { code: 'profile:read', description: 'Ver su propio perfil y permisos', defaultRoles: ALL_ROLES },
  { code: 'users:read', description: 'Ver usuarios y roles', defaultRoles: ['manager'] },
  { code: 'users:manage', description: 'Crear, editar y desactivar usuarios', defaultRoles: [] },
] as const satisfies readonly PermissionDefinition[];

@DeclaresPermissions(IDENTITY_PERMISSIONS)
@Injectable()
export class IdentityPermissions {}
