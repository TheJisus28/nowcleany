import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import pino from 'pino';
import { migrationSets } from './module-registry.js';
import { AppConfig } from './platform/config/app-config.js';
import { migrate } from './platform/db/migrator.js';
import { SeedRunner } from './platform/seeding/seeder.js';
import { SeedModule } from './seed.module.js';

// The only entry point that touches the schema, and the only one using the owner role.
//   node dist/migrate.js           migrations
//   node dist/migrate.js --seed    + reference data and initial administrator
//   node dist/migrate.js --demo    + illustrative demo data (implies --seed)
const logger = pino({
  base: { service: 'nowcleanny-migrate' },
  timestamp: pino.stdTimeFunctions.isoTime,
});
const demo = process.argv.includes('--demo');
const seed = demo || process.argv.includes('--seed');

try {
  const config = AppConfig.fromEnv(process.env);
  const owner = config.ownerCredentials();
  const applied = await migrate({
    connection: {
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      user: owner.user,
      password: owner.password,
    },
    sets: migrationSets(),
    passwordFor: (module) => config.credentialsFor(module).password,
    logger: {
      info: (message) => {
        logger.info(message);
      },
    },
  });
  logger.info(
    applied.length > 0
      ? `Listo: ${String(applied.length)} migración(es) aplicada(s).`
      : 'La base de datos ya estaba al día.',
  );

  if (seed) {
    const app = await NestFactory.createApplicationContext(SeedModule, { bufferLogs: true });
    app.useLogger(app.get(Logger));
    await app.get(SeedRunner).run({ demo });
    await app.close();
    logger.info(demo ? 'Semillas y datos de demo cargados.' : 'Semillas cargadas.');
  }
} catch (error) {
  logger.error({ err: error }, 'Falló la migración');
  process.exitCode = 1;
}
