import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { inject } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DATABASE_MODULES, migrationSets } from '../../module-registry.js';
import { migrate } from '../../platform/db/migrator.js';
import { configureHttp } from '../../platform/http/configure-http.js';
import { requestIdFor } from '../../platform/logging/logging.js';
import { SeedRunner } from '../../platform/seeding/seeder.js';
import { SeedModule } from '../../seed.module.js';

export const DEMO_PASSWORD = 'Demo.E2E.2026';

/** Points the configuration at the Testcontainers database (read by AppConfig.fromEnv). */
export function useTestDatabase(): void {
  const db = inject('postgres');
  Object.assign(process.env, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DB_HOST: db.host,
    DB_PORT: String(db.port),
    DB_NAME: db.database,
    DB_OWNER_USER: db.user,
    DB_OWNER_PASSWORD: db.password,
    JWT_SECRET: 'e2e-secret-with-at-least-thirty-two-characters',
    ADMIN_EMAIL: 'admin@e2e.local',
    ADMIN_PASSWORD: 'Admin.E2E.2026',
    ADMIN_NAME: 'Administrador E2E',
    DEMO_PASSWORD,
    DB_PASSWORD_PLATFORM: 'e2e_platform',
    ...Object.fromEntries(
      DATABASE_MODULES.map((m) => [`DB_PASSWORD_${m.toUpperCase()}`, `e2e_${m}`]),
    ),
  });
}

/** Same steps as `pnpm db:demo`: migrations from scratch, then reference and demo data. */
export async function migrateAndSeed(): Promise<void> {
  const env = process.env;
  await migrate({
    connection: {
      host: env['DB_HOST'],
      port: Number(env['DB_PORT']),
      database: env['DB_NAME'],
      user: env['DB_OWNER_USER'],
      password: env['DB_OWNER_PASSWORD'],
    },
    sets: migrationSets(),
    passwordFor: (module) => env[`DB_PASSWORD_${module.toUpperCase()}`] ?? '',
    logger: { info: () => undefined },
  });
  const seeder = await NestFactory.createApplicationContext(SeedModule, { logger: false });
  await seeder.get(SeedRunner).run({ demo: true });
  await seeder.close();
}

export async function createApi(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ genReqId: requestIdFor, requestIdHeader: false }),
    { logger: false },
  );
  await configureHttp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

export interface Client {
  get<T = unknown>(url: string): Promise<Response<T>>;
  post<T = unknown>(url: string, body?: unknown): Promise<Response<T>>;
}

export interface Response<T> {
  readonly status: number;
  readonly body: T;
}

export async function login(
  app: NestFastifyApplication,
  email: string,
  password = DEMO_PASSWORD,
): Promise<Client> {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { email, password },
  });
  if (response.statusCode !== 200) throw new Error(`Login falló para ${email}: ${response.body}`);
  const token = response.json<{ accessToken: string }>().accessToken;
  const call = async <T>(
    method: 'GET' | 'POST',
    url: string,
    body?: unknown,
  ): Promise<Response<T>> => {
    const reply = await app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
    });
    return { status: reply.statusCode, body: reply.body ? reply.json<T>() : (undefined as T) };
  };
  return { get: (url) => call('GET', url), post: (url, body) => call('POST', url, body ?? {}) };
}
