import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { ModuleTransactionHost } from '../../../platform/db/module-transaction.js';
import type { IdentityTables } from '../identity.tables.js';
import { PermissionCatalogRepository } from './permission-catalog.repository.js';

@Injectable()
export class KyselyPermissionCatalogRepository extends PermissionCatalogRepository {
  constructor(
    @InjectTransactionHost('identity')
    private readonly host: ModuleTransactionHost<IdentityTables>,
  ) {
    super();
  }

  async roleCodes(): Promise<Set<string>> {
    const rows = await this.host.tx.selectFrom('roles').select('code').execute();
    return new Set(rows.map((row) => row.code));
  }

  async upsertPermissions(
    permissions: readonly { code: string; description: string }[],
  ): Promise<void> {
    if (permissions.length === 0) return;
    await this.host.tx
      .insertInto('permissions')
      .values(permissions.map(({ code, description }) => ({ code, description })))
      .onConflict((conflict) =>
        conflict.column('code').doUpdateSet((eb) => ({
          description: eb.ref('excluded.description'),
          synced_at: new Date(),
        })),
      )
      .execute();
  }

  async grant(grants: readonly { role: string; permission: string }[]): Promise<void> {
    if (grants.length === 0) return;
    await this.host.tx
      .insertInto('role_permissions')
      .values(
        grants.map(({ role, permission }) => ({ role_code: role, permission_code: permission })),
      )
      .onConflict((conflict) => conflict.columns(['role_code', 'permission_code']).doNothing())
      .execute();
  }
}
