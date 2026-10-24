import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { CurrentActor } from '../../../platform/security/current-actor.js';
import { UsersRepository } from './users.repository.js';

export interface DirectoryUser {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly active: boolean;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
}

/** Public read API of the identity module. */
@Injectable()
export class UserDirectory {
  constructor(
    private readonly users: UsersRepository,
    private readonly currentActor: CurrentActor,
  ) {}

  @Transactional('identity')
  async findByEmails(emails: readonly string[]): Promise<DirectoryUser[]> {
    this.currentActor.requirePermission('users:read');
    const found: DirectoryUser[] = [];
    for (const email of emails) {
      const user = await this.users.findByEmail(email);
      if (!user) continue;
      found.push({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        active: user.active,
        roles: user.roles,
        permissions: await this.users.permissionsOf(user.roles),
      });
    }
    return found;
  }
}
