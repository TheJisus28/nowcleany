import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { roleName } from '../config/app-config.js';

export interface MigrationSet {
  /** Module name; also the schema name and the suffix of its role (app_<name>). */
  readonly name: string;
  /** Absolute directory holding NNNN_description.sql files. */
  readonly directory: string;
}

export interface MigrationLogger {
  info(message: string): void;
}

export interface MigrateOptions {
  readonly connection: pg.ClientConfig;
  /** "platform" first, then the modules. */
  readonly sets: readonly MigrationSet[];
  readonly passwordFor: (module: string) => string;
  readonly logger: MigrationLogger;
}

const PLATFORM = 'platform';

/**
 * Applies migrations as the owner role. For each set it provisions the schema and a login role that can
 * only touch its own schema (plus INSERT into platform.outbox), then runs pending files in order.
 * Applied files are recorded with a checksum; editing an applied migration is an error.
 */
export async function migrate(options: MigrateOptions): Promise<string[]> {
  const [first] = options.sets;
  if (first?.name !== PLATFORM) {
    throw new Error('El primer conjunto de migraciones debe ser "platform".');
  }
  const client = new pg.Client(options.connection);
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('nowcleanny.migrate'))");
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS platform;
      CREATE TABLE IF NOT EXISTS platform.schema_migrations (
        set_name   text        NOT NULL,
        filename   text        NOT NULL,
        checksum   text        NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (set_name, filename)
      );`);
    for (const set of options.sets) {
      await provisionRole(client, set.name, options.passwordFor(set.name), options.connection);
      applied.push(...(await applySet(client, set, options.logger)));
    }
  } finally {
    await client
      .query("SELECT pg_advisory_unlock(hashtext('nowcleanny.migrate'))")
      .catch(() => undefined);
    await client.end();
  }
  return applied;
}

async function provisionRole(
  client: pg.Client,
  module: string,
  password: string,
  connection: pg.ClientConfig,
): Promise<void> {
  const role = client.escapeIdentifier(roleName(module));
  const schema = client.escapeIdentifier(module);
  const database = client.escapeIdentifier(String(connection.database));
  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = ${client.escapeLiteral(roleName(module))}) THEN
        CREATE ROLE ${role};
      END IF;
    END $$;
    ALTER ROLE ${role} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
      PASSWORD ${client.escapeLiteral(password)};
    ALTER ROLE ${role} SET search_path = ${schema};
    GRANT CONNECT ON DATABASE ${database} TO ${role};
    CREATE SCHEMA IF NOT EXISTS ${schema};
    REVOKE ALL ON SCHEMA ${schema} FROM PUBLIC;
    GRANT USAGE ON SCHEMA ${schema} TO ${role};
    ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema}
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role};
    ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema}
      GRANT USAGE, SELECT ON SEQUENCES TO ${role};
  `);
  if (module !== PLATFORM) {
    // Modules publish events but can neither read nor change the outbox.
    await client.query(`
      GRANT USAGE ON SCHEMA platform TO ${role};
      GRANT INSERT ON platform.outbox TO ${role};
    `);
  }
}

async function applySet(
  client: pg.Client,
  set: MigrationSet,
  logger: MigrationLogger,
): Promise<string[]> {
  const files = (await readdir(set.directory))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();
  const { rows } = await client.query<{ filename: string; checksum: string }>(
    'SELECT filename, checksum FROM platform.schema_migrations WHERE set_name = $1',
    [set.name],
  );
  const recorded = new Map(rows.map((row) => [row.filename, row.checksum]));
  const applied: string[] = [];

  for (const file of files) {
    const sql = await readFile(join(set.directory, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const previous = recorded.get(file);
    if (previous !== undefined) {
      if (previous !== checksum) {
        throw new Error(
          `La migración ${set.name}/${file} cambió después de aplicarse. Crea una migración nueva en vez de editarla.`,
        );
      }
      continue;
    }
    await client.query('BEGIN');
    try {
      await client.query(`SET LOCAL search_path TO ${client.escapeIdentifier(set.name)}`);
      await client.query(sql);
      await client.query(
        'INSERT INTO platform.schema_migrations (set_name, filename, checksum) VALUES ($1, $2, $3)',
        [set.name, file, checksum],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Falló la migración ${set.name}/${file}: ${(error as Error).message}`, {
        cause: error,
      });
    }
    logger.info(`Migración aplicada: ${set.name}/${file}`);
    applied.push(`${set.name}/${file}`);
  }
  return applied;
}
