import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { AppConfig } from '../config/app-config.js';

type TypeId = Parameters<typeof pg.types.getTypeParser>[0];

/**
 * Per-pool type parsers: int8 → bigint (quantities are never `number`) and date → "YYYY-MM-DD"
 * (pg would otherwise build a Date in the server's local time zone).
 */
const typeParsers = {
  getTypeParser(oid: TypeId, format?: 'text' | 'binary'): (value: string) => unknown {
    if (oid === pg.types.builtins.INT8) return (value) => BigInt(value);
    if (oid === pg.types.builtins.DATE) return (value) => value;
    return pg.types.getTypeParser(oid, format) as (value: string) => unknown;
  },
};

export function createPool(
  config: AppConfig,
  user: string,
  password: string,
  applicationName: string,
) {
  return new pg.Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user,
    password,
    max: config.database.poolMax,
    application_name: applicationName,
    types: typeParsers,
  });
}

/** One pool (and Kysely instance) per module, each connecting with that module's own role. */
@Injectable()
export class DatabasePools implements OnApplicationShutdown {
  // Each module types its own instance (Kysely<ModuleTables>); the registry itself is untyped.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly instances = new Map<string, Kysely<any>>();

  constructor(private readonly config: AppConfig) {}

  kysely<DB>(module: string): Kysely<DB> {
    let instance = this.instances.get(module);
    if (!instance) {
      const { user, password } = this.config.credentialsFor(module);
      const pool = createPool(this.config, user, password, `nowcleanny:${module}`);
      instance = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
      this.instances.set(module, instance);
    }
    return instance as Kysely<DB>;
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([...this.instances.values()].map((db) => db.destroy()));
    this.instances.clear();
  }
}
