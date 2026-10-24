import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

@Injectable()
export class PasswordHasher {
  // Verified when the e-mail does not exist, so response time does not reveal registered accounts.
  private readonly dummyHash = argon2.hash('nowcleanny-dummy-password', { type: argon2.argon2id });

  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async verify(hash: string | undefined, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash ?? (await this.dummyHash), password);
    } catch {
      return false;
    }
  }
}
