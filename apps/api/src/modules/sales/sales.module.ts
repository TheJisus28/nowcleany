import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/index.js';
import { InventoryModule } from '../inventory/index.js';
import { ProductModule } from '../product/index.js';
import { CustomersController } from './customers/customers.controller.js';
import { CustomersRepository } from './customers/customers.repository.js';
import { CustomersService } from './customers/customers.service.js';
import { SalesDirectory } from './directory/sales-directory.js';
import { SalesOrdersController } from './orders/sales-orders.controller.js';
import { SalesOrdersRepository } from './orders/sales-orders.repository.js';
import { SalesOrdersService } from './orders/sales-orders.service.js';
import { DemoOrdersSeeder } from './seeds/demo-orders.seeder.js';
import { ShowcaseOrdersSeeder } from './seeds/showcase-orders.seeder.js';

@Module({
  imports: [ProductModule, InventoryModule, IdentityModule],
  controllers: [CustomersController, SalesOrdersController],
  providers: [
    CustomersService,
    SalesOrdersService,
    SalesDirectory,
    DemoOrdersSeeder,
    ShowcaseOrdersSeeder,
    CustomersRepository,
    SalesOrdersRepository,
  ],
  exports: [SalesDirectory],
})
export class SalesModule {}
