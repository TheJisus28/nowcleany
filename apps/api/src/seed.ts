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
import { DemoPurchasesSeeder } from './modules/purchasing/seeds/demo-purchases.seeder.js';
import { ShowcasePurchasesSeeder } from './modules/purchasing/seeds/showcase-purchases.seeder.js';
import { DemoOrdersSeeder } from './modules/sales/seeds/demo-orders.seeder.js';
import { ShowcaseOrdersSeeder } from './modules/sales/seeds/showcase-orders.seeder.js';
import { systemActor } from './platform/security/actor.js';
import { CurrentActor } from './platform/security/current-actor.js';

type Profile = 'base' | 'demo' | 'showcase';
type Step = readonly [
  name: string,
  profile: Profile,
  run: (app: INestApplicationContext) => Promise<void>,
];

/**
 * Seeds in order: base (administrator), demo (the proposal's example) and showcase (extra volume).
 * Every step is idempotent. The order matters: products before stock, orders before dispatches.
 */
const STEPS: readonly Step[] = [
  ['administrador', 'base', (app) => app.get(AdminSeeder).seed()],
  ['usuarios de demo', 'demo', (app) => app.get(DemoUsersSeeder).seed()],
  ['usuarios adicionales', 'showcase', (app) => app.get(ShowcaseUsersSeeder).seed()],
  ['catálogo de demo', 'demo', (app) => app.get(DemoCatalogSeeder).seed()],
  ['catálogo ampliado', 'showcase', (app) => app.get(ShowcaseCatalogSeeder).seed()],
  ['inventario de demo', 'demo', (app) => app.get(DemoStockSeeder).seed()],
  ['inventario ampliado', 'showcase', (app) => app.get(ShowcaseStockSeeder).seed()],
  ['preventas de demo', 'demo', (app) => app.get(DemoOrdersSeeder).seed()],
  ['preventas adicionales', 'showcase', (app) => app.get(ShowcaseOrdersSeeder).seed()],
  ['producción de demo', 'demo', (app) => app.get(DemoProductionSeeder).seed()],
  ['compras de demo', 'demo', (app) => app.get(DemoPurchasesSeeder).seed()],
  ['producción adicional', 'showcase', (app) => app.get(ShowcaseProductionSeeder).seed()],
  ['compras adicionales', 'showcase', (app) => app.get(ShowcasePurchasesSeeder).seed()],
  ['entrega a despacho', 'showcase', (app) => app.get(ShowcaseStockSeeder).handOver()],
  ['despachos del día', 'showcase', (app) => app.get(ShowcaseOrdersSeeder).dispatchToday()],
];

export async function runSeeds(
  app: INestApplicationContext,
  options: { demo: boolean; showcase: boolean },
): Promise<void> {
  const logger = new Logger('seed');
  const actor = systemActor('seed', allPermissions(), 'Carga inicial');
  const currentActor = app.get(CurrentActor);
  for (const [name, profile, run] of STEPS) {
    if (profile === 'demo' && !options.demo) continue;
    if (profile === 'showcase' && !options.showcase) continue;
    await currentActor.runAs(actor, () => run(app));
    logger.log(`Semilla aplicada: ${name}`);
  }
}
