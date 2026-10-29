import { Logger } from '@nestjs/common';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { AppConfig } from '../config/app-config.js';

/** Injection token of the single Kysely instance (one pool, one schema). */
export const KYSELY = 'platform.kysely';

type TypeId = Parameters<typeof pg.types.getTypeParser>[0];

/**
 * int8 → bigint (quantities are never `number`) and date → "YYYY-MM-DD" (pg would otherwise build a
 * Date in the server's local time zone).
 */
const typeParsers = {
  getTypeParser(oid: TypeId, format?: 'text' | 'binary'): (value: string) => unknown {
    if (oid === pg.types.builtins.INT8) return (value) => BigInt(value);
    if (oid === pg.types.builtins.DATE) return (value) => value;
    return pg.types.getTypeParser(oid, format) as (value: string) => unknown;
  },
};

export function createPool(config: AppConfig, applicationName: string): pg.Pool {
  const { poolMax, ...connection } = config.database;
  const pool = new pg.Pool({
    ...connection,
    max: poolMax,
    application_name: applicationName,
    types: typeParsers,
  });
  // An idle connection dropped by the server (restart, network) must not crash the process.
  pool.on('error', (error) => {
    new Logger('platform').warn(`Conexión a la base de datos perdida: ${error.message}`);
  });
  return pool;
}

// Every feature types the instance with its own tables; the instance itself is shared.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createKysely(config: AppConfig): Kysely<any> {
  return new Kysely({ dialect: new PostgresDialect({ pool: createPool(config, 'nowcleanny') }) });
}
