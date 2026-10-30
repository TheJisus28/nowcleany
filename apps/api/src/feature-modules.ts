import { AuditModule } from './modules/audit/index.js';
import { BillingModule } from './modules/billing/index.js';
import { DemoModule } from './modules/demo/demo.module.js';
import { IdentityModule } from './modules/identity/index.js';
import { InventoryModule } from './modules/inventory/index.js';
import { LogisticsModule } from './modules/logistics/index.js';
import { MapsModule } from './modules/maps/maps.module.js';
import { PlanningModule } from './modules/planning/index.js';
import { ProductModule } from './modules/product/index.js';
import { ProductionModule } from './modules/production/index.js';
import { PurchasingModule } from './modules/purchasing/index.js';
import { SalesModule } from './modules/sales/index.js';

/** Business modules loaded by the API and the seed script. */
export const FEATURE_MODULES = [
  AuditModule,
  IdentityModule,
  ProductModule,
  InventoryModule,
  SalesModule,
  ProductionModule,
  PurchasingModule,
  PlanningModule,
  BillingModule,
  LogisticsModule,
  MapsModule,
  DemoModule,
];
