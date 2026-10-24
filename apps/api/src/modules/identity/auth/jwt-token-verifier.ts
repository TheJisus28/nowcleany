import { Injectable } from '@nestjs/common';
import type { Actor } from '../../../platform/security/actor.js';
import { TokenVerifier } from '../../../platform/security/token-verifier.js';
import { AccessTokens } from './access-tokens.js';

/** Stateless: the actor's permissions travel in the 15-minute access token. */
@Injectable()
export class JwtTokenVerifier extends TokenVerifier {
  constructor(private readonly tokens: AccessTokens) {
    super();
  }

  verify(token: string): Promise<Actor> {
    return Promise.resolve(token).then((value) => {
      const claims = this.tokens.verify(value);
      return {
        id: claims.sub,
        displayName: claims.name,
        permissions: new Set(claims.perms),
        system: false,
      };
    });
  }
}
