import { fileURLToPath } from 'node:url';
import type { MigrationSet } from './platform/db/migrator.js';

/** Modules that own a schema, a role and migrations, in migration order (after "platform"). */
export const DATABASE_MODULES: readonly string[] = ['identity', 'product', 'inventory', 'sales'];

export function migrationSets(): MigrationSet[] {
  return [
    {
      name: 'platform',
      directory: fileURLToPath(new URL('./platform/db/migrations/', import.meta.url)),
    },
    ...DATABASE_MODULES.map((name) => ({
      name,
      directory: fileURLToPath(new URL(`./modules/${name}/migrations/`, import.meta.url)),
    })),
  ];
}
