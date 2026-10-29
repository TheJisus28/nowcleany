import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { NotFoundError, UnauthorizedError } from '../../../shared-kernel/index.js';
import { type ProfileView, toUserView } from '../users/user-view.js';
import { UsersRepository } from '../users/users.repository.js';
import { permissionsOf } from '../access.js';
import { AccessTokens } from './access-tokens.js';
import { PasswordHasher } from './password-hasher.js';
import { SessionsRepository } from './sessions.repository.js';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface AuthResult {
  readonly accessToken: string;
  readonly expiresIn: number;
  readonly refreshToken: string;
  readonly user: ProfileView;
}

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly sessions: SessionsRepository,
    private readonly tokens: AccessTokens,
    private readonly passwords: PasswordHasher,
  ) {}

  @Transactional()
  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.users.findByEmail(email.trim());
    const valid = await this.passwords.verify(user?.passwordHash, password);
    if (!user || !valid || !user.active) {
      throw new UnauthorizedError('auth.invalid_credentials', 'Correo o contraseña incorrectos.');
    }
    await this.users.touchLogin(user.id);
    return this.issue(user.id);
  }

  /** Rotates the refresh token: the presented one is revoked and a new pair is issued. */
  @Transactional()
  async refresh(refreshToken: string): Promise<AuthResult> {
    const session = await this.sessions.findActive(hashToken(refreshToken));
    if (!session) {
      throw new UnauthorizedError(
        'auth.invalid_refresh',
        'La sesión expiró. Inicia sesión de nuevo.',
      );
    }
    await this.sessions.revoke(session.id);
    return this.issue(session.userId);
  }

  @Transactional()
  async logout(refreshToken: string): Promise<void> {
    const session = await this.sessions.findActive(hashToken(refreshToken));
    if (session) await this.sessions.revoke(session.id);
  }

  @Transactional()
  async profile(userId: string): Promise<ProfileView> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError('identity.user_not_found', 'El usuario no existe.');
    return { ...toUserView(user), permissions: permissionsOf(user.roles) };
  }

  private async issue(userId: string): Promise<AuthResult> {
    const user = await this.users.findById(userId);
    if (!user?.active) {
      throw new UnauthorizedError('auth.inactive_user', 'El usuario está desactivado.');
    }
    const permissions = permissionsOf(user.roles);
    const refreshToken = randomBytes(32).toString('base64url');
    await this.sessions.create(
      user.id,
      hashToken(refreshToken),
      new Date(Date.now() + SESSION_TTL_MS),
    );
    const access = this.tokens.sign({ id: user.id, name: user.fullName, permissions });
    return {
      accessToken: access.token,
      expiresIn: access.expiresIn,
      refreshToken,
      user: { ...toUserView(user), permissions },
    };
  }
}
