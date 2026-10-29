import { IdentityModule } from './modules/identity/index.js';
import { InventoryModule } from './modules/inventory/index.js';
import { MapsModule } from './modules/maps/maps.module.js';
import { PlanningModule } from './modules/planning/index.js';
import { ProductModule } from './modules/product/index.js';
import { ProductionModule } from './modules/production/index.js';
import { PurchasingModule } from './modules/purchasing/index.js';
import { SalesModule } from './modules/sales/index.js';

/** Business modules loaded by the API and the seed script. */
export const FEATURE_MODULES = [
  IdentityModule,
  ProductModule,
  InventoryModule,
  SalesModule,
  ProductionModule,
  PurchasingModule,
  PlanningModule,
  MapsModule,
];
