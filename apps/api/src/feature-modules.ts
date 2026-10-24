import { IdentityModule } from './modules/identity/index.js';
import { InventoryModule } from './modules/inventory/index.js';
import { ProductModule } from './modules/product/index.js';
import { SalesModule } from './modules/sales/index.js';

/** Business modules loaded by the API, the worker and the seed script. */
export const FEATURE_MODULES = [IdentityModule, ProductModule, InventoryModule, SalesModule];
