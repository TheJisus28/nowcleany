import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/index.js';
import { ProductModule } from '../product/index.js';
import { PurchasingBook } from './book/purchasing-book.js';
import { PurchaseOrdersController } from './orders/purchase-orders.controller.js';
import { PurchaseOrdersRepository } from './orders/purchase-orders.repository.js';
import { PurchaseOrdersService } from './orders/purchase-orders.service.js';
import { DemoPurchasesSeeder } from './seeds/demo-purchases.seeder.js';
import { ShowcasePurchasesSeeder } from './seeds/showcase-purchases.seeder.js';

@Module({
  imports: [ProductModule, InventoryModule],
  controllers: [PurchaseOrdersController],
  providers: [
    PurchaseOrdersService,
    PurchasingBook,
    DemoPurchasesSeeder,
    ShowcasePurchasesSeeder,
    PurchaseOrdersRepository,
  ],
  exports: [PurchasingBook],
})
export class PurchasingModule {}
