import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';

export interface PermissionDefinition {
  /** `<area>:<action>`, e.g. "products:write". */
  readonly code: string;
  /** Shown in the user administration screen (Spanish). */
  readonly description: string;
  /** Roles that receive it when it is first synced (admin always gets every permission). */
  readonly defaultRoles: readonly string[];
}

/**
 * Class decorator for the `permissions.ts` provider of each module:
 * `@DeclaresPermissions(PRODUCT_PERMISSIONS) export class ProductPermissions {}`.
 */
export const DeclaresPermissions =
  DiscoveryService.createDecorator<readonly PermissionDefinition[]>();

const CODE = /^[a-z][a-z-]*:[a-z][a-z-]*$/;

/** Every permission declared by the modules loaded in this application. */
@Injectable()
export class PermissionRegistry {
  private cache: PermissionDefinition[] | undefined;

  constructor(private readonly discovery: DiscoveryService) {}

  all(): readonly PermissionDefinition[] {
    if (!this.cache) {
      const seen = new Map<string, PermissionDefinition>();
      for (const wrapper of this.discovery.getProviders({ metadataKey: DeclaresPermissions.KEY })) {
        for (const definition of this.discovery.getMetadataByDecorator(
          DeclaresPermissions,
          wrapper,
        ) ?? []) {
          if (!CODE.test(definition.code)) {
            throw new Error(
              `Código de permiso inválido: "${definition.code}" (formato area:accion).`,
            );
          }
          if (seen.has(definition.code)) {
            throw new Error(`Permiso declarado dos veces: "${definition.code}".`);
          }
          seen.set(definition.code, definition);
        }
      }
      this.cache = [...seen.values()];
    }
    return this.cache;
  }
}
