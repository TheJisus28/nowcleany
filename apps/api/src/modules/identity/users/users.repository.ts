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

export abstract class UsersRepository {
  abstract findByEmail(email: string): Promise<UserRecord | undefined>;
  abstract findById(id: string): Promise<UserRecord | undefined>;
  abstract list(): Promise<UserRecord[]>;
  abstract insert(user: { email: string; fullName: string; passwordHash: string }): Promise<string>;
  abstract update(
    id: string,
    changes: { fullName?: string; active?: boolean; passwordHash?: string },
  ): Promise<void>;
  abstract setRoles(userId: string, roles: readonly string[]): Promise<void>;
  abstract touchLogin(userId: string): Promise<void>;
  /** Union of the permissions granted to the given roles. */
  abstract permissionsOf(roles: readonly string[]): Promise<string[]>;
  abstract roles(): Promise<RoleRecord[]>;
}
