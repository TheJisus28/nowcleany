import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../../platform/config/app-config.js';
import { UsersRepository } from '../users/users.repository.js';
import { UsersService } from '../users/users.service.js';

// DATOS DE EJEMPLO: un usuario por rol del flujo. Vendedores A, B y C como en la propuesta SCIP; Diego
// (consolidado), Alfonso (compras) y Silvia (recepción de compras) son los nombres del equipo de NOW CLEANY.
export const DEMO_USERS = [
  { email: 'gerencia@nowcleany.local', fullName: 'Mariana Gerente', roles: ['manager'] },
  { email: 'vendedor.a@nowcleany.local', fullName: 'Andrea Ruiz', roles: ['sales'] },
  { email: 'vendedor.b@nowcleany.local', fullName: 'Bernardo Díaz', roles: ['sales'] },
  { email: 'vendedor.c@nowcleany.local', fullName: 'Camila Torres', roles: ['sales'] },
  { email: 'consolidado@nowcleany.local', fullName: 'Diego', roles: ['consolidator'] },
  { email: 'planta@nowcleany.local', fullName: 'Carlos Pérez', roles: ['plant'] },
  { email: 'logistica@nowcleany.local', fullName: 'Pedro Martínez', roles: ['logistics'] },
  { email: 'compras@nowcleany.local', fullName: 'Alfonso', roles: ['purchasing'] },
  { email: 'recepcion@nowcleany.local', fullName: 'Silvia', roles: ['receiving'] },
  { email: 'contable@nowcleany.local', fullName: 'Laura Gómez', roles: ['accountant'] },
] as const;

@Injectable()
export class DemoUsersSeeder {
  private readonly logger = new Logger('identity');

  constructor(
    private readonly config: AppConfig,
    private readonly users: UsersService,
    private readonly repository: UsersRepository,
  ) {}

  async seed(): Promise<void> {
    const password = this.config.secret('DEMO_PASSWORD');
    let created = 0;
    for (const user of DEMO_USERS) {
      if (await this.repository.findByEmail(user.email)) continue;
      await this.users.create({ ...user, password });
      created++;
    }
    this.logger.log(`Usuarios de demo: ${String(created)} creados`);
  }
}
