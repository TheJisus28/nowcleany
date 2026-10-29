import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../../platform/config/app-config.js';
import { UsersRepository } from '../users/users.repository.js';
import { UsersService } from '../users/users.service.js';

/** Initial administrator from ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME. Skipped if it exists. */
@Injectable()
export class AdminSeeder {
  private readonly logger = new Logger('identity');

  constructor(
    private readonly config: AppConfig,
    private readonly users: UsersService,
    private readonly repository: UsersRepository,
  ) {}

  async seed(): Promise<void> {
    const email = this.config.secret('ADMIN_EMAIL');
    if (await this.repository.findByEmail(email)) {
      this.logger.log(`El administrador ${email} ya existe`);
      return;
    }
    await this.users.create({
      email,
      fullName: this.config.secret('ADMIN_NAME'),
      password: this.config.secret('ADMIN_PASSWORD'),
      roles: ['admin'],
    });
    this.logger.log(`Administrador inicial creado: ${email}`);
  }
}
