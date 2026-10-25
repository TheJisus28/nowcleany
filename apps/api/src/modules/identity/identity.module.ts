import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../platform/db/database.module.js';
import { AccessTokens } from './auth/access-tokens.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { JwtTokenVerifier } from './auth/jwt-token-verifier.js';
import { KyselySessionsRepository } from './auth/kysely-sessions.repository.js';
import { PasswordHasher } from './auth/password-hasher.js';
import { SessionsRepository } from './auth/sessions.repository.js';
import { IdentityPermissions } from './permissions.js';
import { KyselyPermissionCatalogRepository } from './permissions/kysely-permission-catalog.repository.js';
import { PermissionCatalogRepository } from './permissions/permission-catalog.repository.js';
import { PermissionSyncService } from './permissions/permission-sync.service.js';
import { AdminSeeder } from './seeds/admin.seeder.js';
import { DemoUsersSeeder } from './seeds/demo-users.seeder.js';
import { ShowcaseUsersSeeder } from './seeds/showcase-users.seeder.js';
import { KyselyUsersRepository } from './users/kysely-users.repository.js';
import { UserDirectory } from './users/user-directory.js';
import { RolesController, UsersController } from './users/users.controller.js';
import { UsersRepository } from './users/users.repository.js';
import { UsersService } from './users/users.service.js';

@Module({
  imports: [DatabaseModule.forModule('identity')],
  controllers: [AuthController, UsersController, RolesController],
  providers: [
    IdentityPermissions,
    AccessTokens,
    PasswordHasher,
    JwtTokenVerifier,
    AuthService,
    UsersService,
    PermissionSyncService,
    AdminSeeder,
    DemoUsersSeeder,
    ShowcaseUsersSeeder,
    UserDirectory,
    { provide: UsersRepository, useClass: KyselyUsersRepository },
    { provide: SessionsRepository, useClass: KyselySessionsRepository },
    { provide: PermissionCatalogRepository, useClass: KyselyPermissionCatalogRepository },
  ],
  exports: [JwtTokenVerifier, UserDirectory],
})
export class IdentityModule {}
