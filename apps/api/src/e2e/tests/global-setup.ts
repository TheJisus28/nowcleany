import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    postgres: { host: string; port: number; database: string; user: string; password: string };
  }
}

let container: StartedPostgreSqlContainer | undefined;

/** One disposable PostgreSQL 18 for the whole end-to-end run. */
export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer('postgres:18.6-alpine')
    .withDatabase('scip_e2e')
    .withUsername('scip_owner')
    .withPassword('e2e_owner_password')
    .start();
  project.provide('postgres', {
    host: container.getHost(),
    port: container.getPort(),
    database: container.getDatabase(),
    user: container.getUsername(),
    password: container.getPassword(),
  });
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
