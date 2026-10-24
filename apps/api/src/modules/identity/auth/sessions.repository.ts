export interface ActiveSession {
  readonly id: string;
  readonly userId: string;
}

export abstract class SessionsRepository {
  abstract create(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  /** A session that is neither revoked nor expired. */
  abstract findActive(tokenHash: string): Promise<ActiveSession | undefined>;
  abstract revoke(sessionId: string): Promise<void>;
}
