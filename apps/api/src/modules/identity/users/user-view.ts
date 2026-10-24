import type { UserRecord } from './users.repository.js';

export interface UserView {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly active: boolean;
  readonly lastLoginAt: string | null;
  readonly roles: readonly string[];
}

export interface ProfileView extends UserView {
  readonly permissions: readonly string[];
}

export function toUserView(user: UserRecord): UserView {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    active: user.active,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    roles: user.roles,
  };
}

export interface RoleView {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly string[];
}
