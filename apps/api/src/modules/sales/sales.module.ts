import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../platform/db/database.module.js';
import { IdentityModule } from '../identity/index.js';
import { InventoryModule } from '../inventory/index.js';
import { ProductModule } from '../product/index.js';
import { CustomersController } from './customers/customers.controller.js';
import { CustomersRepository } from './customers/customers.repository.js';
import { CustomersService } from './customers/customers.service.js';
import { KyselyCustomersRepository } from './customers/kysely-customers.repository.js';
import { SalesDirectory } from './directory/sales-directory.js';
import { KyselySalesOrdersRepository } from './orders/kysely-sales-orders.repository.js';
import { SalesOrdersController } from './orders/sales-orders.controller.js';
import { SalesOrdersRepository } from './orders/sales-orders.repository.js';
import { SalesOrdersService } from './orders/sales-orders.service.js';
import { StaleDraftsJob } from './orders/stale-drafts.job.js';
import { SalesPermissions } from './permissions.js';
import { DemoOrdersSeeder } from './seeds/demo-orders.seeder.js';
import { ShowcaseOrdersSeeder } from './seeds/showcase-orders.seeder.js';

@Module({
  imports: [DatabaseModule.forModule('sales'), ProductModule, InventoryModule, IdentityModule],
  controllers: [CustomersController, SalesOrdersController],
  providers: [
    SalesPermissions,
    CustomersService,
    SalesOrdersService,
    SalesDirectory,
    StaleDraftsJob,
    DemoOrdersSeeder,
    ShowcaseOrdersSeeder,
    { provide: CustomersRepository, useClass: KyselyCustomersRepository },
    { provide: SalesOrdersRepository, useClass: KyselySalesOrdersRepository },
  ],
  exports: [SalesDirectory],
})
export class SalesModule {}
