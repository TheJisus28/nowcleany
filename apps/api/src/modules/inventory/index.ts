// Public API of the inventory module.
export { DISPATCH_WAREHOUSE, PLANT_WAREHOUSE } from './domain/stock.js';
export { InventoryModule } from './inventory.module.js';
export { InventoryLedger, type StockLevel } from './ledger/inventory-ledger.js';
export type { OperationResult, Reference, StockLine } from './stock/stock.service.js';
