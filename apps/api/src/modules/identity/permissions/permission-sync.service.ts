import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { PermissionRegistry } from '../../../platform/security/permission-registry.js';
import { PermissionCatalogRepository } from './permission-catalog.repository.js';

/**
 * At startup, stores every permission declared in the modules' permissions.ts and grants each one to its
 * default roles (admin always gets all). Idempotent, so N instances may run it concurrently.
 */
@Injectable()
export class PermissionSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger('identity');

  constructor(
    private readonly registry: PermissionRegistry,
    private readonly catalog: PermissionCatalogRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.sync();
  }

  @Transactional('identity')
  async sync(): Promise<void> {
    const definitions = this.registry.all();
    const roles = await this.catalog.roleCodes();
    for (const definition of definitions) {
      const unknown = definition.defaultRoles.filter((role) => !roles.has(role));
      if (unknown.length > 0) {
        throw new Error(
          `El permiso ${definition.code} referencia roles inexistentes: ${unknown.join(', ')}`,
        );
      }
    }
    await this.catalog.upsertPermissions(definitions);
    await this.catalog.grant(
      definitions.flatMap((definition) =>
        [...new Set(['admin', ...definition.defaultRoles])].map((role) => ({
          role,
          permission: definition.code,
        })),
      ),
    );
    this.logger.log(`Permisos sincronizados: ${String(definitions.length)}`);
  }
}
