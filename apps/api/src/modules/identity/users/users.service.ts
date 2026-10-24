import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { CurrentActor } from '../../../platform/security/current-actor.js';
import { ConflictError, NotFoundError } from '../../../shared-kernel/index.js';
import { PasswordHasher } from '../auth/password-hasher.js';
import {
  assertPasswordPolicy,
  assertRoles,
  assertSelfChangeAllowed,
  normalizeEmail,
  normalizeFullName,
} from '../domain/user.js';
import { type RoleView, toUserView, type UserView } from './user-view.js';
import { UsersRepository } from './users.repository.js';

export interface CreateUserCommand {
  readonly email: string;
  readonly fullName: string;
  readonly password: string;
  readonly roles: readonly string[];
}

export interface UpdateUserCommand {
  readonly fullName?: string;
  readonly active?: boolean;
  readonly roles?: readonly string[];
}

@Injectable()
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly passwords: PasswordHasher,
    private readonly currentActor: CurrentActor,
  ) {}

  @Transactional('identity')
  async list(): Promise<UserView[]> {
    return (await this.users.list()).map(toUserView);
  }

  @Transactional('identity')
  roles(): Promise<RoleView[]> {
    return this.users.roles();
  }

  @Transactional('identity')
  async create(command: CreateUserCommand): Promise<UserView> {
    const email = normalizeEmail(command.email);
    const fullName = normalizeFullName(command.fullName);
    assertPasswordPolicy(command.password);
    const roles = assertRoles(command.roles, await this.knownRoles());
    if (await this.users.findByEmail(email)) {
      throw new ConflictError('identity.email_taken', 'Ya existe un usuario con ese correo.');
    }
    const id = await this.users.insert({
      email,
      fullName,
      passwordHash: await this.passwords.hash(command.password),
    });
    await this.users.setRoles(id, roles);
    return this.view(id);
  }

  @Transactional('identity')
  async update(id: string, command: UpdateUserCommand): Promise<UserView> {
    await this.require(id);
    const roles =
      command.roles === undefined ? undefined : assertRoles(command.roles, await this.knownRoles());
    assertSelfChangeAllowed(this.currentActor.require().id, id, {
      ...(command.active === undefined ? {} : { active: command.active }),
      ...(roles === undefined ? {} : { roles }),
    });
    await this.users.update(id, {
      ...(command.fullName === undefined ? {} : { fullName: normalizeFullName(command.fullName) }),
      ...(command.active === undefined ? {} : { active: command.active }),
    });
    if (roles) await this.users.setRoles(id, roles);
    return this.view(id);
  }

  @Transactional('identity')
  async resetPassword(id: string, password: string): Promise<void> {
    await this.require(id);
    assertPasswordPolicy(password);
    await this.users.update(id, { passwordHash: await this.passwords.hash(password) });
  }

  private async knownRoles(): Promise<Set<string>> {
    return new Set((await this.users.roles()).map((role) => role.code));
  }

  private async require(id: string) {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundError('identity.user_not_found', 'El usuario no existe.');
    return user;
  }

  private async view(id: string): Promise<UserView> {
    return toUserView(await this.require(id));
  }
}
