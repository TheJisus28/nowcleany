import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../platform/db/database.module.js';
import { InventoryModule } from '../inventory/index.js';
import { ProductModule } from '../product/index.js';
import { PurchasingBook } from './book/purchasing-book.js';
import { KyselyPurchaseOrdersRepository } from './orders/kysely-purchase-orders.repository.js';
import { PurchaseOrdersController } from './orders/purchase-orders.controller.js';
import { PurchaseOrdersRepository } from './orders/purchase-orders.repository.js';
import { PurchaseOrdersService } from './orders/purchase-orders.service.js';
import { PurchasingPermissions } from './permissions.js';
import { DemoPurchasesSeeder } from './seeds/demo-purchases.seeder.js';
import { ShowcasePurchasesSeeder } from './seeds/showcase-purchases.seeder.js';

@Module({
  imports: [DatabaseModule.forModule('purchasing'), ProductModule, InventoryModule],
  controllers: [PurchaseOrdersController],
  providers: [
    PurchasingPermissions,
    PurchaseOrdersService,
    PurchasingBook,
    DemoPurchasesSeeder,
    ShowcasePurchasesSeeder,
    { provide: PurchaseOrdersRepository, useClass: KyselyPurchaseOrdersRepository },
  ],
  exports: [PurchasingBook],
})
export class PurchasingModule {}
