import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/index.js';
import { InventoryModule } from '../inventory/index.js';
import { ProductModule } from '../product/index.js';
import { CustomersController } from './customers/customers.controller.js';
import { CustomersRepository } from './customers/customers.repository.js';
import { CustomersService } from './customers/customers.service.js';
import { SellersController } from './customers/sellers.controller.js';
import { SalesDirectory } from './directory/sales-directory.js';
import { SalesOrdersController } from './orders/sales-orders.controller.js';
import { SalesOrdersRepository } from './orders/sales-orders.repository.js';
import { SalesOrdersService } from './orders/sales-orders.service.js';
import { VisitsController } from './visits/visits.controller.js';
import { VisitsRepository } from './visits/visits.repository.js';
import { VisitsService } from './visits/visits.service.js';
import { DemoOrdersSeeder } from './seeds/demo-orders.seeder.js';
import { PortfolioLoader } from './seeds/portfolio-loader.js';
import { ShowcaseOrdersSeeder } from './seeds/showcase-orders.seeder.js';

@Module({
  imports: [ProductModule, InventoryModule, IdentityModule],
  controllers: [CustomersController, SellersController, SalesOrdersController, VisitsController],
  providers: [
    CustomersService,
    SalesOrdersService,
    SalesDirectory,
    PortfolioLoader,
    DemoOrdersSeeder,
    ShowcaseOrdersSeeder,
    CustomersRepository,
    SalesOrdersRepository,
    VisitsService,
    VisitsRepository,
  ],
  exports: [SalesDirectory],
})
export class SalesModule {}
