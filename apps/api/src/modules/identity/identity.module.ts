import { Module } from '@nestjs/common';
import { AccessTokens } from './auth/access-tokens.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { JwtTokenVerifier } from './auth/jwt-token-verifier.js';
import { PasswordHasher } from './auth/password-hasher.js';
import { SessionsRepository } from './auth/sessions.repository.js';
import { AdminSeeder } from './seeds/admin.seeder.js';
import { DemoUsersSeeder } from './seeds/demo-users.seeder.js';
import { ShowcaseUsersSeeder } from './seeds/showcase-users.seeder.js';
import { UserDirectory } from './users/user-directory.js';
import { RolesController, UsersController } from './users/users.controller.js';
import { UsersRepository } from './users/users.repository.js';
import { UsersService } from './users/users.service.js';

@Module({
  controllers: [AuthController, UsersController, RolesController],
  providers: [
    AccessTokens,
    PasswordHasher,
    JwtTokenVerifier,
    AuthService,
    UsersService,
    AdminSeeder,
    DemoUsersSeeder,
    ShowcaseUsersSeeder,
    UserDirectory,
    UsersRepository,
    SessionsRepository,
  ],
  exports: [JwtTokenVerifier, UserDirectory],
})
export class IdentityModule {}
