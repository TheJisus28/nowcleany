import { type INestApplicationContext, Logger } from '@nestjs/common';
import { allPermissions } from './modules/identity/access.js';
import { AdminSeeder } from './modules/identity/seeds/admin.seeder.js';
import { DemoUsersSeeder } from './modules/identity/seeds/demo-users.seeder.js';
import { ShowcaseUsersSeeder } from './modules/identity/seeds/showcase-users.seeder.js';
import { DemoStockSeeder } from './modules/inventory/seeds/demo-stock.seeder.js';
import { ShowcaseStockSeeder } from './modules/inventory/seeds/showcase-stock.seeder.js';
import { DemoCatalogSeeder } from './modules/product/seeds/demo-catalog.seeder.js';
import { ShowcaseCatalogSeeder } from './modules/product/seeds/showcase-catalog.seeder.js';
import { DemoProductionSeeder } from './modules/production/seeds/demo-production.seeder.js';
import { ShowcaseProductionSeeder } from './modules/production/seeds/showcase-production.seeder.js';
import { HistorySeeder } from './modules/demo/history.seeder.js';
import { PipelineSeeder } from './modules/demo/pipeline.seeder.js';
import { DemoCustomersSeeder } from './modules/sales/seeds/demo-customers.seeder.js';
import { ShowcaseCustomersSeeder } from './modules/sales/seeds/showcase-customers.seeder.js';
import { systemActor } from './platform/security/actor.js';
import { CurrentActor } from './platform/security/current-actor.js';

type Profile = 'base' | 'users' | 'demo' | 'showcase';
type Step = readonly [
  name: string,
  profile: Profile,
  run: (app: INestApplicationContext) => Promise<void>,
];

/**
 * Seeds in order: base (administrator), users (one per role), demo (the proposal's example) and
 * showcase (extra volume).
 * The order matters: products before stock, customers before orders, history before today.
 */
const STEPS: readonly Step[] = [
  ['administrador', 'base', (app) => app.get(AdminSeeder).seed()],
  ['usuarios de demo', 'users', (app) => app.get(DemoUsersSeeder).seed()],
  ['usuarios adicionales', 'users', (app) => app.get(ShowcaseUsersSeeder).seed()],
  ['catálogo de demo', 'demo', (app) => app.get(DemoCatalogSeeder).seed()],
  ['catálogo ampliado', 'showcase', (app) => app.get(ShowcaseCatalogSeeder).seed()],
  ['inventario de demo', 'demo', (app) => app.get(DemoStockSeeder).seed()],
  ['inventario ampliado', 'showcase', (app) => app.get(ShowcaseStockSeeder).seed()],
  ['clientes de demo', 'demo', (app) => app.get(DemoCustomersSeeder).seed()],
  ['clientes adicionales y visitas', 'showcase', (app) => app.get(ShowcaseCustomersSeeder).seed()],
  ['producción de demo', 'demo', (app) => app.get(DemoProductionSeeder).seed()],
  ['producción adicional', 'showcase', (app) => app.get(ShowcaseProductionSeeder).seed()],
  ['historia de seis meses', 'showcase', (app) => app.get(HistorySeeder).seed()],
  ['operación de hoy', 'showcase', (app) => app.get(PipelineSeeder).seed()],
];

export async function runSeeds(
  app: INestApplicationContext,
  options: { users: boolean; demo: boolean; showcase: boolean },
): Promise<void> {
  const logger = new Logger('seed');
  const actor = systemActor('seed', allPermissions(), 'Carga inicial');
  const currentActor = app.get(CurrentActor);
  for (const [name, profile, run] of STEPS) {
    if (profile === 'users' && !options.users) continue;
    if (profile === 'demo' && !options.demo) continue;
    if (profile === 'showcase' && !options.showcase) continue;
    await currentActor.runAs(actor, () => run(app));
    logger.log(`Semilla aplicada: ${name}`);
  }
}
