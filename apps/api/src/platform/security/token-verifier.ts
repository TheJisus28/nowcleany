import type { Actor } from './actor.js';

/** Port: turns a bearer token into an Actor. Implemented by the identity module. */
export abstract class TokenVerifier {
  abstract verify(token: string): Promise<Actor>;
}
