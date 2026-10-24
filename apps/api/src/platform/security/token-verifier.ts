import { Injectable } from '@nestjs/common';
import { UnauthorizedError } from '../../shared-kernel/index.js';
import type { Actor } from './actor.js';

/** Port: turns a bearer token into an Actor. Implemented by the identity module. */
export abstract class TokenVerifier {
  abstract verify(token: string): Promise<Actor>;
}

/** Used until an identity provider is wired in: every token is rejected. */
@Injectable()
export class RejectAllTokenVerifier extends TokenVerifier {
  verify(): Promise<Actor> {
    return Promise.reject(
      new UnauthorizedError('auth.invalid_token', 'La sesión no es válida o expiró.'),
    );
  }
}
