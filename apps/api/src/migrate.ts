import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import { sql } from 'kysely';
import { Logger } from 'nestjs-pino';
import pino from 'pino';
import { AppConfig } from './platform/config/app-config.js';
import { createKysely } from './platform/db/database.js';
import { runSeeds } from './seed.js';
import { SeedModule } from './seed.module.js';

// Creates the schema on an empty database and loads data.
//   node dist/migrate.js              schema
//   node dist/migrate.js --seed       + initial administrator
//   node dist/migrate.js --demo       + the proposal's demo data
//   node dist/migrate.js --showcase   + extra volume on top of the demo
const logger = pino({
  base: { service: 'nowcleanny-migrate' },
  timestamp: pino.stdTimeFunctions.isoTime,
});
const showcase = process.argv.includes('--showcase');
const demo = showcase || process.argv.includes('--demo');
const seed = demo || process.argv.includes('--seed');

try {
  const config = AppConfig.fromEnv(process.env);
  const db = createKysely(config);
  const exists = await sql<{
    exists: boolean;
  }>`SELECT to_regclass('public.products') IS NOT NULL AS exists`.execute(db);
  if (exists.rows[0]?.exists) {
    logger.info('El esquema ya existe.');
  } else {
    const schema = await readFile(new URL('./platform/db/schema.sql', import.meta.url), 'utf8');
    await db.transaction().execute((trx) => sql.raw(schema).execute(trx));
    logger.info('Esquema creado.');
  }
  await db.destroy();

  if (seed) {
    const app = await NestFactory.createApplicationContext(SeedModule, { bufferLogs: true });
    app.useLogger(app.get(Logger));
    await runSeeds(app, { demo, showcase });
    await app.close();
    logger.info(demo ? 'Semillas y datos de demo cargados.' : 'Semillas cargadas.');
  }
} catch (error) {
  logger.error({ err: error }, 'Falló la migración');
  process.exitCode = 1;
}
