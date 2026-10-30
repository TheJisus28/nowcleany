// Public API of the sales module.
export {
  type OpenOrder,
  SalesDirectory,
  type SalesOrderRecord,
} from './directory/sales-directory.js';
export { CustomersService } from './customers/customers.service.js';
export { orderLabel } from './domain/sales-order.js';
export { SalesOrdersService } from './orders/sales-orders.service.js';
export { PortfolioLoader, type SeedOrder } from './seeds/portfolio-loader.js';
export { SalesModule } from './sales.module.js';
