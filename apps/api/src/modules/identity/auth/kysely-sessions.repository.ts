import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { ModuleTransactionHost } from '../../../platform/db/module-transaction.js';
import type { IdentityTables } from '../identity.tables.js';
import { type ActiveSession, SessionsRepository } from './sessions.repository.js';

@Injectable()
export class KyselySessionsRepository extends SessionsRepository {
  constructor(
    @InjectTransactionHost('identity')
    private readonly host: ModuleTransactionHost<IdentityTables>,
  ) {
    super();
  }

  async create(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.host.tx
      .insertInto('sessions')
      .values({ user_id: userId, token_hash: tokenHash, expires_at: expiresAt, revoked_at: null })
      .execute();
  }

  async findActive(tokenHash: string): Promise<ActiveSession | undefined> {
    const row = await this.host.tx
      .selectFrom('sessions')
      .select(['id', 'user_id'])
      .where('token_hash', '=', tokenHash)
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', new Date())
      .executeTakeFirst();
    return row && { id: row.id, userId: row.user_id };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.host.tx
      .updateTable('sessions')
      .set({ revoked_at: new Date() })
      .where('id', '=', sessionId)
      .execute();
  }
}
