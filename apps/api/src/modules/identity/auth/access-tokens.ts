import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../platform/config/app-config.js';
import { InvalidConfigurationError } from '../../../platform/config/environment.js';
import { UnauthorizedError } from '../../../shared-kernel/index.js';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const ISSUER = 'nowcleanny';
// Fixed header: tokens with any other algorithm (including "none") are rejected byte-for-byte.
const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

export interface AccessClaims {
  readonly sub: string;
  readonly name: string;
  readonly perms: readonly string[];
  readonly iat: number;
  readonly exp: number;
  readonly iss: string;
}

/** HS256 JWT access tokens (15 min) using node:crypto only. */
@Injectable()
export class AccessTokens {
  private readonly secret: Buffer;

  constructor(config: AppConfig) {
    const secret = config.secret('JWT_SECRET');
    if (Buffer.byteLength(secret, 'utf8') < 32) {
      throw new InvalidConfigurationError(['JWT_SECRET debe tener al menos 32 caracteres.']);
    }
    this.secret = Buffer.from(secret, 'utf8');
  }

  sign(subject: { id: string; name: string; permissions: readonly string[] }): {
    token: string;
    expiresIn: number;
  } {
    const iat = Math.floor(Date.now() / 1000);
    const claims: AccessClaims = {
      sub: subject.id,
      name: subject.name,
      perms: [...subject.permissions].sort(),
      iat,
      exp: iat + ACCESS_TOKEN_TTL_SECONDS,
      iss: ISSUER,
    };
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return {
      token: `${HEADER}.${payload}.${this.signature(`${HEADER}.${payload}`)}`,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  verify(token: string): AccessClaims {
    const [header, payload, signature, ...rest] = token.split('.');
    if (header !== HEADER || !payload || !signature || rest.length > 0) throw invalid();

    const expected = Buffer.from(this.signature(`${header}.${payload}`));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw invalid();
    }

    let claims: unknown;
    try {
      claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      throw invalid();
    }
    if (!isClaims(claims) || claims.iss !== ISSUER || claims.exp <= Date.now() / 1000) {
      throw invalid();
    }
    return claims;
  }

  private signature(input: string): string {
    return createHmac('sha256', this.secret).update(input).digest('base64url');
  }
}

function isClaims(value: unknown): value is AccessClaims {
  if (typeof value !== 'object' || value === null) return false;
  const claims = value as Record<string, unknown>;
  return (
    typeof claims['sub'] === 'string' &&
    typeof claims['name'] === 'string' &&
    Array.isArray(claims['perms']) &&
    claims['perms'].every((perm) => typeof perm === 'string') &&
    typeof claims['exp'] === 'number' &&
    typeof claims['iat'] === 'number' &&
    typeof claims['iss'] === 'string'
  );
}

function invalid(): UnauthorizedError {
  return new UnauthorizedError(
    'auth.invalid_token',
    'La sesión no es válida o expiró. Inicia sesión de nuevo.',
  );
}
