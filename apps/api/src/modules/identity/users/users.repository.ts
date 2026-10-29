import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import { sql } from 'kysely';
import type { ModuleTransactionHost } from '../../../platform/db/module-transaction.js';
import type { IdentityTables } from '../identity.tables.js';

export interface UserRecord {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly passwordHash: string;
  readonly active: boolean;
  readonly lastLoginAt: Date | null;
  readonly roles: readonly string[];
}

export interface RoleRecord {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly string[];
}

@Injectable()
export class UsersRepository {
  constructor(
    @InjectTransactionHost()
    private readonly host: ModuleTransactionHost<IdentityTables>,
  ) {}

  findByEmail(email: string): Promise<UserRecord | undefined> {
    return this.selectUsers()
      .where(sql<string>`lower(u.email)`, '=', email.toLowerCase())
      .executeTakeFirst()
      .then((row) => row && toUser(row));
  }

  findById(id: string): Promise<UserRecord | undefined> {
    return this.selectUsers()
      .where('u.id', '=', id)
      .executeTakeFirst()
      .then((row) => row && toUser(row));
  }

  async list(): Promise<UserRecord[]> {
    const rows = await this.selectUsers().orderBy('u.full_name').execute();
    return rows.map(toUser);
  }

  async insert(user: { email: string; fullName: string; passwordHash: string }): Promise<string> {
    const row = await this.host.tx
      .insertInto('users')
      .values({
        email: user.email,
        full_name: user.fullName,
        password_hash: user.passwordHash,
        last_login_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async update(
    id: string,
    changes: { fullName?: string; active?: boolean; passwordHash?: string },
  ): Promise<void> {
    await this.host.tx
      .updateTable('users')
      .set({
        ...(changes.fullName === undefined ? {} : { full_name: changes.fullName }),
        ...(changes.active === undefined ? {} : { active: changes.active }),
        ...(changes.passwordHash === undefined ? {} : { password_hash: changes.passwordHash }),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .execute();
  }

  async setRoles(userId: string, roles: readonly string[]): Promise<void> {
    await this.host.tx.deleteFrom('user_roles').where('user_id', '=', userId).execute();
    if (roles.length > 0) {
      await this.host.tx
        .insertInto('user_roles')
        .values(roles.map((role) => ({ user_id: userId, role_code: role })))
        .execute();
    }
  }

  async touchLogin(userId: string): Promise<void> {
    await this.host.tx
      .updateTable('users')
      .set({ last_login_at: new Date() })
      .where('id', '=', userId)
      .execute();
  }

  private selectUsers() {
    return this.host.tx.selectFrom('users as u').select([
      'u.id',
      'u.email',
      'u.full_name',
      'u.password_hash',
      'u.active',
      'u.last_login_at',
      sql<string[]>`coalesce((SELECT array_agg(ur.role_code ORDER BY ur.role_code)
          FROM user_roles ur WHERE ur.user_id = u.id), '{}')`.as('roles'),
    ]);
  }
}

function toUser(row: {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  active: boolean;
  last_login_at: Date | null;
  roles: string[];
}): UserRecord {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    passwordHash: row.password_hash,
    active: row.active,
    lastLoginAt: row.last_login_at,
    roles: row.roles,
  };
}
