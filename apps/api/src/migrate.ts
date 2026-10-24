import 'reflect-metadata';
import pino from 'pino';
import { migrationSets } from './module-registry.js';
import { AppConfig } from './platform/config/app-config.js';
import { migrate } from './platform/db/migrator.js';

// The only entry point that touches the schema, and the only one using the owner role.
const logger = pino({
  base: { service: 'nowcleanny-migrate' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

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
} catch (error) {
  logger.error({ err: error }, 'Falló la migración');
  process.exitCode = 1;
}
