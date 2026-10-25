import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../../platform/config/app-config.js';
import { Seeder } from '../../../platform/seeding/seeder.js';
import { UsersRepository } from '../users/users.repository.js';
import { UsersService } from '../users/users.service.js';

// DATOS DE EJEMPLO: un cuarto vendedor para ver el reparto de ventas con más gente.
export const SHOWCASE_USERS = [
  { email: 'vendedor.d@nowcleany.local', fullName: 'Diego Romero', roles: ['sales'] },
] as const;

@Injectable()
export class ShowcaseUsersSeeder {
  private readonly logger = new Logger('identity');

  constructor(
    private readonly config: AppConfig,
    private readonly users: UsersService,
    private readonly repository: UsersRepository,
  ) {}

  @Seeder({ name: 'identity.showcase-users', order: 21, showcase: true })
  async seed(): Promise<void> {
    const password = this.config.secret('DEMO_PASSWORD');
    for (const user of SHOWCASE_USERS) {
      if (await this.repository.findByEmail(user.email)) continue;
      await this.users.create({ ...user, password });
    }
    this.logger.log(`Usuarios adicionales: ${String(SHOWCASE_USERS.length)}`);
  }
}
