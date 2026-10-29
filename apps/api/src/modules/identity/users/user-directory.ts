import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { permissionsOf } from '../access.js';
import { type UserRecord, UsersRepository } from './users.repository.js';

export interface DirectoryUser {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly active: boolean;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
}

/** What other modules read about users (sellers for portfolios, seeds by email). */
@Injectable()
export class UserDirectory {
  constructor(private readonly users: UsersRepository) {}

  @Transactional()
  async findByEmails(emails: readonly string[]): Promise<DirectoryUser[]> {
    const found = await Promise.all(emails.map((email) => this.users.findByEmail(email)));
    return found.filter((user): user is UserRecord => Boolean(user)).map(toDirectoryUser);
  }

  @Transactional()
  async findByIds(ids: readonly string[]): Promise<DirectoryUser[]> {
    const found = await Promise.all(ids.map((id) => this.users.findById(id)));
    return found.filter((user): user is UserRecord => Boolean(user)).map(toDirectoryUser);
  }

  /** Active users with the sales role. */
  @Transactional()
  async sellers(): Promise<DirectoryUser[]> {
    return (await this.users.list())
      .filter((user) => user.active && user.roles.includes('sales'))
      .map(toDirectoryUser);
  }
}

function toDirectoryUser(user: UserRecord): DirectoryUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    active: user.active,
    roles: user.roles,
    permissions: permissionsOf(user.roles),
  };
}
